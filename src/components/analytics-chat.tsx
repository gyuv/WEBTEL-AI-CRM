"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui";

const SUGGESTIONS = [
  "Which lead source generated the most leads this month?",
  "Which source generated the most won deals?",
  "Which source generated the highest sales value?",
  "How many leads came from LinkedIn?",
  "How many leads came from referrals?",
  "What is the conversion rate for direct visits?",
  "Which campaign generated the most quotations?",
  "Which lead source has the highest average deal value?",
  "Show my top sources by sales.",
  "Which source has many leads but low conversion?",
  "Show all leads from Google Ads that have not been contacted.",
  "How many leads from exhibitions are still open?",
];

interface Msg { q: string; answer?: string; data?: unknown; tool?: string | null; error?: string }

function DataView({ data }: { data: unknown }) {
  const d = data as { results?: Record<string, unknown>[]; leads?: { id: string; name: string; company: string | null; source: string; status: string }[]; stats?: Record<string, unknown> } | null;
  if (!d) return null;
  if (d.leads?.length)
    return (
      <ul className="mt-2 text-xs">
        {d.leads.map((l) => <li key={l.id}><Link className="text-primary hover:underline" href={`/leads/${l.id}`}>{l.name}</Link> · {l.company} · {l.source} · {l.status}</li>)}
      </ul>
    );
  const rows = d.results ?? (d.stats ? [d.stats] : null);
  if (!rows?.length) return null;
  const cols = Object.keys(rows[0]).filter((k) => k !== "id");
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="text-xs">
        <thead><tr>{cols.map((c) => <th key={c} className="px-2 py-1 text-left font-medium text-muted-foreground">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className="px-2 py-0.5">{String(r[c] ?? "")}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function AnalyticsChat() {
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  async function ask(question: string) {
    if (!question.trim()) return;
    setBusy(true);
    setQ("");
    try {
      const r = await fetch("/api/ai/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const body = await r.json();
      setMsgs((m) => [{ q: question, ...(r.ok ? body : { error: body.error }) }, ...m]);
    } catch {
      setMsgs((m) => [{ q: question, error: "Request failed" }, ...m]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about sources, campaigns, conversions, sales…" />
        <Button disabled={busy}>{busy ? "Thinking…" : "Ask"}</Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)} className="rounded-full border bg-white px-2.5 py-1 text-xs hover:bg-muted">{s}</button>)}
      </div>
      {msgs.map((m, i) => (
        <Card key={i} className="p-3">
          <div className="text-xs text-muted-foreground">Q: {m.q}</div>
          {m.error ? <p className="text-sm text-destructive">{m.error}</p> : <p className="mt-1 text-sm">{m.answer}</p>}
          {m.tool && <div className="mt-1 text-[10px] uppercase text-muted-foreground">source: {m.tool}</div>}
          <DataView data={m.data} />
        </Card>
      ))}
    </div>
  );
}
