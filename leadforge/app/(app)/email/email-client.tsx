"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Mail, ExternalLink, Wand2, Trash2, Plus } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { CopyButton } from "@/components/client";
import { renderForLeadAction, logEmailSentAction, gmailDraftAction, saveTemplateAction, deleteTemplateAction } from "@/app/actions";
import { checkEmail, OPT_OUT_LINE } from "@/lib/outreach/spam";
import { gmailComposeLink, mailtoLink, templateVariables } from "@/lib/outreach/render";

const VARS = ["first_name", "full_name", "title", "company", "category", "city", "area", "pain_point", "product", "product_benefit", "my_name", "my_company", "signature", "meeting_link"];

function CheckBadges({ subject, body }: { subject: string; body: string }) {
  const c = checkEmail(subject, body);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5"><Badge tone={c.score >= 80 ? "success" : c.score >= 60 ? "warning" : "danger"}>Score {c.score}/100</Badge><Badge>{c.words} words</Badge><Badge>Subject {c.subjectLen} chars</Badge><Badge tone={c.hasOptOut ? "success" : "danger"}>{c.hasOptOut ? "Opt-out ✓" : "No opt-out"}</Badge>{c.spamHits.map((w) => <Badge key={w} tone="danger">{w}</Badge>)}</div>
      {c.tips.length > 0 && <ul className="list-inside list-disc text-[11px] text-muted-fg">{c.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
    </div>
  );
}

export function Composer({ templates, leads, products, initialLead }: { templates: { id: string; name: string }[]; leads: { id: string; name: string }[]; products: { id: string; name: string }[]; initialLead?: string }) {
  const router = useRouter();
  const [leadId, setLeadId] = React.useState(initialLead ?? "");
  const [tpl, setTpl] = React.useState(templates[0]?.id ?? "");
  const [product, setProduct] = React.useState("");
  const [m, setM] = React.useState<{ to: string; subject: string; body: string; toIsGuess: boolean; productId: string | null; personId: string | null } | null>(null);
  const [pending, start] = React.useTransition();
  const personalise = () => start(async () => {
    const r = await renderForLeadAction({ templateId: tpl, leadId, productId: product || null });
    if ("error" in r) { toast.error(r.error); return; }
    setM(r);
  });
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card><CardBody className="space-y-3">
        <Field label="Lead"><Input list="lf-leads" placeholder="Type to search…" defaultValue={leads.find((l) => l.id === leadId)?.name} onChange={(e) => { const l = leads.find((x) => x.name === e.target.value); if (l) setLeadId(l.id); }} /><datalist id="lf-leads">{leads.map((l) => <option key={l.id} value={l.name} />)}</datalist></Field>
        <Field label="Template"><Select value={tpl} onChange={(e) => setTpl(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Product"><Select value={product} onChange={(e) => setProduct(e.target.value)}><option value="">Best match (AI)</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Button className="w-full" disabled={!leadId || !tpl || pending} onClick={personalise}><Wand2 className="h-4 w-4" /> Personalise</Button>
        <p className="text-[11px] text-muted-fg">Tip: the lead page&apos;s “Scripts &amp; emails” tab has 3 AI-written A/B variants per lead.</p>
      </CardBody></Card>
      <Card><CardBody className="space-y-3">
        {!m ? <p className="text-sm text-muted-fg">Pick a lead and template, then press Personalise.</p> : <>
          <Field label={m.toIsGuess ? "To (guessed address — unverified)" : "To"}><Input value={m.to} onChange={(e) => setM({ ...m, to: e.target.value })} /></Field>
          <Field label="Subject"><Input value={m.subject} onChange={(e) => setM({ ...m, subject: e.target.value })} /></Field>
          <Textarea rows={12} className="prose-pre" value={m.body} onChange={(e) => setM({ ...m, body: e.target.value })} />
          <CheckBadges subject={m.subject} body={m.body} />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={`Subject: ${m.subject}\n\n${m.body}`} />
            <a className={buttonClass("outline", "sm")} href={mailtoLink(m.to, m.subject, m.body)}><Mail className="h-3.5 w-3.5" /> Mail app</a>
            <a className={buttonClass("outline", "sm")} target="_blank" rel="noreferrer" href={gmailComposeLink(m.to, m.subject, m.body)}><ExternalLink className="h-3.5 w-3.5" /> Gmail</a>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await gmailDraftAction({ leadId, ...m }); if ("error" in r && r.error) toast.error(r.error); else toast.success("Gmail draft created"); })}>Create Gmail draft</Button>
            <Button size="sm" variant="success" disabled={pending} onClick={() => start(async () => { await logEmailSentAction({ leadId, to: m.to, subject: m.subject, body: m.body, productId: m.productId, personId: m.personId, variant: templates.find((t) => t.id === tpl)?.name }); toast.success("Logged + follow-ups scheduled"); router.refresh(); })}><Send className="h-3.5 w-3.5" /> I sent this</Button>
          </div>
        </>}
      </CardBody></Card>
    </div>
  );
}

