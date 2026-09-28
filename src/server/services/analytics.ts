import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPEN_STATUSES, pct, RANK } from "@/lib/funnel";
import { rangeWhere, type DateRange } from "@/lib/date-range";
import type { Actor } from "@/server/session";
import { childScope, leadScope } from "./access";

export interface AnalyticsFilter {
  range?: DateRange;
  leadSourceId?: string;
  campaign?: string;
  assignedUserId?: string;
}

/** SQL fragment restricting leads (alias `l`) to the actor's scope and filters. */
function leadSqlConditions(actor: Actor, f: AnalyticsFilter, dateColumn = Prisma.sql`l."createdAt"`) {
  const parts: Prisma.Sql[] = [];
  if (actor.role !== "ADMIN") parts.push(Prisma.sql`(l."assignedUserId" = ${actor.id} OR l."assignedUserId" IS NULL)`);
  if (f.range?.from) parts.push(Prisma.sql`${dateColumn} >= ${f.range.from}`);
  if (f.range?.to) parts.push(Prisma.sql`${dateColumn} < ${f.range.to}`);
  if (f.leadSourceId) parts.push(Prisma.sql`l."leadSourceId" = ${f.leadSourceId}`);
  if (f.campaign) parts.push(Prisma.sql`l."campaignName" ILIKE ${"%" + f.campaign + "%"}`);
  if (f.assignedUserId) parts.push(Prisma.sql`l."assignedUserId" = ${f.assignedUserId}`);
  return parts;
}

const and = (parts: Prisma.Sql[]) => (parts.length ? Prisma.sql`AND ${Prisma.join(parts, " AND ")}` : Prisma.empty);

export interface SourcePerformanceRow {
  id: string;
  name: string;
  active: boolean;
  totalLeads: number;
  contacted: number;
  interested: number;
  demosScheduled: number;
  demosCompleted: number;
  quotationsSent: number;
  won: number;
  lost: number;
  open: number;
  pipelineValue: number;
  totalSales: number;
  salesCount: number;
  conversionRate: number;
  averageDealValue: number;
}

/**
 * Per-source funnel and revenue figures, computed live from the database.
 * Lead counts use leads created in the range; sales use sales dated in the range.
 */
export async function sourcePerformance(actor: Actor, f: AnalyticsFilter = {}): Promise<SourcePerformanceRow[]> {
  const leadCond = and(leadSqlConditions(actor, f));
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      active: boolean;
      total: number;
      contacted: number;
      interested: number;
      demo_s: number;
      demo_c: number;
      quotes: number;
      won: number;
      lost: number;
      open: number;
      pipeline: number;
    }[]
  >`
    SELECT ls.id, ls.name, ls.active,
      COUNT(l.id)::int AS total,
      COUNT(l.id) FILTER (WHERE l."highestStageRank" >= ${RANK.CONTACTED})::int AS contacted,
      COUNT(l.id) FILTER (WHERE l."highestStageRank" >= ${RANK.INTERESTED})::int AS interested,
      COUNT(l.id) FILTER (WHERE l."highestStageRank" >= ${RANK.DEMO})::int AS demo_s,
      COUNT(l.id) FILTER (WHERE l."highestStageRank" >= ${RANK.DEMO_COMPLETED})::int AS demo_c,
      COUNT(l.id) FILTER (WHERE l."highestStageRank" >= ${RANK.QUOTATION})::int AS quotes,
      COUNT(l.id) FILTER (WHERE l.status = 'WON')::int AS won,
      COUNT(l.id) FILTER (WHERE l.status = 'LOST')::int AS lost,
      COUNT(l.id) FILTER (WHERE l.status NOT IN ('WON','LOST'))::int AS open,
      COALESCE(SUM(l."estimatedValue") FILTER (WHERE l.status NOT IN ('WON','LOST')), 0)::float8 AS pipeline
    FROM lead_sources ls
    LEFT JOIN leads l ON l."leadSourceId" = ls.id ${leadCond}
    GROUP BY ls.id, ls.name, ls.active
    ORDER BY ls.name`;

  const saleCond = and(leadSqlConditions(actor, { ...f, range: undefined }).concat(saleRangeParts(f.range)));
  const sales = await prisma.$queryRaw<{ sid: string; total: number; n: number }[]>`
    SELECT l."leadSourceId" AS sid, COALESCE(SUM(s.amount),0)::float8 AS total, COUNT(s.id)::int AS n
    FROM sales s JOIN leads l ON l.id = s."leadId"
    WHERE TRUE ${saleCond}
    GROUP BY l."leadSourceId"`;
  const salesMap = new Map(sales.map((s) => [s.sid, s]));

  return rows.map((r) => {
    const s = salesMap.get(r.id);
    const totalSales = s?.total ?? 0;
    const dealCount = r.won || s?.n || 0;
    return {
      id: r.id,
      name: r.name,
      active: r.active,
      totalLeads: r.total,
      contacted: r.contacted,
      interested: r.interested,
      demosScheduled: r.demo_s,
      demosCompleted: r.demo_c,
      quotationsSent: r.quotes,
      won: r.won,
      lost: r.lost,
      open: r.open,
      pipelineValue: Number(r.pipeline),
      totalSales,
      salesCount: s?.n ?? 0,
      conversionRate: pct(r.won, r.total),
      averageDealValue: dealCount ? Math.round(totalSales / dealCount) : 0,
    };
  });
}

