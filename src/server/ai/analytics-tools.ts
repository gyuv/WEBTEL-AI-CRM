import { z } from "zod";
import type { LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveRange } from "@/lib/date-range";
import { OPEN_STATUSES } from "@/lib/funnel";
import type { Actor } from "@/server/session";
import { leadScope } from "@/server/services/access";
import { campaignPerformance, sourcePerformance, type SourcePerformanceRow } from "@/server/services/analytics";

/**
 * Controlled, read-only analytics functions the AI assistant may call.
 * The model never writes SQL; it can only choose one of these tools and its typed arguments.
 */

export const periodEnum = z.enum(["today", "week", "month", "last_month", "year", "all"]).default("all");
export type Period = z.infer<typeof periodEnum>;

function periodRange(p: Period) {
  if (p === "year") {
    const now = new Date();
    return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) };
  }
  return resolveRange(p);
}

export const sourceMetricEnum = z.enum(["leads", "won", "sales", "average_deal", "conversion", "quotations", "demos", "pipeline"]);

const metricKey: Record<z.infer<typeof sourceMetricEnum>, keyof SourcePerformanceRow> = {
  leads: "totalLeads",
  won: "won",
  sales: "totalSales",
  average_deal: "averageDealValue",
  conversion: "conversionRate",
  quotations: "quotationsSent",
  demos: "demosScheduled",
  pipeline: "pipelineValue",
};

async function findSource(name: string) {
  const sources = await prisma.leadSource.findMany();
  const n = name.toLowerCase().trim();
  return (
    sources.find((s) => s.name.toLowerCase() === n) ??
    sources.find((s) => s.name.toLowerCase().startsWith(n) || n.startsWith(s.name.toLowerCase())) ??
    sources.find((s) => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase().split(" ")[0]))
  );
}