export function TemplateEditor({ templates }: { templates: { id: string; name: string; channel: string; subject: string; body: string }[] }) {
  const router = useRouter();
  const blank = { id: "", name: "", channel: "email", subject: "", body: `Hi {{first_name}},\n\n\n\n{{signature}}\n\n${OPT_OUT_LINE}` };
  const [t, setT] = React.useState(templates[0] ?? blank);
  const [pending, start] = React.useTransition();
  const unknown = templateVariables(t.body + t.subject).filter((v) => !VARS.includes(v));
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="p-2">
        <Button variant="ghost" className="w-full justify-start" onClick={() => setT(blank)}><Plus className="h-4 w-4" /> New template</Button>
        {templates.map((x) => <button key={x.id} onClick={() => setT(x)} className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${x.id === t.id ? "bg-muted" : ""}`}>{x.name}<span className="ml-2 text-[10px] text-muted-fg">{x.channel}</span></button>)}
      </Card>
      <Card><CardBody className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_140px]"><Field label="Name"><Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></Field><Field label="Channel"><Select value={t.channel} onChange={(e) => setT({ ...t, channel: e.target.value })}><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="linkedin">LinkedIn</option><option value="call">Call</option></Select></Field></div>
        {t.channel === "email" && <Field label="Subject"><Input value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} /></Field>}
        <Textarea rows={12} className="font-mono text-xs" value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} />
        <div className="flex flex-wrap gap-1">{VARS.map((v) => <button key={v} onClick={() => setT({ ...t, body: t.body + `{{${v}}}` })} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-primary/10">{`{{${v}}}`}</button>)}</div>
        {unknown.length > 0 && <p className="text-xs text-warning">Unknown variables: {unknown.join(", ")}</p>}
        {t.channel === "email" && <CheckBadges subject={t.subject} body={t.body} />}
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => start(async () => { const r = await saveTemplateAction({ ...t, id: t.id || undefined }); if ("error" in r && r.error) toast.error(r.error); else { toast.success("Saved"); router.refresh(); } })}>Save</Button>
          {t.id && <Button variant="ghost" disabled={pending} onClick={() => confirm("Delete template?") && start(async () => { await deleteTemplateAction(t.id); setT(blank); router.refresh(); })}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      </CardBody></Card>
    </div>
  );
}

export function SpamChecker() {
  const [s, setS] = React.useState("");
  const [b, setB] = React.useState("");
  return (
    <Card><CardHeader title="Paste any email to check it" /><CardBody className="space-y-3">
      <Input placeholder="Subject" value={s} onChange={(e) => setS(e.target.value)} />
      <Textarea rows={10} placeholder="Body" value={b} onChange={(e) => setB(e.target.value)} />
      {(s || b) && <CheckBadges subject={s} body={b} />}
    </CardBody></Card>
  );
}