function saleRangeParts(range?: DateRange) {
  const parts: Prisma.Sql[] = [];
  if (range?.from) parts.push(Prisma.sql`s."saleDate" >= ${range.from}`);
  if (range?.to) parts.push(Prisma.sql`s."saleDate" < ${range.to}`);
  return parts;
}

export interface Funnel {
  stages: { key: string; label: string; count: number }[];
  leadToDemo: number;
  demoToQuotation: number;
  quotationToWon: number;
  leadToWon: number;
}

export function funnelFromRow(r: Pick<SourcePerformanceRow, "totalLeads" | "contacted" | "interested" | "demosScheduled" | "quotationsSent" | "won">): Funnel {
  return {
    stages: [
      { key: "lead", label: "Lead", count: r.totalLeads },
      { key: "contacted", label: "Contacted", count: r.contacted },
      { key: "interested", label: "Interested", count: r.interested },
      { key: "demo", label: "Demo", count: r.demosScheduled },
      { key: "quotation", label: "Quotation", count: r.quotationsSent },
      { key: "won", label: "Won", count: r.won },
    ],
    leadToDemo: pct(r.demosScheduled, r.totalLeads),
    demoToQuotation: pct(r.quotationsSent, r.demosScheduled),
    quotationToWon: pct(r.won, r.quotationsSent),
    leadToWon: pct(r.won, r.totalLeads),
  };
}

export async function sourceFunnel(actor: Actor, f: AnalyticsFilter = {}): Promise<Funnel> {
  const rows = await sourcePerformance(actor, f);
  const sum = (k: keyof SourcePerformanceRow) => rows.reduce((a, r) => a + (r[k] as number), 0);
  return funnelFromRow({
    totalLeads: sum("totalLeads"),
    contacted: sum("contacted"),
    interested: sum("interested"),
    demosScheduled: sum("demosScheduled"),
    quotationsSent: sum("quotationsSent"),
    won: sum("won"),
  });
}

export async function dashboardSummary(actor: Actor, range: DateRange) {
  const scope = leadScope(actor);
  const cScope = childScope(actor);
  const created = rangeWhere(range);
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const leadWhere: Prisma.LeadWhereInput = { AND: [scope, created ? { createdAt: created } : {}] };

  const [totalLeads, newLeads, demos, negotiations, won, lost, followupsToday, quotationsPending, sales, monthSales, pipeline] =
    await Promise.all([
      prisma.lead.count({ where: leadWhere }),
      prisma.lead.count({ where: { AND: [leadWhere, { status: "NEW" }] } }),
      prisma.lead.count({ where: { AND: [leadWhere, { status: "DEMO_SCHEDULED" }] } }),
      prisma.lead.count({ where: { AND: [leadWhere, { status: "NEGOTIATION" }] } }),
      prisma.lead.count({ where: { AND: [leadWhere, { status: "WON" }] } }),
      prisma.lead.count({ where: { AND: [leadWhere, { status: "LOST" }] } }),
      prisma.followup.count({ where: { AND: [cScope, { status: "PENDING", followupDate: { gte: dayStart, lt: dayEnd } }] } }),
      prisma.quotation.count({ where: { AND: [cScope, { status: { in: ["DRAFT", "SENT"] } }, created ? { quotationDate: created } : {}] } }),
      prisma.sale.aggregate({ _sum: { amount: true }, where: { AND: [cScope, created ? { saleDate: created } : {}] } }),
      prisma.sale.aggregate({ _sum: { amount: true }, where: { AND: [cScope, { saleDate: { gte: monthStart } }] } }),
      prisma.lead.aggregate({ _sum: { estimatedValue: true }, where: { AND: [leadWhere, { status: { in: OPEN_STATUSES } }] } }),
    ]);
  return {
    totalLeads,
    newLeads,
    followupsToday,
    demosScheduled: demos,
    quotationsPending,
    negotiations,
    won,
    lost,
    totalSales: Number(sales._sum.amount ?? 0),
    currentMonthSales: Number(monthSales._sum.amount ?? 0),
    conversionRate: pct(won, totalLeads),
    pipelineValue: Number(pipeline._sum.estimatedValue ?? 0),
  };
}

