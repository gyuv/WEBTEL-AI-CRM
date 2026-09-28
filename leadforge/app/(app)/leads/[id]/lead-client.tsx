"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles, Plus, Send, Mail, ExternalLink, ClipboardPaste, Wand2, Trash2, MessageCircle, Linkedin, ShieldAlert } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { CopyButton, JobProgress } from "@/components/client";
import { VoiceButton } from "@/components/voice";
import {
  setStatusAction, updateLeadAction, addNoteAction, addTaskAction, addContactAction, analyzeAction, assetsAction, enrichAction,
  peopleSearchAction, addPersonAction, pasteProfileAction, personAiAction, logEmailSentAction, gmailDraftAction, deletePersonAction,
} from "@/app/actions";
import { LEAD_STATUSES } from "@/lib/db/schema";
import { statusLabel } from "@/lib/utils";
import { checkEmail } from "@/lib/outreach/spam";
import { gmailComposeLink, mailtoLink } from "@/lib/outreach/render";
import type { Assets } from "@/lib/ai/schemas";

function useAct() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try {
      const r = (await fn()) as { error?: string } | undefined;
      if (r && typeof r === "object" && "error" in r && r.error) toast.error(r.error); else { if (ok) toast.success(ok); router.refresh(); }
    } catch (e) { toast.error((e as Error).message); }
  });
  return { pending, run };
}

export function StatusControl({ leadId, status }: { leadId: string; status: string }) {
  const { pending, run } = useAct();
  return (
    <Select className="h-9 w-auto" value={status} disabled={pending} aria-label="Pipeline status"
      onChange={(e) => { const reason = window.prompt("Reason for status change (for the audit trail):", "Manual update"); if (reason !== null) run(() => setStatusAction(leadId, e.target.value, reason || "Manual update"), "Status updated"); }}>
      {LEAD_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
    </Select>
  );
}

export function FlagToggles({ leadId, starred, dndChecked, doNotCall }: { leadId: string; starred: boolean; dndChecked: boolean; doNotCall: boolean }) {
  const { pending, run } = useAct();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant={starred ? "primary" : "outline"} disabled={pending} onClick={() => run(() => updateLeadAction(leadId, { starred: !starred }))}>★ {starred ? "Starred" : "Star"}</Button>
      <Button size="sm" variant={dndChecked ? "success" : "outline"} disabled={pending} onClick={() => run(() => updateLeadAction(leadId, { dndChecked: !dndChecked }), "Saved")} title="Mark that you checked the number against the TRAI NCPR/DND registry">{dndChecked ? "✓ DND checked" : "Mark DND checked"}</Button>
      <Button size="sm" variant={doNotCall ? "danger" : "outline"} disabled={pending} onClick={() => run(() => updateLeadAction(leadId, { doNotCall: !doNotCall }), doNotCall ? "Removed from do-not-call" : "Added to do-not-call")}><ShieldAlert className="h-3.5 w-3.5" />{doNotCall ? "Do-not-call" : "Add to DNC"}</Button>
    </div>
  );
}

export function EnrichButtons({ leadId, compact }: { leadId: string; compact?: boolean }) {
  const [job, setJob] = React.useState<string | null>(null);
  const { pending, run } = useAct();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={Boolean(job)} onClick={async () => { const r = await enrichAction([leadId]); if (r.jobId) setJob(r.jobId); }}><Sparkles className="h-3.5 w-3.5" /> Re-enrich</Button>
        {!compact && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(async () => { const r = await analyzeAction(leadId); if (r.warnings?.length) toast.message(r.warnings.join(" · ")); return r; }, "Analysis refreshed")}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Re-analyze</Button>}
      </div>
      {job && <JobProgress jobId={job} label="Enrichment" />}
    </div>
  );
}

