import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { PhoneOff } from "lucide-react";
import { ctx, getSettings } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { getLeadBundle } from "@/lib/server/leads";
import { bestTimeToCall, dashboardStats } from "@/lib/server/analytics";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { CallDesk } from "./call-desk";
import type { Analysis, Assets } from "@/lib/ai/schemas";

export const metadata = { title: "Call desk" };

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const sp = await searchParams;
  const { db, userId } = await ctx();
  const settings = await getSettings(userId);
  const queue = await db.select({ id: schema.leads.id, name: schema.leads.name, score: schema.leads.score, status: schema.leads.status, area: schema.leads.area, nextFollowUpAt: schema.leads.nextFollowUpAt })
    .from(schema.leads)
    .where(and(eq(schema.leads.userId, userId), eq(schema.leads.doNotCall, false),
      inArray(schema.leads.status, ["new", "researched", "contacted", "replied", "interested", "meeting_booked", "proposal"]),
      or(isNull(schema.leads.nextFollowUpAt), lte(schema.leads.nextFollowUpAt, sql`now() + interval '12 hours'`)),
      sql`exists (select 1 from lead_phones p where p.lead_id = ${schema.leads.id})`))
    .orderBy(sql`case when ${schema.leads.nextFollowUpAt} is not null then 0 else 1 end`, asc(schema.leads.nextFollowUpAt), desc(schema.leads.score)).limit(60);
  const currentId = sp.lead ?? queue[0]?.id;
  if (!currentId) return <><PageHeader title="Call desk" /><EmptyState icon={<PhoneOff />} title="No calls queued" description="Leads with a phone number and a due follow-up (or never contacted) show up here." action={<a className={buttonClass()} href="/discover">Find leads</a>} /></>;
  const b = await getLeadBundle(userId, currentId);
  if (!b) return <EmptyState title="Lead not found" />;
  const [stats, times] = await Promise.all([dashboardStats(userId, 1), bestTimeToCall(userId)]);
  const sup = new Set((await db.select().from(schema.suppressionList).where(and(eq(schema.suppressionList.userId, userId), eq(schema.suppressionList.kind, "phone")))).map((s) => s.value));
  const idx = queue.findIndex((q) => q.id === currentId);
  const nextId = queue[idx + 1]?.id ?? queue.find((q) => q.id !== currentId)?.id ?? null;
  const best = times.filter((t) => t.calls >= 3).map((t) => ({ ...t, rate: t.connects / t.calls })).sort((a, c) => c.rate - a.rate).slice(0, 3);
  const a = b.insights.analysis?.payload as Analysis | undefined;
  const assets = b.insights.assets?.payload as Assets | undefined;
  return (
    <CallDesk
      queue={queue.map((q) => ({ ...q, nextFollowUpAt: q.nextFollowUpAt?.toISOString() ?? null }))}
      nextId={nextId}
      progress={{ done: stats.calls_today, target: settings.targets.callsPerDay }}
      bestTimes={best.map((t) => `${t.hour}:00–${t.hour + 1}:00 (${Math.round(t.rate * 100)}% connect)`)}
      lead={{
        id: b.lead.id, name: b.lead.name, category: b.lead.category, area: b.lead.area, city: b.lead.city, status: b.lead.status, score: b.lead.score, whatsapp: b.lead.whatsapp,
        phones: b.phones.map((p) => ({ e164: p.e164, kind: p.kind, dndChecked: p.dndChecked, suppressed: sup.has(p.e164) })),
        people: b.people.slice(0, 4).map((p) => ({ id: p.id, name: p.fullName, title: p.title, dm: p.dmScore })),
        pains: a?.pains.slice(0, 3).map((p) => p.title) ?? [],
        pitch: a?.matches[0] ? { product: a.matches[0].productName, opening: a.matches[0].openingLine, objections: (assets?.objections ?? a.matches[0].objections).slice(0, 4) } : null,
        scripts: assets?.callScripts ?? null, gatekeeper: assets?.gatekeeper ?? [], voicemail: assets?.voicemail ?? null, whatsappMsg: assets?.whatsapp ?? null,
        history: [...b.calls.slice(0, 4).map((c) => `${c.startedAt.toLocaleDateString("en-IN")} · ${c.outcome.replace(/_/g, " ")}${c.notes ? ` — ${c.notes}` : ""}`), ...b.notes.slice(0, 3).map((n) => `${n.createdAt.toLocaleDateString("en-IN")} · note — ${n.body}`)],
      }}
    />
  );
}
