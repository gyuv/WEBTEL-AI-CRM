"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Phone, MessageCircle, Timer, SkipForward, Wand2, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Input, ScoreRing, Select, Textarea, buttonClass } from "@/components/ui";
import { CopyButton } from "@/components/client";
import { VoiceButton } from "@/components/voice";
import { logCallAction, summarizeNotesAction, updateLeadAction } from "@/app/actions";
import { generateScriptsIfMissing } from "./actions";
import { cn, statusLabel } from "@/lib/utils";

const OUTCOMES = [
  { id: "not_reachable", label: "Not reachable", key: "1", tone: "outline" },
  { id: "busy_callback", label: "Busy / call back", key: "2", tone: "outline" },
  { id: "gatekeeper", label: "Gatekeeper", key: "3", tone: "outline" },
  { id: "interested", label: "Interested", key: "4", tone: "success" },
  { id: "send_details", label: "Send details", key: "5", tone: "success" },
  { id: "meeting_booked", label: "Meeting booked", key: "6", tone: "success" },
  { id: "not_interested", label: "Not interested", key: "7", tone: "outline" },
  { id: "wrong_number", label: "Wrong number", key: "8", tone: "outline" },
  { id: "dnd", label: "DND / Do-not-call", key: "9", tone: "danger" },
] as const;

type Script = { short: string; long: string };
interface LeadData {
  id: string; name: string; category: string | null; area: string | null; city: string | null; status: string; score: number; whatsapp: string | null;
  phones: { e164: string; kind: string; dndChecked: boolean; suppressed: boolean }[];
  people: { id: string; name: string; title: string | null; dm: number }[];
  pains: string[]; pitch: { product: string; opening: string; objections: { objection: string; rebuttal: string }[] } | null;
  scripts: { en: Script; ta: Script; tanglish: Script } | null; gatekeeper: string[]; voicemail: string | null; whatsappMsg: string | null; history: string[];
}