export function AddContact({ leadId }: { leadId: string }) {
  const [v, setV] = React.useState("");
  const { pending, run } = useAct();
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addContactAction(leadId, v.includes("@") ? "email" : "phone", v), "Added"); setV(""); }}>
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Add phone or email" className="h-8 text-xs" />
      <Button size="sm" variant="outline" disabled={pending || !v}><Plus className="h-3.5 w-3.5" /></Button>
    </form>
  );
}

export function NotesBox({ leadId }: { leadId: string }) {
  const [v, setV] = React.useState("");
  const { pending, run } = useAct();
  return (
    <div className="space-y-2">
      <Textarea value={v} onChange={(e) => setV(e.target.value)} placeholder="Add a note…" />
      <div className="flex gap-2"><VoiceButton onText={(t) => setV((x) => (x ? x + " " : "") + t)} /><Button size="sm" disabled={pending || !v.trim()} onClick={() => { run(() => addNoteAction(leadId, v), "Note saved"); setV(""); }}>Save note</Button></div>
    </div>
  );
}

export function TaskAdder({ leadId }: { leadId: string }) {
  const [title, setTitle] = React.useState("Follow up");
  const [due, setDue] = React.useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  const { pending, run } = useAct();
  return (
    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addTaskAction(leadId, title, due), "Reminder set"); }}>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 min-w-[140px] flex-1 text-xs" aria-label="Task title" />
      <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-auto text-xs" aria-label="Due" />
      <Button size="sm" variant="outline" disabled={pending}>Remind me</Button>
    </form>
  );
}

export function PeopleTools({ leadId }: { leadId: string }) {
  const [job, setJob] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<"none" | "add" | "paste">("none");
  const [p, setP] = React.useState({ fullName: "", title: "", profileUrl: "" });
  const [paste, setPaste] = React.useState("");
  const { pending, run } = useAct();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={Boolean(job)} onClick={async () => { const r = await peopleSearchAction(leadId); setJob(r.jobId); }}><Sparkles className="h-3.5 w-3.5" /> Search public profiles</Button>
        <Button size="sm" variant="outline" onClick={() => setMode(mode === "add" ? "none" : "add")}><Plus className="h-3.5 w-3.5" /> Add person</Button>
        <Button size="sm" variant="outline" onClick={() => setMode(mode === "paste" ? "none" : "paste")}><ClipboardPaste className="h-3.5 w-3.5" /> Paste profile text</Button>
      </div>
      {job && <JobProgress jobId={job} label="People search" />}
      {mode === "add" && (
        <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); run(() => addPersonAction(leadId, p), "Person added"); setP({ fullName: "", title: "", profileUrl: "" }); }}>
          <Input placeholder="Full name" value={p.fullName} onChange={(e) => setP({ ...p, fullName: e.target.value })} required />
          <Input placeholder="Title (e.g. Director)" value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} />
          <Input placeholder="Profile URL (optional)" value={p.profileUrl} onChange={(e) => setP({ ...p, profileUrl: e.target.value })} />
          <Button disabled={pending}>Save</Button>
        </form>
      )}
      {mode === "paste" && (
        <div className="space-y-2">
          <Textarea rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Open the profile in your own browser, select the top card + About text, copy and paste here. LeadForge parses it locally." />
          <Button size="sm" disabled={pending || !paste.trim()} onClick={() => run(async () => { const r = await pasteProfileAction(paste, leadId); if ("name" in r) toast.success(`Added ${r.name}`); setPaste(""); return r; })}>Parse &amp; add</Button>
        </div>
      )}
    </div>
  );
}

export function PersonActions({ personId, email, connectionNote, profileUrl }: { personId: string; email?: string | null; connectionNote?: string | null; profileUrl?: string | null }) {
  const { pending, run } = useAct();
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => personAiAction(personId), "Icebreaker ready")}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Icebreaker</Button>
      {connectionNote && <CopyButton text={connectionNote} label="Note" />}
      {profileUrl && <a href={profileUrl} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}><Linkedin className="h-3.5 w-3.5" /> Profile</a>}
      {email && <CopyButton text={email} label="Email" />}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Remove this person?") && run(() => deletePersonAction(personId))} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  );
}