export async function monthlySales(actor: Actor, months = 12) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const sales = await prisma.sale.findMany({
    where: { AND: [childScope(actor), { saleDate: { gte: from } }] },
    select: { amount: true, saleDate: true },
  });
  const buckets: { month: string; sales: number }[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    buckets.push({ month: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), sales: 0 });
  }
  for (const s of sales) {
    const idx = (s.saleDate.getFullYear() - from.getFullYear()) * 12 + s.saleDate.getMonth() - from.getMonth();
    if (idx >= 0 && idx < months) buckets[idx].sales += Number(s.amount);
  }
  return buckets;
}

export async function statusDistribution(actor: Actor, range: DateRange) {
  const created = rangeWhere(range);
  const g = await prisma.lead.groupBy({
    by: ["status"],
    where: { AND: [leadScope(actor), created ? { createdAt: created } : {}] },
    _count: { _all: true },
  });
  return g.map((x) => ({ status: x.status, count: x._count._all }));
}

export async function productSales(actor: Actor, range: DateRange) {
  const created = rangeWhere(range);
  const g = await prisma.sale.groupBy({
    by: ["productId"],
    where: { AND: [childScope(actor), created ? { saleDate: created } : {}] },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const products = await prisma.product.findMany({ select: { id: true, productName: true } });
  const names = new Map(products.map((p) => [p.id, p.productName]));
  return g
    .map((x) => ({ product: x.productId ? names.get(x.productId) ?? "Unknown" : "Unspecified", sales: Number(x._sum.amount ?? 0), count: x._count._all }))
    .sort((a, b) => b.sales - a.sales);
}

export async function opportunityPipeline(actor: Actor) {
  const g = await prisma.opportunity.groupBy({
    by: ["stage"],
    where: childScope(actor),
    _sum: { estimatedAmount: true },
    _count: { _all: true },
  });
  const order = ["PROSPECTING", "QUALIFICATION", "DEMO", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"];
  return order.map((stage) => {
    const r = g.find((x) => x.stage === stage);
    return { stage, amount: Number(r?._sum.estimatedAmount ?? 0), count: r?._count._all ?? 0 };
  });
}

export async function followupActivity(actor: Actor, days = 30) {
  const from = new Date(Date.now() - (days - 1) * 86400000);
  from.setHours(0, 0, 0, 0);
  const [acts, fus] = await Promise.all([
    prisma.activity.findMany({ where: { AND: [childScope(actor), { activityDate: { gte: from } }] }, select: { activityDate: true } }),
    prisma.followup.findMany({ where: { AND: [childScope(actor), { status: "COMPLETED", completedAt: { gte: from } }] }, select: { completedAt: true } }),
  ]);
  const out: { date: string; activities: number; followupsDone: number }[] = [];
  const idx = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 86400000);
    const k = d.toISOString().slice(0, 10);
    idx.set(k, i);
    out.push({ date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), activities: 0, followupsDone: 0 });
  }
  for (const a of acts) {
    const i = idx.get(a.activityDate.toISOString().slice(0, 10));
    if (i !== undefined) out[i].activities++;
  }
  for (const f of fus) {
    const i = f.completedAt ? idx.get(f.completedAt.toISOString().slice(0, 10)) : undefined;
    if (i !== undefined) out[i].followupsDone++;
  }
  return out;
}

export async function campaignPerformance(actor: Actor, f: AnalyticsFilter = {}) {
  const cond = and(leadSqlConditions(actor, f));
  return prisma.$queryRaw<{ campaign: string; source: string; leads: number; quotations: number; won: number; pipeline: number }[]>`
    SELECT l."campaignName" AS campaign, ls.name AS source,
      COUNT(*)::int AS leads,
      COUNT(*) FILTER (WHERE l."highestStageRank" >= ${RANK.QUOTATION})::int AS quotations,
      COUNT(*) FILTER (WHERE l.status = 'WON')::int AS won,
      COALESCE(SUM(l."estimatedValue") FILTER (WHERE l.status NOT IN ('WON','LOST')),0)::float8 AS pipeline
    FROM leads l JOIN lead_sources ls ON ls.id = l."leadSourceId"
    WHERE l."campaignName" IS NOT NULL AND l."campaignName" <> '' ${cond}
    GROUP BY l."campaignName", ls.name
    ORDER BY leads DESC`;
}
