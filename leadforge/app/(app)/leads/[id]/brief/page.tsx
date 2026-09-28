import { notFound } from "next/navigation";
import { ctx } from "@/lib/server/core";
import { getLeadBundle } from "@/lib/server/leads";
import { PrintButton } from "./print-button";
import { fmtDate, statusLabel } from "@/lib/utils";
import type { Analysis, Assets } from "@/lib/ai/schemas";

export const metadata = { title: "Prep sheet" };

export default async function Brief({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await ctx();
  const b = await getLeadBundle(userId, id);
  if (!b) notFound();
  const a = b.insights.analysis?.payload as Analysis | undefined;
  const s = b.insights.assets?.payload as Assets | undefined;
  const top = a?.matches[0];
  const dm = b.people[0];
  return (
    <div className="mx-auto max-w-3xl rounded-lg bg-card p-6 text-sm shadow-sm print:shadow-none">
      <div className="no-print mb-4 flex justify-end gap-2"><a href={`/leads/${id}`} className="text-xs underline">← Back</a><PrintButton /></div>
      <header className="mb-4 border-b border-border pb-3">
        <p className="text-xs uppercase tracking-wider text-muted-fg">Call prep sheet · {fmtDate(new Date())}</p>
        <h1 className="text-2xl font-semibold">{b.lead.name}</h1>
        <p className="text-muted-fg">{[b.lead.category, b.lead.area, b.lead.city].filter(Boolean).join(" · ")} · Status: {statusLabel(b.lead.status)} · Score {b.lead.score}</p>
      </header>
      <section className="mb-4 grid grid-cols-2 gap-4">
        <div><h2 className="mb-1 font-semibold">Contact</h2>{b.phones.map((p) => <p key={p.id} className="font-mono">{p.e164} ({p.kind}){p.dndChecked ? " · DND✓" : " · DND not checked"}</p>)}{b.emails.slice(0, 3).map((e) => <p key={e.id} className="font-mono text-xs">{e.email} {e.kind === "guessed" ? `(guess ${e.confidence}%)` : ""}</p>)}{b.lead.website && <p>{b.lead.website}</p>}</div>
        <div><h2 className="mb-1 font-semibold">Who to ask for</h2>{b.people.slice(0, 4).map((p) => <p key={p.id}>{p.fullName} — {p.title ?? "?"} <span className="text-muted-fg">(DM {p.dmScore})</span></p>)}{!b.people.length && <p className="text-muted-fg">Unknown — ask the gatekeeper for the owner.</p>}</div>
      </section>
      <section className="mb-4"><h2 className="mb-1 font-semibold">Summary</h2><p>{a?.summary ?? "Insufficient data."}</p><p className="mt-1"><b>Why now:</b> {a?.whyNow ?? "—"}</p></section>
      <section className="mb-4"><h2 className="mb-1 font-semibold">Pain points (evidence-backed)</h2><ul className="list-inside list-disc">{a?.pains.map((p, i) => <li key={i}>{p.title} — {p.detail} ({p.confidence}%)</li>) ?? <li>Insufficient data</li>}</ul></section>
      {top && <section className="mb-4"><h2 className="mb-1 font-semibold">Pitch: {top.productName} ({top.fitPct}% fit)</h2><p>{top.reasoning}</p><p className="mt-1"><b>Opening:</b> {top.openingLine}</p></section>}
      {s && <section className="mb-4"><h2 className="mb-1 font-semibold">30-second script</h2><p className="whitespace-pre-wrap">{s.callScripts.en.short}</p><p className="mt-2 whitespace-pre-wrap text-muted-fg">{s.callScripts.tanglish.short}</p></section>}
      <section className="mb-4"><h2 className="mb-1 font-semibold">Objections</h2>{(s?.objections ?? top?.objections ?? []).map((o, i) => <p key={i} className="mb-1"><b>“{o.objection}”</b> → {o.rebuttal}</p>)}</section>
      <section className="mb-4"><h2 className="mb-1 font-semibold">Discovery questions</h2><ol className="list-inside list-decimal"><li>How do you get most new {b.lead.category?.toLowerCase().includes("clinic") ? "patients" : "customers"} today?</li><li>{a?.pains[0] ? `How are you handling ${a.pains[0].title.toLowerCase()}?` : "What's the biggest bottleneck in sales right now?"}</li><li>Who else would be involved in a decision like this?</li><li>What would success look like in 3 months?</li></ol></section>
      <section><h2 className="mb-1 font-semibold">History</h2>{b.calls.slice(0, 3).map((c) => <p key={c.id}>{fmtDate(c.startedAt)} — {statusLabel(c.outcome)}: {c.notes}</p>)}{b.notes.slice(0, 3).map((n) => <p key={n.id}>{fmtDate(n.createdAt)} — {n.body}</p>)}{!b.calls.length && !b.notes.length && <p className="text-muted-fg">First contact.</p>}</section>
      {dm && <p className="mt-4 text-xs text-muted-fg">Data sources: {[...new Set(b.sources.map((x) => x.provider))].join(", ")}. Guessed emails are unverified.</p>}
    </div>
  );
}
