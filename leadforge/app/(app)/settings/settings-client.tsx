"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Download, KeyRound, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { CopyButton } from "@/components/client";
import { saveProfileAction, saveSettingsAction, saveApiKeyAction, suppressionAction, deleteAllDataAction, regenerateExtensionTokenAction, disconnectGmailAction, restoreBackupAction } from "@/app/actions";
import type { AppSettings, LlmId, ProviderId } from "@/lib/settings-types";

type Keys = Record<string, { set: boolean; source: "env" | "db" | null; last4?: string | null }>;

function useSave() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<unknown>, ok = "Saved") => start(async () => {
    const r = (await fn()) as { error?: string; redirect?: string } | undefined;
    if (r?.error) toast.error(r.error); else { toast.success(ok); if (r?.redirect) router.push(r.redirect); else router.refresh(); }
  });
  return { pending, run };
}

export function ProfileForm({ p }: { p: { displayName: string; companyName: string; services: string; tone: string; signature: string; meetingLink: string; phone: string; languages: string[] } }) {
  const [f, setF] = React.useState(p);
  const { pending, run } = useSave();
  return (
    <Card><CardBody className="grid gap-3 sm:grid-cols-2">
      <Field label="Your name"><Input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
      <Field label="Company"><Input value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} /></Field>
      <Field label="Phone (used in scripts & voicemail)"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="Meeting / calendar link"><Input value={f.meetingLink} onChange={(e) => setF({ ...f, meetingLink: e.target.value })} placeholder="https://calendar.app.google/…" /></Field>
      <Field label="Tone"><Select value={f.tone} onChange={(e) => setF({ ...f, tone: e.target.value })}><option value="friendly-professional">Friendly & professional</option><option value="formal">Formal</option><option value="casual">Casual</option><option value="consultative">Consultative</option></Select></Field>
      <Field label="Languages" hint="Comma separated"><Input value={f.languages.join(", ")} onChange={(e) => setF({ ...f, languages: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>
      <Field label="What you sell (one paragraph)" className="sm:col-span-2"><Textarea value={f.services} onChange={(e) => setF({ ...f, services: e.target.value })} /></Field>
      <Field label="Email signature" className="sm:col-span-2"><Textarea value={f.signature} onChange={(e) => setF({ ...f, signature: e.target.value })} /></Field>
      <div><Button disabled={pending} onClick={() => run(() => saveProfileAction(f))}>Save profile</Button></div>
    </CardBody></Card>
  );
}

const PROVIDERS: { id: ProviderId; label: string; desc: string; key?: string; paid?: boolean }[] = [
  { id: "osm", label: "OpenStreetMap Overpass", desc: "Free, no key. Primary business source." },
  { id: "nominatim", label: "Nominatim geocoding", desc: "Free, no key. 1 request/second." },
  { id: "website", label: "Company website crawl", desc: "Polite crawler; respects robots.txt; never visits LinkedIn." },
  { id: "publicdata", label: "Public data (news/registry pages)", desc: "Only pages that allow crawling." },
  { id: "searxng", label: "SearXNG (self-hosted)", desc: "Unlimited free web search if you run it (Docker)." },
  { id: "cse", label: "Google Programmable Search", desc: "100 free queries/day. Needs key + CX id.", key: "cse" },
  { id: "brave", label: "Brave Search API", desc: "~2,000 free queries/month. May require a card to sign up.", key: "brave", paid: true },
  { id: "directories", label: "Public directories", desc: "Only if their robots.txt allows. Skipped + logged otherwise." },
  { id: "places", label: "Google Places API (New)", desc: "Needs a billing account (card). Off by default with a hard daily budget.", key: "places", paid: true },
];

export function ProvidersForm({ s, keys }: { s: AppSettings; keys: Keys }) {
  const [f, setF] = React.useState(s);
  const { pending, run } = useSave();
  return (
    <div className="space-y-4">
      <Card className={f.mockMode ? "border-warning/40" : ""}><CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1"><p className="font-medium">Mock mode {f.mockMode ? <Badge tone="warning">ON</Badge> : <Badge tone="success">OFF — live data</Badge>}</p><p className="text-sm text-muted-fg">Mock mode uses realistic fake Chennai data and the rule-based AI so you can demo with zero keys. Turn it off to use OpenStreetMap, websites and your LLM keys.</p></div>
        <Button variant={f.mockMode ? "primary" : "outline"} disabled={pending} onClick={() => { const m = !f.mockMode; setF({ ...f, mockMode: m }); run(() => saveSettingsAction({ mockMode: m }), m ? "Mock mode on" : "Live mode on"); }}>{f.mockMode ? "Switch to live data" : "Switch to mock mode"}</Button>
      </CardBody></Card>
      <Card><CardHeader title="Data sources" description="Each source has rate limiting, retries, caching and a usage counter." />
        <CardBody className="divide-y divide-border p-0">
          {PROVIDERS.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-start gap-3 px-4 py-3">
              <input type="checkbox" className="mt-1" checked={f.providers[p.id]} onChange={(e) => setF({ ...f, providers: { ...f.providers, [p.id]: e.target.checked } })} />
              <div className="flex-1"><p className="flex items-center gap-2 text-sm font-medium">{p.label}{p.paid && <Badge tone="warning">card may be required</Badge>}{p.key && (keys[p.key]?.set ? <Badge tone="success">key set</Badge> : <Badge>no key</Badge>)}</p><p className="text-xs text-muted-fg">{p.desc}</p></div>
            </label>
          ))}
        </CardBody>
        <CardBody className="grid gap-3 border-t border-border sm:grid-cols-2">
          <Field label="SearXNG URL"><Input value={f.searxngUrl} onChange={(e) => setF({ ...f, searxngUrl: e.target.value })} placeholder="http://localhost:8080" /></Field>
          <Field label="Google CSE CX id"><Input value={f.cseCx} onChange={(e) => setF({ ...f, cseCx: e.target.value })} /></Field>
          <Field label="Google Places daily budget (requests)"><Input type="number" value={f.placesDailyBudget} onChange={(e) => setF({ ...f, placesDailyBudget: Number(e.target.value) })} /></Field>
          <Field label="Default city"><Input value={f.defaultCity} onChange={(e) => setF({ ...f, defaultCity: e.target.value })} /></Field>
          <Field label="Crawler contact (added to User-Agent)" hint="Email or URL so site owners can reach you"><Input value={f.userAgentContact} onChange={(e) => setF({ ...f, userAgentContact: e.target.value })} /></Field>
          <Field label="Allowed directory domains" hint="One per line; checked against robots.txt first"><Textarea rows={2} value={f.directories.join("\n")} onChange={(e) => setF({ ...f, directories: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></Field>
          <div><Button disabled={pending} onClick={() => { if (f.providers.places && !s.providers.places && !confirm("Google Places requires a billing account. LeadForge enforces your daily budget, but you are responsible for charges. Enable?")) return; run(() => saveSettingsAction({ providers: f.providers, searxngUrl: f.searxngUrl, cseCx: f.cseCx, placesDailyBudget: f.placesDailyBudget, defaultCity: f.defaultCity, userAgentContact: f.userAgentContact, directories: f.directories })); }}>Save sources</Button></div>
        </CardBody>
      </Card>
    </div>
  );
}

export function LlmForm({ s, keys }: { s: AppSettings; keys: Keys }) {
  const [order, setOrder] = React.useState<LlmId[]>(s.llmOrder);
  const [models, setModels] = React.useState(s.models);
  const [ollama, setOllama] = React.useState(s.ollamaUrl);
  const { pending, run } = useSave();
  const move = (i: number, d: number) => { const o = [...order]; const [x] = o.splice(i, 1); o.splice(i + d, 0, x); setOrder(o); };
  const info: Record<LlmId, string> = { gemini: "Google AI Studio free tier (default)", groq: "Groq free tier — very fast", openrouter: "OpenRouter ':free' models", ollama: "Local, unlimited, offline" };
  return (
    <Card><CardHeader title="LLM fallback order" description="On rate-limit or error LeadForge tries the next one. Every result is cached in the database to save quota. With none available, the rule-based engine is used (never invents facts)." />
      <CardBody className="space-y-2">
        {order.map((id, i) => (
          <div key={id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
            <span className="w-5 text-center text-xs text-muted-fg">{i + 1}</span>
            <div className="min-w-[160px] flex-1"><p className="text-sm font-medium capitalize">{id} {id === "ollama" ? <Badge>local</Badge> : keys[id]?.set ? <Badge tone="success">key set</Badge> : <Badge tone="warning">no key — skipped</Badge>}</p><p className="text-xs text-muted-fg">{info[id]}</p></div>
            <Input className="h-8 w-56 text-xs" value={models[id]} onChange={(e) => setModels({ ...models, [id]: e.target.value })} aria-label={`${id} model`} />
            <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Up"><ArrowUp className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Down"><ArrowDown className="h-4 w-4" /></Button>
          </div>
        ))}
        <Field label="Ollama URL"><Input value={ollama} onChange={(e) => setOllama(e.target.value)} /></Field>
        <Button disabled={pending} onClick={() => run(() => saveSettingsAction({ llmOrder: order, models, ollamaUrl: ollama }))}>Save AI settings</Button>
      </CardBody>
    </Card>
  );
}

const KEY_FIELDS = [
  { id: "gemini", label: "Google Gemini API key", help: "aistudio.google.com → Get API key (free, no card)" },
  { id: "groq", label: "Groq API key", help: "console.groq.com → API keys (free)" },
  { id: "openrouter", label: "OpenRouter API key", help: "openrouter.ai → Keys (free models)" },
  { id: "cse", label: "Google Programmable Search API key", help: "developers.google.com/custom-search (100/day free)" },
  { id: "brave", label: "Brave Search API key", help: "api.search.brave.com (free plan)" },
  { id: "places", label: "Google Places API key (billing required)", help: "Optional. Keep off unless you accept possible charges." },
  { id: "gmail_client_id", label: "Google OAuth client ID (Gmail)", help: "console.cloud.google.com → Credentials → OAuth client (Web)" },
  { id: "gmail_client_secret", label: "Google OAuth client secret (Gmail)", help: "" },
];

export function KeysForm({ keys }: { keys: Keys }) {
  const { pending, run } = useSave();
  const [vals, setVals] = React.useState<Record<string, string>>({});
  return (
    <Card><CardHeader title="API keys" description="Encrypted at rest (AES-256-GCM) and only used server-side. Environment variables override these." />
      <CardBody className="space-y-3">
        {KEY_FIELDS.map((k) => (
          <div key={k.id} className="grid gap-2 sm:grid-cols-[260px_1fr_auto_auto] sm:items-center">
            <div><p className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-3.5 w-3.5" />{k.label}</p><p className="text-[11px] text-muted-fg">{k.help}</p></div>
            <Input type="password" autoComplete="off" placeholder={keys[k.id]?.set ? (keys[k.id].source === "env" ? "set via environment" : `•••• ${keys[k.id].last4 ?? ""}`) : "not set"} value={vals[k.id] ?? ""} onChange={(e) => setVals({ ...vals, [k.id]: e.target.value })} disabled={keys[k.id]?.source === "env"} />
            <Button size="sm" disabled={pending || !vals[k.id]} onClick={() => { run(() => saveApiKeyAction(k.id, vals[k.id])); setVals({ ...vals, [k.id]: "" }); }}>Save</Button>
            <Button size="sm" variant="ghost" disabled={pending || keys[k.id]?.source !== "db"} onClick={() => run(() => saveApiKeyAction(k.id, null), "Removed")}>Clear</Button>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

export function UsageMeter({ meters }: { meters: { id: string; label: string; note: string; limit: number | null; used: number }[] }) {
  return (
    <Card><CardHeader title="Free-tier usage today" description="Warnings at 80%. Calls stop automatically at the limit so you never pay." />
      <CardBody className="grid gap-3 md:grid-cols-2">
        {meters.map((m) => {
          const pct = m.limit ? Math.min(100, Math.round((m.used / m.limit) * 100)) : 0;
          return (
            <div key={m.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between text-sm"><span className="font-medium">{m.label}</span><span className="tabular-nums text-muted-fg">{m.used}{m.limit ? ` / ${m.limit}` : " · unlimited"}</span></div>
              {m.limit && <div className="mt-2 h-1.5 rounded-full bg-muted"><div className={`h-full rounded-full ${pct >= 80 ? "bg-danger" : pct >= 50 ? "bg-warning" : "bg-success"}`} style={{ width: `${pct}%` }} /></div>}
              <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-fg">{pct >= 80 && <AlertTriangle className="h-3 w-3 text-danger" />}{m.note}</p>
            </div>
          );
        })}
        <p className="text-xs text-muted-fg md:col-span-2">Supabase free: 500 MB database, 1 GB storage; projects pause after 7 days of inactivity (the daily cron keeps it awake). Vercel Hobby: 1 cron/day — use the included GitHub Action for 15-minute ticks.</p>
      </CardBody>
    </Card>
  );
}

export function TargetsForm({ s }: { s: AppSettings }) {
  const [t, setT] = React.useState({ ...s.targets, coldAfterDays: s.coldAfterDays });
  const { pending, run } = useSave();
  return (
    <Card><CardBody className="grid gap-3 sm:grid-cols-3">
      <Field label="Calls per day"><Input type="number" value={t.callsPerDay} onChange={(e) => setT({ ...t, callsPerDay: Number(e.target.value) })} /></Field>
      <Field label="Cold emails per day" hint="New domain: 30–40 max"><Input type="number" value={t.emailsPerDay} onChange={(e) => setT({ ...t, emailsPerDay: Number(e.target.value) })} /></Field>
      <Field label="Mark cold after (days of silence)"><Input type="number" value={t.coldAfterDays} onChange={(e) => setT({ ...t, coldAfterDays: Number(e.target.value) })} /></Field>
      <div><Button disabled={pending} onClick={() => run(() => saveSettingsAction({ targets: { callsPerDay: t.callsPerDay, emailsPerDay: t.emailsPerDay }, coldAfterDays: t.coldAfterDays }))}>Save targets</Button></div>
    </CardBody></Card>
  );
}

export function GmailForm({ connected, compose, hasClient }: { connected: boolean; compose: boolean; hasClient: boolean }) {
  const { pending, run } = useSave();
  return (
    <Card><CardHeader title="Gmail (optional)" description="Read-only by default: LeadForge fetches replies to match them to leads. 'Drafts' adds the compose scope so it can create drafts — it never sends." />
      <CardBody className="space-y-3 text-sm">
        {connected ? <p className="flex items-center gap-2 text-success"><CheckCircle2 className="h-4 w-4" /> Connected {compose ? "(read + drafts)" : "(read-only)"}</p> : <p className="text-muted-fg">Not connected.</p>}
        {!hasClient && <ol className="list-inside list-decimal space-y-1 text-xs text-muted-fg"><li>console.cloud.google.com → new project → enable “Gmail API”.</li><li>OAuth consent screen → External → add yourself as a test user (no verification needed for personal use).</li><li>Credentials → OAuth client ID → Web → redirect URI: <code>{typeof window !== "undefined" ? window.location.origin : ""}/api/gmail/callback</code></li><li>Paste client ID + secret in the API keys tab.</li></ol>}
        <div id="gmail" className="flex flex-wrap gap-2">
          <a className={`inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-fg ${hasClient ? "" : "pointer-events-none opacity-50"}`} href="/api/gmail/connect">Connect (read-only)</a>
          <a className={`inline-flex h-9 items-center rounded-md border border-border px-4 text-sm ${hasClient ? "" : "pointer-events-none opacity-50"}`} href="/api/gmail/connect?compose=1">Connect with drafts</a>
          {connected && <Button variant="ghost" disabled={pending} onClick={() => run(disconnectGmailAction, "Disconnected")}>Disconnect</Button>}
        </div>
      </CardBody>
    </Card>
  );
}

export function ExtensionForm({ hasToken }: { hasToken: boolean }) {
  const [token, setToken] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);
  return (
    <Card id="extension"><CardHeader title="Browser extension (Chrome / Edge)" description="Captures only what YOU are viewing, only when YOU click. No automation, scrolling or bulk crawling." />
      <CardBody className="space-y-3 text-sm">
        <ol className="list-inside list-decimal space-y-1 text-muted-fg"><li>Open <code>chrome://extensions</code> → enable Developer mode → Load unpacked → select the <code>leadforge/extension</code> folder.</li><li>Open the extension options and paste your LeadForge URL and token.</li><li>On a profile or company “People” page, click the extension → <b>Send to LeadForge</b>.</li></ol>
        <Field label="LeadForge URL"><div className="flex gap-2"><Input readOnly value={origin} /><CopyButton text={origin} /></div></Field>
        {token ? <Field label="Token (shown once)"><div className="flex gap-2"><Input readOnly value={token} /><CopyButton text={token} /></div></Field> : <p className="text-muted-fg">{hasToken ? "A token exists. Generate a new one to replace it." : "No token yet."}</p>}
        <Button onClick={async () => { const r = await regenerateExtensionTokenAction(); setToken(r.token); }}>{hasToken ? "Regenerate token" : "Generate token"}</Button>
      </CardBody>
    </Card>
  );
}

export function SuppressionForm({ items, s }: { items: { kind: string; value: string; reason: string; at: string }[]; s: AppSettings }) {
  const [f, setF] = React.useState({ kind: "email" as "email" | "phone" | "domain", value: "", reason: "" });
  const { pending, run } = useSave();
  return (
    <div className="space-y-4">
      <Card><CardHeader title="Compliance built in" /><CardBody className="grid gap-2 text-sm sm:grid-cols-2">
        {["robots.txt is always respected; disallowed pages are skipped and logged.", "Crawler identifies itself (LeadForgeBot) with your contact.", "LinkedIn, Facebook, Instagram and Google are never fetched.", "No captcha or login bypass — challenged pages are skipped.", "Guessed emails are always labelled as guesses.", "Unsubscribe/bounce replies are auto-suppressed; no reply drafts.", "TRAI DND warning on every call + manual “DND checked” flag.", "Only business contact data is stored (DPDP Act 2023 aware). Export/delete anytime."].map((t) => <p key={t} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-success" />{t}</p>)}
        <p className="text-xs text-muted-fg sm:col-span-2">Crawler contact: {s.userAgentContact || "not set (Data sources tab)"} · Public privacy & opt-out page: <a className="text-primary" href="/legal">/legal</a></p>
      </CardBody></Card>
      <Card><CardHeader title={`Suppression / do-not-contact list (${items.length})`} />
        <CardBody className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[120px_1fr_1fr_auto]">
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}><option value="email">Email</option><option value="phone">Phone (E.164)</option><option value="domain">Domain</option></Select>
            <Input placeholder="value" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
            <Input placeholder="reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
            <Button disabled={pending || !f.value} onClick={() => { run(() => suppressionAction(f.kind, f.value, f.reason)); setF({ ...f, value: "", reason: "" }); }}>Add</Button>
          </div>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto text-sm">{items.map((x) => <li key={x.kind + x.value} className="flex items-center gap-2 py-1.5"><Badge>{x.kind}</Badge><span className="flex-1 font-mono text-xs">{x.value}</span><span className="text-xs text-muted-fg">{x.reason}</span><Button size="sm" variant="ghost" onClick={() => run(() => suppressionAction(x.kind as "email", x.value, "", true), "Removed")}>Remove</Button></li>)}</ul>
        </CardBody>
      </Card>
    </div>
  );
}

export function DataForm() {
  const [confirmText, setConfirm] = React.useState("");
  const [restoring, setRestoring] = React.useState(false);
  const { pending, run } = useSave();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader title="Export & backup" /><CardBody className="flex flex-wrap gap-2">
        <a className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted" href="/api/export?kind=json"><Download className="h-4 w-4" /> Full backup (JSON)</a>
        <a className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted" href="/api/export?format=csv"><Download className="h-4 w-4" /> Leads CSV</a>
        <a className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted" href="/api/export?format=xlsx"><Download className="h-4 w-4" /> Leads XLSX</a>
      </CardBody></Card>
      <Card><CardHeader title="Restore from backup" /><CardBody>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border p-4 text-sm text-muted-fg hover:bg-muted">{restoring && <Loader2 className="h-4 w-4 animate-spin" />}Choose backup .json
          <input type="file" accept="application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setRestoring(true); const r = await restoreBackupAction(await f.text()); setRestoring(false); if ("error" in r && r.error) toast.error(r.error); else toast.success(`Restored ${"restored" in r ? r.restored : 0} rows`); }} />
        </label>
      </CardBody></Card>
      <Card className="border-danger/40 md:col-span-2"><CardHeader title="Delete all data" description="Permanently deletes leads, people, products, logs and settings data for your account." /><CardBody className="flex gap-2">
        <Input placeholder='Type "DELETE"' value={confirmText} onChange={(e) => setConfirm(e.target.value)} className="max-w-xs" />
        <Button variant="danger" disabled={pending || confirmText !== "DELETE"} onClick={() => run(() => deleteAllDataAction(confirmText), "All data deleted")}>Delete everything</Button>
      </CardBody></Card>
    </div>
  );
}
