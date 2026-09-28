"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Wand2 } from "lucide-react";
import { Badge, Button, Card, CardBody, Field, Input, Select, Textarea } from "@/components/ui";
import { CopyButton, JobProgress } from "@/components/client";
import { pasteReplyAction, overrideClassificationAction, syncInboxAction } from "@/app/actions";
import { REPLY_CLASSES } from "@/lib/inbox/classify";
import { statusLabel, timeAgo } from "@/lib/utils";

type Draft = { tone: string; body: string };
const TONE: Record<string, "success" | "warning" | "danger" | "default" | "info"> = { interested: "success", meeting_request: "success", question: "info", not_interested: "danger", unsubscribe: "danger", bounce: "danger" };

export function PasteReply({ leads }: { leads: { id: string; name: string }[] }) {
  const router = useRouter();
  const [f, setF] = React.useState({ leadId: "", from: "", subject: "", body: "" });
  const [result, setResult] = React.useState<{ label: string; confidence: number; summary: string; drafts: Draft[]; statusChanged?: boolean; leadId?: string | null } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <CardBody className="space-y-2">
      <Field label="Lead (optional — auto-matched by sender)"><Input list="lf-inbox-leads" onChange={(e) => setF({ ...f, leadId: leads.find((l) => l.name === e.target.value)?.id ?? "" })} placeholder="Auto-detect" /><datalist id="lf-inbox-leads">{leads.map((l) => <option key={l.id} value={l.name} />)}</datalist></Field>
      <div className="grid grid-cols-2 gap-2"><Input placeholder="From email" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /><Input placeholder="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
      <Textarea rows={7} placeholder="Paste the reply text…" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      <Button className="w-full" disabled={pending || !f.body.trim()} onClick={() => start(async () => {
        const r = await pasteReplyAction({ ...f, leadId: f.leadId || null });
        if ("error" in r && r.error) { toast.error(r.error); return; }
        if ("analysis" in r && r.analysis) { setResult({ ...r.analysis, statusChanged: r.statusChanged, leadId: r.leadId }); toast.success(`Classified: ${statusLabel(r.analysis.label)}${r.statusChanged ? " · status updated" : ""}`); }
        if (!("leadId" in r) || !r.leadId) toast.message("No matching lead found — pick the lead to link it.");
        setF({ leadId: "", from: "", subject: "", body: "" }); router.refresh();
      })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Analyze reply</Button>
      {result && <div className="space-y-2 rounded-md border border-border p-3"><div className="flex items-center gap-2"><Badge tone={TONE[result.label] ?? "warning"}>{statusLabel(result.label)}</Badge><span className="text-xs text-muted-fg">{result.confidence}%</span></div><p className="text-sm">{result.summary}</p><Drafts drafts={result.drafts} label={result.label} /></div>}
    </CardBody>
  );
}

function Drafts({ drafts, label }: { drafts: Draft[]; label: string }) {
  if (["unsubscribe", "bounce", "auto_responder"].includes(label)) return <p className="text-xs text-danger">Do not reply. The address has been suppressed.</p>;
  if (!drafts.length) return null;
  return <div className="space-y-2">{drafts.map((d, i) => <div key={i} className="rounded-md bg-muted p-2"><div className="mb-1 flex items-center justify-between"><Badge>{d.tone}</Badge><CopyButton text={d.body} /></div><p className="whitespace-pre-wrap text-xs">{d.body}</p></div>)}</div>;
}

export function MessageRow({ m, lead }: { m: { id: string; from: string | null; subject: string | null; body: string; classification: string | null; confidence: number | null; summary: string | null; source: string; receivedAt: string }; lead: { id: string; name: string; status: string } | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TONE[m.classification ?? ""] ?? "warning"}>{statusLabel(m.classification ?? "unclassified")}</Badge>
          <span className="text-xs text-muted-fg">{m.confidence}%</span>
          {lead ? <a href={`/leads/${lead.id}`} className="text-sm font-medium hover:underline">{lead.name}</a> : <span className="text-sm text-muted-fg">Unmatched · {m.from}</span>}
          {lead && <Badge>{statusLabel(lead.status)}</Badge>}
          <span className="ml-auto text-[11px] text-muted-fg">{m.source} · {timeAgo(m.receivedAt)}</span>
        </div>
        <p className="text-sm">{m.summary}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} message</Button>
          <Select className="h-8 w-auto text-xs" defaultValue="" disabled={pending} aria-label="Override classification" onChange={(e) => e.target.value && start(async () => { await overrideClassificationAction(m.id, e.target.value); toast.success("Re-classified"); router.refresh(); })}>
            <option value="">Override…</option>{REPLY_CLASSES.map((c) => <option key={c} value={c}>{statusLabel(c)}</option>)}
          </Select>
          {lead && <a href={`/leads/${lead.id}`} className="text-xs text-primary hover:underline">Draft reply on lead page →</a>}
        </div>
        {open && <pre className="prose-pre max-h-72 overflow-y-auto rounded-md bg-muted p-3 font-sans text-xs">{m.subject ? `Subject: ${m.subject}\n\n` : ""}{m.body}</pre>}
      </CardBody>
    </Card>
  );
}

export function SyncButton() {
  const [job, setJob] = React.useState<string | null>(null);
  return job ? <div className="w-64"><JobProgress jobId={job} label="Gmail sync" /></div> : <Button variant="outline" onClick={async () => { const r = await syncInboxAction(); setJob(r.jobId); }}><RefreshCw className="h-4 w-4" /> Sync now</Button>;
}