type Opt = { id: string; label: string };
export function AssetsPanel({ leadId, assets, products, people, emails, phone, suppressed }: {
  leadId: string; assets: (Assets & { model?: string }) | null; products: Opt[]; people: Opt[]; emails: string[]; phone: string | null; suppressed: string[];
}) {
  const [product, setProduct] = React.useState(assets?.productId ?? products[0]?.id ?? "");
  const [person, setPerson] = React.useState(assets?.personId ?? "");
  const [lang, setLang] = React.useState<"en" | "ta" | "tanglish">("en");
  const [len, setLen] = React.useState<"short" | "long">("short");
  const { pending, run } = useAct();
  const regen = () => run(async () => { const r = await assetsAction(leadId, product || null, person || null); if (r.warnings?.length) toast.message(r.warnings.join(" · ")); return r; }, "Assets generated");
  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Product to pitch" className="min-w-[180px] flex-1"><Select value={product} onChange={(e) => setProduct(e.target.value)}>{products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
          <Field label="Person" className="min-w-[160px] flex-1"><Select value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Best decision-maker</option>{people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
          <Button onClick={regen} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{assets ? "Regenerate" : "Generate"}</Button>
        </div>
        {assets?.model && <p className="mt-2 text-[11px] text-muted-fg">Generated by {assets.model}. Everything is editable — review before using.</p>}
      </Card>
      {!assets ? <p className="text-sm text-muted-fg">Generate call scripts, emails, WhatsApp and LinkedIn messages tailored to this lead.</p> : (
        <>
          <Card>
            <CardHeader title="Call script" action={<div className="flex gap-1">
              <Select className="h-8 w-auto text-xs" value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} aria-label="Language"><option value="en">English</option><option value="ta">தமிழ் Tamil</option><option value="tanglish">Tanglish</option></Select>
              <Select className="h-8 w-auto text-xs" value={len} onChange={(e) => setLen(e.target.value as typeof len)} aria-label="Length"><option value="short">30 sec</option><option value="long">2 min</option></Select>
            </div>} />
            <CardBody><EditableBlock text={assets.callScripts[lang][len]} rows={len === "long" ? 12 : 4} /></CardBody>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader title="Voicemail" /><CardBody><EditableBlock text={assets.voicemail} rows={3} /></CardBody></Card>
            <Card><CardHeader title="Gatekeeper lines" /><CardBody><ul className="space-y-1.5 text-sm">{assets.gatekeeper.map((g, i) => <li key={i} className="flex gap-2"><span className="text-muted-fg">•</span><span className="flex-1">{g}</span></li>)}</ul></CardBody></Card>
          </div>
          <Card>
            <CardHeader title="Cold email — 3 A/B variants" description="Spam-word and length check included. You send it yourself." />
            <CardBody className="space-y-4">
              {assets.emails.map((e) => <EmailVariant key={e.variant} leadId={leadId} v={e} emails={emails} productId={product} personId={person || assets.personId} suppressed={suppressed} />)}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Follow-up sequence" description="Day 3, 7, 14 (break-up). Reminders are created automatically when you log a send." />
            <CardBody className="grid gap-3 md:grid-cols-3">
              {assets.followUps.map((f) => <div key={f.day}><Badge tone="info" className="mb-1">Day {f.day}</Badge><p className="mb-1 text-xs font-medium">{f.subject}</p><EditableBlock text={f.body} rows={7} /></div>)}
            </CardBody>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader title="WhatsApp" action={phone && <a className={buttonClass("success", "sm")} target="_blank" rel="noreferrer" href={`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(assets.whatsapp)}`}><MessageCircle className="h-3.5 w-3.5" /> Open WhatsApp</a>} /><CardBody><EditableBlock text={assets.whatsapp} rows={4} /></CardBody></Card>
            <Card><CardHeader title="LinkedIn" /><CardBody className="space-y-3"><div><p className="mb-1 text-xs text-muted-fg">Connection note ({assets.linkedinNote.length}/300)</p><EditableBlock text={assets.linkedinNote} rows={3} /></div><div><p className="mb-1 text-xs text-muted-fg">Follow-up after connecting</p><EditableBlock text={assets.linkedinFollowUp} rows={3} /></div></CardBody></Card>
          </div>
          <Card>
            <CardHeader title="Objection cheat sheet" />
            <CardBody><dl className="grid gap-3 md:grid-cols-2">{assets.objections.map((o, i) => <div key={i} className="rounded-md border border-border p-3"><dt className="text-sm font-medium">“{o.objection}”</dt><dd className="mt-1 text-sm text-muted-fg">{o.rebuttal}</dd></div>)}</dl></CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

export function EditableBlock({ text, rows = 4 }: { text: string; rows?: number }) {
  const [v, setV] = React.useState(text);
  React.useEffect(() => setV(text), [text]);
  return (
    <div className="space-y-2">
      <Textarea value={v} onChange={(e) => setV(e.target.value)} rows={rows} className="prose-pre font-normal" />
      <CopyButton text={v} />
    </div>
  );
}

function EmailVariant({ leadId, v, emails, productId, personId, suppressed }: { leadId: string; v: Assets["emails"][number]; emails: string[]; productId: string; personId: string | null; suppressed: string[] }) {
  const [subject, setSubject] = React.useState(v.subject);
  const [body, setBody] = React.useState(v.body);
  const [to, setTo] = React.useState(emails.find((e) => !suppressed.includes(e)) ?? "");
  const { pending, run } = useAct();
  React.useEffect(() => { setSubject(v.subject); setBody(v.body); }, [v]);
  const check = checkEmail(subject, body);
  const blocked = suppressed.includes(to.toLowerCase());
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone="primary">{v.variant}</Badge>
        <Badge tone={check.score >= 80 ? "success" : check.score >= 60 ? "warning" : "danger"}>Deliverability {check.score}</Badge>
        <Badge>{check.words} words</Badge>{check.spamHits.length > 0 && <Badge tone="danger">Spam words: {check.spamHits.join(", ")}</Badge>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="To"><Input list={`em-${leadId}`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@company.com" /><datalist id={`em-${leadId}`}>{emails.map((e) => <option key={e} value={e} />)}</datalist></Field>
        <Field label={`Subject (alt: ${v.altSubjects.join(" / ")})`}><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
      </div>
      <Textarea className="prose-pre mt-2" rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
      {check.tips.length > 0 && <ul className="mt-1 list-inside list-disc text-[11px] text-muted-fg">{check.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
      {blocked && <p className="mt-2 text-xs text-danger">This address is on your suppression list (unsubscribed/bounced). Do not send.</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <CopyButton text={`Subject: ${subject}\n\n${body}`} label="Copy" />
        <a className={buttonClass("outline", "sm", blocked ? "pointer-events-none opacity-40" : "")} href={mailtoLink(to, subject, body)}><Mail className="h-3.5 w-3.5" /> Mail app</a>
        <a className={buttonClass("outline", "sm", blocked ? "pointer-events-none opacity-40" : "")} target="_blank" rel="noreferrer" href={gmailComposeLink(to, subject, body)}><ExternalLink className="h-3.5 w-3.5" /> Gmail compose</a>
        <Button size="sm" variant="outline" disabled={pending || blocked || !to} onClick={() => run(() => gmailDraftAction({ leadId, to, subject, body }), "Draft created in Gmail")}>Create Gmail draft</Button>
        <Button size="sm" variant="success" disabled={pending || blocked || !to} onClick={() => run(() => logEmailSentAction({ leadId, to, subject, body, productId, personId, variant: v.variant }), "Logged. Follow-ups scheduled for day 3/7/14")}><Send className="h-3.5 w-3.5" /> I sent this</Button>
      </div>
    </div>
  );
}
