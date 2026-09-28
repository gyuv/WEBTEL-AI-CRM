"use client";

import { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from "@/components/ui";
import { createFollowupAction } from "@/app/actions/crm";

const ACTIONS = [
  ["ANALYZE_LEAD", "Analyze Lead"],
  ["ANALYZE_LEAD_SOURCE", "Analyze Lead Source"],
  ["RECOMMEND_PRODUCTS", "Recommend Products"],
  ["SALES_PITCH", "Prepare Sales Pitch"],
  ["WHATSAPP", "Generate WhatsApp"],
  ["EMAIL", "Generate Email"],
  ["HANDLE_OBJECTION", "Handle Objection"],
  ["DISCOVERY_QUESTIONS", "Discovery Questions"],
  ["DEMO_PLAN", "Demo Plan"],
  ["SUMMARIZE_MEETING", "Summarize Meeting"],
  ["NEXT_ACTION", "Suggest Next Action"],
] as const;
type AssistType = (typeof ACTIONS)[number][0];

interface Result {
  type: AssistType;
  text: string;
  json?: unknown;
  model: string;
  missing: string[];
  offline: boolean;
  requiresApproval: boolean;
}
interface Rec { productName: string; whyRelevant?: string; requirementAddressed?: string; informationStillNeeded?: string; possibleObjection?: string }
interface NextAction { action: string; reason: string; channel: string; urgency: string }

export function AiPanel({ leadId, customerId, phone, email }: { leadId?: string; customerId?: string; phone?: string | null; email?: string | null }) {
  const [loading, setLoading] = useState<AssistType | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [draft, setDraft] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function run(type: AssistType) {
    setLoading(type);
    setError(null);
    setApproved(false);
    setInfo(null);
    try {
      const res = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, leadId, customerId, input: input || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "AI request failed");
      setResult(body);
      setDraft(body.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setLoading(null);
    }
  }

  async function createFollowupFromAi(message: string) {
    const fd = new FormData();
    if (leadId) fd.set("leadId", leadId);
    if (customerId) fd.set("customerId", customerId);
    fd.set("followupDate", new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    fd.set("followupType", "FOLLOW_UP");
    fd.set("message", message.slice(0, 2000));
    const r = await createFollowupAction(null, fd);
    setInfo(r.ok ? "Follow-up created for tomorrow." : r.error);
  }

  const recs = result?.type === "RECOMMEND_PRODUCTS" ? ((result.json as { recommendations?: Rec[]; note?: string }) ?? {}) : null;
  const next = result?.type === "NEXT_ACTION" ? (result.json as NextAction | undefined) : null;
  const waLink = phone ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(draft)}` : null;
  const mailLink = email ? `mailto:${email}?subject=${encodeURIComponent(draft.match(/^Subject:\s*(.*)$/m)?.[1] ?? "")}&body=${encodeURIComponent(draft.replace(/^Subject:.*\n+/m, ""))}` : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Sales Assistant</CardTitle>
        {result && <span className="text-[11px] text-muted-foreground">{result.offline ? "Offline rules" : result.model}</span>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map(([t, l]) => (
            <Button key={t} variant="outline" size="sm" disabled={!!loading} onClick={() => run(t)}>
              {loading === t ? "…" : l}
            </Button>
          ))}
        </div>
        <Textarea
          rows={2}
          placeholder="Optional: paste objection text or meeting notes for Handle Objection / Summarize Meeting"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="space-y-2">
            {result.missing.length > 0 && (
              <p className="rounded bg-amber-50 p-2 text-xs text-amber-900"><b>Missing in CRM:</b> {result.missing.join(", ")}</p>
            )}
            {recs && (
              <div className="space-y-2">
                {(recs.recommendations ?? []).map((r) => (
                  <div key={r.productName} className="rounded border p-2 text-sm">
                    <div className="font-semibold">{r.productName}</div>
                    <div><b>Why:</b> {r.whyRelevant}</div>
                    <div><b>Requirement:</b> {r.requirementAddressed}</div>
                    <div><b>Info still needed:</b> {r.informationStillNeeded}</div>
                    <div><b>Possible objection:</b> {r.possibleObjection}</div>
                  </div>
                ))}
                {recs.note && <p className="text-xs text-muted-foreground">{recs.note}</p>}
                {!recs.recommendations?.length && !recs.note && <pre className="whitespace-pre-wrap text-sm">{result.text}</pre>}
              </div>
            )}
            {next && (
              <div className="rounded border border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="text-xs font-semibold uppercase text-primary">AI Suggested Next Action · {next.channel} · {next.urgency}</div>
                <div className="mt-1 font-medium">{next.action}</div>
                <div className="mt-1 text-xs text-muted-foreground">{next.reason}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => run("WHATSAPP")}>Generate WhatsApp</Button>
                  <Button size="sm" variant="outline" onClick={() => run("EMAIL")}>Generate Email</Button>
                  <Button size="sm" variant="outline" onClick={() => createFollowupFromAi(next.action)}>Create Follow-up</Button>
                </div>
              </div>
            )}
            {!recs && !next && (
              <>
                <Textarea rows={10} value={draft} onChange={(e) => { setDraft(e.target.value); setApproved(false); }} className="font-mono text-xs" />
                {result.requiresApproval && (
                  <div className="space-y-2 rounded bg-muted p-2 text-xs">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
                      I have reviewed and approve this draft. Nothing is sent automatically.
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={!approved} onClick={() => navigator.clipboard.writeText(draft).then(() => setInfo("Copied to clipboard"))}>Copy</Button>
                      {result.type === "WHATSAPP" && waLink && <a aria-disabled={!approved} className={`rounded border bg-white px-3 py-1.5 ${approved ? "" : "pointer-events-none opacity-50"}`} href={waLink} target="_blank" rel="noreferrer">Open in WhatsApp</a>}
                      {result.type === "EMAIL" && mailLink && <a aria-disabled={!approved} className={`rounded border bg-white px-3 py-1.5 ${approved ? "" : "pointer-events-none opacity-50"}`} href={mailLink}>Open in Email app</a>}
                    </div>
                  </div>
                )}
              </>
            )}
            {info && <p className="text-xs text-emerald-700">{info}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
