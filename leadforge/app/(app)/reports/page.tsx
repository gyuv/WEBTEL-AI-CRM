import { and, eq, gte, desc } from "drizzle-orm";
import { ctx, getProfile } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { dashboardStats, breakdowns } from "@/lib/server/analytics";
import { Card, CardBody, PageHeader, buttonClass } from "@/components/ui";
import { PrintButton } from "../leads/[id]/brief/print-button";
import { fmtDate, inr, statusLabel } from "@/lib/utils";
import { Download } from "lucide-react";

export const metadata = { title: "Weekly report" };

export default async function Reports() {
  const { db, userId } = await ctx();
  const since = new Date(Date.now() - 7 * 86400000);
  const [s, bd, me] = await Promise.all([dashboardStats(userId, 7), breakdowns(userId), getProfile(userId)]);
  const moves = await db.select({ h: schema.statusHistory, name: schema.leads.name }).from(schema.statusHistory).innerJoin(schema.leads, eq(schema.leads.id, schema.statusHistory.leadId))
    .where(and(eq(schema.statusHistory.userId, userId), gte(schema.statusHistory.createdAt, since))).orderBy(desc(schema.statusHistory.createdAt)).limit(40);
  const wins = moves.filter((m) => ["interested", "meeting_booked", "proposal", "won"].includes(m.h.toStatus));
  const best = bd.byCategory[0];
  return (
    <>
      <div className="no-print"><PageHeader title="Weekly report" description={`${fmtDate(since)} – ${fmtDate(new Date())}`} actions={<><a className={buttonClass("outline")} href="/api/export?format=xlsx"><Download className="h-4 w-4" /> Leads XLSX</a><PrintButton /></>} /></div>
      <Card className="mx-auto max-w-3xl"><CardBody className="space-y-5 p-6 text-sm">
        <header><p className="text-xs uppercase tracking-wider text-muted-fg">LeadForge weekly report</p><h2 className="text-xl font-semibold">{me.displayName} · {me.companyName}</h2><p className="text-muted-fg">{fmtDate(since)} – {fmtDate(new Date())}</p></header>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([["New leads", s.new_leads], ["Calls", s.calls], ["Connect rate", `${s.connectRate}%`], ["Emails sent", s.emails], ["Reply rate", `${s.replyRate}%`], ["Meetings (open)", s.meetings], ["Pipeline", inr(s.pipeline_value)], ["Won (total)", s.won]] as const).map(([k, v]) => <div key={k} className="rounded-md border border-border p-3"><p className="text-[11px] text-muted-fg">{k}</p><p className="text-lg font-semibold">{v}</p></div>)}
        </section>
        <section><h3 className="mb-1 font-semibold">Highlights</h3><ul className="list-inside list-disc space-y-0.5">
          <li>{wins.length} lead(s) moved to interested or beyond this week.</li>
          {best && <li>Best-responding industry: {best.category} ({best.interested} interested of {best.leads}).</li>}
          <li>Streak: {s.streak} day(s) of calling in a row.</li>
          {s.emails_today > 40 && <li>⚠ High email volume — watch deliverability.</li>}
        </ul></section>
        <section><h3 className="mb-1 font-semibold">Movement</h3>{moves.length ? <ul className="space-y-0.5">{moves.map((m) => <li key={m.h.id}>{fmtDate(m.h.createdAt)} — <b>{m.name}</b>: {statusLabel(m.h.fromStatus ?? "—")} → {statusLabel(m.h.toStatus)}</li>)}</ul> : <p className="text-muted-fg">No status changes.</p>}</section>
        <section><h3 className="mb-1 font-semibold">Next week</h3><ul className="list-inside list-disc"><li>Hit {s.calls ? Math.round(s.calls * 1.1) : 100}+ calls; prioritise leads with score ≥ 70.</li><li>Follow up every “interested” lead within 48 hours.</li><li>Test a new email variant against the current best.</li></ul></section>
      </CardBody></Card>
    </>
  );
}