export const toolSchemas = {
  rank_sources: z.object({ metric: sourceMetricEnum, period: periodEnum, limit: z.number().int().min(1).max(25).default(10) }),
  source_stats: z.object({ source: z.string().min(1).max(100), period: periodEnum }),
  rank_campaigns: z.object({ metric: z.enum(["leads", "quotations", "won", "pipeline"]), period: periodEnum, limit: z.number().int().min(1).max(25).default(10) }),
  low_conversion_sources: z.object({ minLeads: z.number().int().min(1).max(1000).default(3), period: periodEnum }),
  count_leads: z.object({
    source: z.string().max(100).optional(),
    status: z.enum(["NEW", "CONTACTED", "INTERESTED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "QUOTATION_SENT", "NEGOTIATION", "WON", "LOST", "FOLLOW_UP"]).optional(),
    openOnly: z.boolean().default(false),
    notContacted: z.boolean().default(false),
    period: periodEnum,
  }),
  list_leads: z.object({
    source: z.string().max(100).optional(),
    status: z.enum(["NEW", "CONTACTED", "INTERESTED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "QUOTATION_SENT", "NEGOTIATION", "WON", "LOST", "FOLLOW_UP"]).optional(),
    openOnly: z.boolean().default(false),
    notContacted: z.boolean().default(false),
    period: periodEnum,
  }),
} as const;

export type ToolName = keyof typeof toolSchemas;

export const toolDescriptions: Record<ToolName, string> = {
  rank_sources: "Rank lead sources by a metric (leads, won deals, sales value, average deal value, conversion %, quotations, demos, pipeline value).",
  source_stats: "Full funnel and revenue statistics for one lead source (e.g. LinkedIn, Referral, Direct Visit).",
  rank_campaigns: "Rank campaigns by leads, quotations, won deals or pipeline value.",
  low_conversion_sources: "Find sources with many leads but low conversion rate.",
  count_leads: "Count leads, optionally by source / status / open-only / not-yet-contacted.",
  list_leads: "List up to 50 leads, optionally by source / status / open-only / not-yet-contacted.",
};

async function leadWhere(actor: Actor, a: z.infer<(typeof toolSchemas)["count_leads"]>) {
  const and: Prisma.LeadWhereInput[] = [leadScope(actor)];
  let sourceName: string | undefined;
  if (a.source) {
    const s = await findSource(a.source);
    if (!s) return { error: `No lead source named "${a.source}" exists.` } as const;
    and.push({ leadSourceId: s.id });
    sourceName = s.name;
  }
  if (a.status) and.push({ status: a.status as LeadStatus });
  if (a.openOnly) and.push({ status: { in: OPEN_STATUSES } });
  if (a.notContacted) and.push({ highestStageRank: 0, status: { not: "LOST" } });
  const r = periodRange(a.period);
  if (r.from || r.to) and.push({ createdAt: { ...(r.from ? { gte: r.from } : {}), ...(r.to ? { lt: r.to } : {}) } });
  return { where: { AND: and }, sourceName } as const;
}

export async function runTool(actor: Actor, name: ToolName, rawArgs: unknown): Promise<unknown> {
  switch (name) {
    case "rank_sources": {
      const a = toolSchemas.rank_sources.parse(rawArgs);
      const rows = await sourcePerformance(actor, { range: periodRange(a.period) });
      const k = metricKey[a.metric];
      return {
        metric: a.metric,
        period: a.period,
        results: rows
          .filter((r) => (r.totalLeads > 0 || r.totalSales > 0) && (a.metric === "leads" || (r[k] as number) > 0))
          .sort((x, y) => (y[k] as number) - (x[k] as number))
          .slice(0, a.limit)
          .map((r) => ({ source: r.name, value: r[k], leads: r.totalLeads, won: r.won, sales: r.totalSales, conversionRate: r.conversionRate })),
      };
    }
    case "source_stats": {
      const a = toolSchemas.source_stats.parse(rawArgs);
      const s = await findSource(a.source);
      if (!s) return { error: `No lead source named "${a.source}" exists.` };
      const rows = await sourcePerformance(actor, { range: periodRange(a.period), leadSourceId: s.id });
      return { period: a.period, stats: rows.find((r) => r.id === s.id) };
    }
    case "rank_campaigns": {
      const a = toolSchemas.rank_campaigns.parse(rawArgs);
      const rows = await campaignPerformance(actor, { range: periodRange(a.period) });
      return { metric: a.metric, period: a.period, results: [...rows].sort((x, y) => Number(y[a.metric]) - Number(x[a.metric])).slice(0, a.limit) };
    }
    case "low_conversion_sources": {
      const a = toolSchemas.low_conversion_sources.parse(rawArgs);
      const rows = await sourcePerformance(actor, { range: periodRange(a.period) });
      const eligible = rows.filter((r) => r.totalLeads >= a.minLeads);
      const avg = eligible.length ? eligible.reduce((s, r) => s + r.conversionRate, 0) / eligible.length : 0;
      return {
        period: a.period,
        averageConversionRate: Math.round(avg * 10) / 10,
        results: eligible
          .filter((r) => r.conversionRate <= avg)
          .sort((x, y) => y.totalLeads - x.totalLeads || x.conversionRate - y.conversionRate)
          .map((r) => ({ source: r.name, leads: r.totalLeads, won: r.won, conversionRate: r.conversionRate })),
      };
    }
    case "count_leads": {
      const a = toolSchemas.count_leads.parse(rawArgs);
      const w = await leadWhere(actor, a);
      if ("error" in w) return w;
      return { count: await prisma.lead.count({ where: w.where }), filters: { ...a, source: w.sourceName } };
    }
    case "list_leads": {
      const a = toolSchemas.list_leads.parse(rawArgs);
      const w = await leadWhere(actor, a);
      if ("error" in w) return w;
      const leads = await prisma.lead.findMany({
        where: w.where,
        take: 50,
        orderBy: { createdAt: "desc" },
        include: { leadSource: true },
      });
      return {
        filters: { ...a, source: w.sourceName },
        count: leads.length,
        leads: leads.map((l) => ({ id: l.id, name: l.name, company: l.companyName, source: l.leadSource.name, campaign: l.campaignName, status: l.status, createdAt: l.createdAt.toISOString().slice(0, 10) })),
      };
    }
  }
}

/** Deterministic intent router used when no LLM is configured (and as a safety net). */
export async function routeQuestion(question: string): Promise<{ tool: ToolName; args: Record<string, unknown> } | null> {
  const q = question.toLowerCase();
  const period: Period = /last month/.test(q) ? "last_month" : /this month|current month/.test(q) ? "month" : /this week/.test(q) ? "week" : /today/.test(q) ? "today" : /this year/.test(q) ? "year" : "all";

  const sources = await prisma.leadSource.findMany({ select: { name: true } });
  const aliases: Record<string, string> = { referrals: "Referral", "direct visits": "Direct Visit", exhibitions: "Exhibition / Event", exhibition: "Exhibition / Event", events: "Exhibition / Event", "cold calls": "Cold Call", partners: "Partner / Channel", partner: "Partner / Channel" };
  let source: string | undefined;
  for (const [alias, target] of Object.entries(aliases)) if (q.includes(alias)) source = target;
  if (!source) {
    const byLen = [...sources].sort((a, b) => b.name.length - a.name.length);
    source = byLen.find((s) => q.includes(s.name.toLowerCase()))?.name ?? byLen.find((s) => q.includes(s.name.toLowerCase().split(" ")[0]))?.name;
    if (source && /\b(source|sources)\b/.test(q) && !q.includes(source.toLowerCase())) source = undefined;
  }

  if (/campaign/.test(q)) {
    const metric = /quotation/.test(q) ? "quotations" : /won|deal/.test(q) ? "won" : /pipeline/.test(q) ? "pipeline" : "leads";
    return { tool: "rank_campaigns", args: { metric, period } };
  }
  if (/low conversion|many leads but|poor conversion|not converting/.test(q)) return { tool: "low_conversion_sources", args: { period } };
  const notContacted = /not (been )?contacted|uncontacted|haven'?t contacted/.test(q);
  const openOnly = /still open|open leads|\bopen\b/.test(q);
  if (/^(show|list)|which leads|all leads/.test(q) && (notContacted || openOnly || source)) {
    return { tool: "list_leads", args: { source, notContacted, openOnly, period } };
  }
  if (/how many/.test(q)) return { tool: "count_leads", args: { source, notContacted, openOnly, period } };
  if (source && /conversion|rate|stats|perform|funnel/.test(q)) return { tool: "source_stats", args: { source, period } };
  if (/which source|top source|best source|sources by|lead source/.test(q) || /which .*source/.test(q)) {
    const metric = /average deal|avg deal|average/.test(q) ? "average_deal" : /sales value|highest sales|by sales|revenue|sales/.test(q) ? "sales" : /won/.test(q) ? "won" : /conversion/.test(q) ? "conversion" : /quotation/.test(q) ? "quotations" : /demo/.test(q) ? "demos" : /pipeline/.test(q) ? "pipeline" : "leads";
    return { tool: "rank_sources", args: { metric, period } };
  }
  if (source) return { tool: "source_stats", args: { source, period } };
  return null;
}