export function CallDesk({ queue, lead, nextId, progress, bestTimes }: { queue: { id: string; name: string; score: number; status: string; area: string | null; nextFollowUpAt: string | null }[]; lead: LeadData; nextId: string | null; progress: { done: number; target: number }; bestTimes: string[] }) {
  const router = useRouter();
  const callable = lead.phones.filter((p) => !p.suppressed);
  const [phone, setPhone] = React.useState(callable.find((p) => p.kind === "mobile")?.e164 ?? callable[0]?.e164 ?? "");
  const [person, setPerson] = React.useState(lead.people[0]?.id ?? "");
  const [lang, setLang] = React.useState<"en" | "ta" | "tanglish">("en");
  const [len, setLen] = React.useState<"short" | "long">("short");
  const [notes, setNotes] = React.useState("");
  const [followUp, setFollowUp] = React.useState("");
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [pending, start] = React.useTransition();
  const [ai, setAi] = React.useState<{ summary: string; nextActions: string[] } | null>(null);
  const cur = lead.phones.find((p) => p.e164 === phone);

  React.useEffect(() => { try { const l = localStorage.getItem("lf:lang"); if (l) setLang(l as typeof lang); } catch { /* ignore */ } }, []);
  React.useEffect(() => { if (!startedAt) return; const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000); return () => clearInterval(t); }, [startedAt]);
  React.useEffect(() => { setNotes(""); setAi(null); setStartedAt(null); setElapsed(0); setFollowUp(""); setPhone(callable.find((p) => p.kind === "mobile")?.e164 ?? callable[0]?.e164 ?? ""); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);
  React.useEffect(() => { if (!lead.scripts) generateScriptsIfMissing(lead.id).then((r) => r && router.refresh()); }, [lead.id, lead.scripts, router]);

  const save = React.useCallback((outcome: string) => start(async () => {
    const r = await logCallAction({ leadId: lead.id, outcome, notes: [notes, ai ? `AI: ${ai.summary}` : ""].filter(Boolean).join("\n"), durationS: startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0, personId: person || null, phone, followUpAt: followUp || null });
    if ("error" in r && r.error) { toast.error(r.error); return; }
    toast.success(`Logged: ${outcome.replace(/_/g, " ")}`);
    router.push(nextId ? `/calls?lead=${nextId}` : "/calls");
    router.refresh();
  }), [lead.id, notes, ai, startedAt, person, phone, followUp, nextId, router]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const o = OUTCOMES.find((x) => x.key === e.key);
      if (o) { e.preventDefault(); save(o.id); }
      if (e.key === "n" && nextId) router.push(`/calls?lead=${nextId}`);
      if (e.key === "c" && phone) { setStartedAt(Date.now()); window.location.href = `tel:${phone}`; }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [save, nextId, phone, router]);

  const script = lead.scripts?.[lang]?.[len];
  const mm = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr_360px]">
      <Card className="hidden max-h-[calc(100dvh-110px)] overflow-hidden lg:block">
        <CardHeader title={`Today's calls (${queue.length})`} description={`${progress.done}/${progress.target} done today`} />
        <div className="h-1 bg-muted"><div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${Math.min(100, (progress.done / progress.target) * 100)}%` }} /></div>
        <ul className="max-h-[calc(100dvh-200px)] overflow-y-auto">
          {queue.map((q) => (
            <li key={q.id}><a href={`/calls?lead=${q.id}`} className={cn("flex items-center gap-2 border-b border-border px-3 py-2 text-sm hover:bg-muted/60", q.id === lead.id && "bg-primary/10")}>
              <ScoreRing value={q.score} size={28} /><div className="min-w-0 flex-1"><p className="truncate">{q.name}</p><p className="truncate text-[11px] text-muted-fg">{q.nextFollowUpAt ? `Follow-up ${new Date(q.nextFollowUpAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}` : statusLabel(q.status)}</p></div>
            </a></li>
          ))}
        </ul>
      </Card>

      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-primary/10 via-transparent to-accent/10 p-4">
            <div className="flex items-start gap-3">
              <ScoreRing value={lead.score} size={48} />
              <div className="min-w-0 flex-1"><a href={`/leads/${lead.id}`} className="text-lg font-semibold leading-tight hover:underline">{lead.name}</a><p className="text-sm text-muted-fg">{[lead.category, lead.area ?? lead.city].filter(Boolean).join(" · ")}</p><Badge className="mt-1">{statusLabel(lead.status)}</Badge></div>
              {nextId && <a href={`/calls?lead=${nextId}`} className={buttonClass("ghost", "sm")} title="Skip (N)"><SkipForward className="h-4 w-4" /></a>}
            </div>
            {cur && !cur.dndChecked && <div className="mt-3 flex items-center gap-2 rounded-md bg-warning/15 p-2 text-xs text-warning"><AlertTriangle className="h-4 w-4 shrink-0" /><span className="flex-1">DND not checked for this number. Verify on the TRAI NCPR registry before a promotional call.</span><Button size="sm" variant="outline" onClick={() => start(async () => { await updateLeadAction(lead.id, { dndChecked: true }); router.refresh(); })}>Mark checked</Button></div>}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Select value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 text-base" aria-label="Number">{callable.map((p) => <option key={p.e164} value={p.e164}>{p.e164} · {p.kind}</option>)}</Select>
              {lead.people.length > 0 && <Select value={person} onChange={(e) => setPerson(e.target.value)} className="h-11" aria-label="Ask for">{lead.people.map((p) => <option key={p.id} value={p.id}>Ask for {p.name}{p.title ? ` (${p.title})` : ""}</option>)}</Select>}
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <a href={phone ? `tel:${phone}` : undefined} onClick={() => setStartedAt(Date.now())} className={buttonClass("success", "xl", "w-full text-xl shadow-lg shadow-success/20")}><Phone className="h-6 w-6" /> Call {phone ? "" : "(no number)"}</a>
              <a href={`https://wa.me/${(lead.whatsapp ?? phone).replace(/\D/g, "")}${lead.whatsappMsg ? `?text=${encodeURIComponent(lead.whatsappMsg)}` : ""}`} target="_blank" rel="noreferrer" className={buttonClass("outline", "xl", "px-5")} aria-label="WhatsApp"><MessageCircle className="h-6 w-6 text-success" /></a>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-fg">
              <span className="flex items-center gap-1"><Timer className="h-3.5 w-3.5" />{startedAt ? <b className="tabular-nums text-fg">{mm}</b> : <button onClick={() => setStartedAt(Date.now())} className="underline">start timer</button>}</span>
              <span className="hidden sm:inline">Shortcuts: <span className="kbd">C</span> call <span className="kbd">1</span>–<span className="kbd">9</span> outcome <span className="kbd">N</span> next</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Script" action={<div className="flex gap-1">
            <Select className="h-8 w-auto text-xs" value={lang} onChange={(e) => { setLang(e.target.value as typeof lang); try { localStorage.setItem("lf:lang", e.target.value); } catch { /* ignore */ } }} aria-label="Language"><option value="en">English</option><option value="ta">தமிழ்</option><option value="tanglish">Tanglish</option></Select>
            <Select className="h-8 w-auto text-xs" value={len} onChange={(e) => setLen(e.target.value as typeof len)} aria-label="Length"><option value="short">30s</option><option value="long">2 min</option></Select>
          </div>} />
          <CardBody>{script ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{script}</p> : <p className="flex items-center gap-2 text-sm text-muted-fg"><Loader2 className="h-4 w-4 animate-spin" /> Preparing script…</p>}
            {lead.gatekeeper.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-fg">Gatekeeper lines</summary><ul className="mt-1 space-y-1">{lead.gatekeeper.map((g, i) => <li key={i}>• {g}</li>)}</ul></details>}
            {lead.voicemail && <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted-fg">Voicemail</summary><p className="mt-1">{lead.voicemail}</p></details>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Outcome" description="Logs the call, updates status, schedules the follow-up and moves to the next lead." />
          <CardBody className="space-y-3">
            <div className="relative">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (what they said, next step, best time to call back)…" rows={3} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <VoiceButton onText={(t) => setNotes((n) => (n ? n + " " : "") + t)} lang={lang === "ta" ? "ta-IN" : "en-IN"} />
              <Button size="sm" variant="outline" disabled={!notes.trim() || pending} onClick={() => start(async () => { const r = await summarizeNotesAction(notes, lead.name); setAi(r); if (r.followUpInDays) setFollowUp(new Date(Date.now() + r.followUpInDays * 86400000).toISOString().slice(0, 16)); })}><Wand2 className="h-3.5 w-3.5" /> AI next actions</Button>
              <label className="ml-auto flex items-center gap-1 text-xs text-muted-fg">Follow-up <Input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="h-8 w-auto text-xs" /></label>
            </div>
            {ai && <div className="rounded-md bg-muted p-2 text-sm"><p>{ai.summary}</p><ul className="mt-1 list-inside list-disc text-xs">{ai.nextActions.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {OUTCOMES.map((o) => (
                <Button key={o.id} variant={o.tone as "outline" | "success" | "danger"} disabled={pending} onClick={() => save(o.id)} className="h-12 justify-between">
                  <span>{o.label}</span><span className="kbd">{o.key}</span>
                </Button>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4">
        {lead.pitch && <Card><CardHeader title={`Pitch: ${lead.pitch.product}`} /><CardBody className="space-y-2 text-sm"><p className="rounded-md bg-primary/10 p-2">{lead.pitch.opening}</p>{lead.pains.length > 0 && <div><p className="text-xs text-muted-fg">Pain points</p><ul className="list-inside list-disc">{lead.pains.map((p) => <li key={p}>{p}</li>)}</ul></div>}</CardBody></Card>}
        {lead.pitch && lead.pitch.objections.length > 0 && <Card><CardHeader title="Objections" /><CardBody className="space-y-2 text-sm">{lead.pitch.objections.map((o, i) => <details key={i}><summary className="cursor-pointer font-medium">“{o.objection}”</summary><p className="mt-1 text-muted-fg">{o.rebuttal}</p></details>)}</CardBody></Card>}
        <Card><CardHeader title="Previous notes" /><CardBody className="space-y-1.5 text-xs">{lead.history.length ? lead.history.map((h, i) => <p key={i}>{h}</p>) : <p className="text-muted-fg">First contact.</p>}</CardBody></Card>
        <Card><CardHeader title="Best time to call" /><CardBody className="text-xs">{bestTimes.length ? bestTimes.map((t) => <p key={t}>🕐 {t}</p>) : <p className="text-muted-fg">Log more calls to learn your best hours. Typical Chennai SMB owners: 10:30–12:30 and 15:30–17:30; avoid lunch 13:00–14:30.</p>}</CardBody></Card>
        {nextId && <a href={`/calls?lead=${nextId}`} className={buttonClass("outline", "md", "w-full")}>Next lead <ChevronRight className="h-4 w-4" /></a>}
        {lead.whatsappMsg && <CopyButton text={lead.whatsappMsg} label="Copy WhatsApp message" className="w-full" />}
      </div>
    </div>
  );
}
