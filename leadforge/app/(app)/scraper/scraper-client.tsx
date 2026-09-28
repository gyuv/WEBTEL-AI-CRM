"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2, Radar, Globe, ClipboardPaste, MapPin, CheckCircle2 } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Textarea, buttonClass } from "@/components/ui";
import { JobProgress } from "@/components/client";
import { sweepAction, scrapeSiteAction, bulkPasteAction } from "@/app/actions";

function Options({ o, set }: { o: { requirePhone: boolean; addToCallQueue: boolean; autoEnrich: boolean }; set: (v: typeof o) => void }) {
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" checked={o.requirePhone} onChange={(e) => set({ ...o, requirePhone: e.target.checked })} /> Only leads with a phone</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={o.addToCallQueue} onChange={(e) => set({ ...o, addToCallQueue: e.target.checked })} /> Add to today&apos;s call queue</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={o.autoEnrich} onChange={(e) => set({ ...o, autoEnrich: e.target.checked })} /> Auto-enrich (website, people, pitch)</label>
    </div>
  );
}

function Runs({ jobIds, searchId }: { jobIds: string[]; searchId: string }) {
  return (
    <div className="space-y-2">
      {jobIds.map((j, i) => <JobProgress key={j} jobId={j} label={`Part ${i + 1}/${jobIds.length}`} />)}
      <a href={`/leads?search=${searchId}`} className={buttonClass("outline", "sm")}>View scraped leads →</a>
    </div>
  );
}

function Chips({ all, value, onChange }: { all: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return <div className="flex flex-wrap gap-1.5">{all.map((c) => { const on = value.includes(c); return <button key={c} type="button" onClick={() => onChange(on ? value.filter((x) => x !== c) : [...value, c])} className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-fg hover:text-fg"}`}>{on && "✓ "}{c}</button>; })}</div>;
}

export function SweepForm({ presets, places, city: defCity }: { presets: string[]; places: readonly string[]; city: string }) {
  const [cats, setCats] = React.useState<string[]>([]);
  const [custom, setCustom] = React.useState("");
  const [areas, setAreas] = React.useState<string[]>([]);
  const [city, setCity] = React.useState(defCity);
  const [radius, setRadius] = React.useState(5);
  const [per, setPer] = React.useState(60);
  const [o, setO] = React.useState({ requirePhone: true, addToCallQueue: true, autoEnrich: true });
  const [run, setRun] = React.useState<{ jobIds: string[]; searchId: string } | null>(null);
  const [pending, start] = React.useTransition();
  const allCats = [...cats, ...custom.split(",").map((x) => x.trim()).filter(Boolean)];
  const combos = allCats.length * Math.max(areas.length, 1);
  return (
    <Card><CardHeader title="Area sweep" description="Every category × every area in one click. Source: OpenStreetMap (free, no key). Add Google Places in Settings for extra coverage (optional)." />
      <CardBody className="space-y-4">
        <Field label="Categories"><Chips all={presets} value={cats} onChange={setCats} /></Field>
        <Field label="Custom categories (comma separated)"><Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. interior designers, tiles shop, printing press" /></Field>
        <Field label={`Areas (${areas.length || "whole city"})`}><Chips all={places} value={areas} onChange={setAreas} /></Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field>
          <Field label="Radius per area (km)"><Input type="number" min={1} max={30} value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></Field>
          <Field label="Max per category × area"><Input type="number" min={1} max={200} value={per} onChange={(e) => setPer(Number(e.target.value))} /></Field>
        </div>
        <Options o={o} set={setO} />
        <div className="flex items-center gap-3">
          <Button size="lg" disabled={pending || !allCats.length} onClick={() => start(async () => { const r = await sweepAction({ categories: allCats, areas, city, radiusKm: radius, perQuery: per, ...o }); if ("error" in r && r.error) toast.error(r.error); else if ("jobIds" in r) setRun(r as { jobIds: string[]; searchId: string }); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />} Start sweep</Button>
          <span className="text-xs text-muted-fg">{combos} search{combos === 1 ? "" : "es"} · up to {combos * per} businesses</span>
        </div>
        {run && <Runs {...run} />}
      </CardBody>
    </Card>
  );
}

export function SiteForm({ city }: { city: string }) {
  const [urls, setUrls] = React.useState("");
  const [pages, setPages] = React.useState(10);
  const [category, setCategory] = React.useState("");
  const [o, setO] = React.useState({ requirePhone: true, addToCallQueue: true, autoEnrich: false });
  const [run, setRun] = React.useState<{ jobIds: string[]; searchId: string } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Card><CardHeader title="Website / directory scraper" description="Paste any page that lists businesses — association member lists, trade directories, exhibitor lists, dealer locators, chamber of commerce pages. It extracts name, phone, email, website and address from every entry and follows “Next” pages." />
      <CardBody className="space-y-4">
        <Textarea rows={5} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={"https://example-association.org/members\nhttps://expo-site.in/exhibitors?page=1"} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Pages to follow per URL"><Input type="number" min={1} max={50} value={pages} onChange={(e) => setPages(Number(e.target.value))} /></Field>
          <Field label="Category (optional)"><Input value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
          <Field label="City"><Input defaultValue={city} id="site-city" /></Field>
        </div>
        <Options o={o} set={setO} />
        <p className="text-xs text-muted-fg">Respects each site&apos;s robots.txt and waits between pages. Pages that block robots, need a login or show a captcha are skipped and listed in the job log — they are never bypassed.</p>
        <Button size="lg" disabled={pending || !urls.trim()} onClick={() => start(async () => { const r = await scrapeSiteAction({ urls: urls.split(/\s+/), maxPages: pages, category, city: (document.getElementById("site-city") as HTMLInputElement)?.value, ...o }); if ("error" in r && r.error) toast.error(r.error); else if ("jobIds" in r) setRun(r as { jobIds: string[]; searchId: string }); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Scrape pages</Button>
        {run && <Runs {...run} />}
      </CardBody>
    </Card>
  );
}

export function PasteForm({ city: defCity }: { city: string }) {
  const [text, setText] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [city, setCity] = React.useState(defCity);
  const [o, setO] = React.useState({ requirePhone: true, addToCallQueue: true, autoEnrich: false });
  const [res, setRes] = React.useState<{ created: number; merged: number; searchId: string } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Card><CardHeader title="Bulk paste" description="Paste anything with phone numbers — WhatsApp forwards, copied directory pages, PDF text, Excel columns. Each line or block with a number becomes a lead." />
      <CardBody className="space-y-4">
        <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Sri Murugan Traders - 98400 12345\nKaveri Dental Clinic, Anna Nagar 044 2626 1234\n…"} />
        <div className="grid grid-cols-2 gap-3"><Field label="Category"><Input value={category} onChange={(e) => setCategory(e.target.value)} /></Field><Field label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field></div>
        <Options o={o} set={setO} />
        <Button size="lg" disabled={pending || !text.trim()} onClick={() => start(async () => { const r = await bulkPasteAction({ text, category, city, addToCallQueue: o.addToCallQueue, autoEnrich: o.autoEnrich }); if ("error" in r && r.error) toast.error(r.error); else if ("searchId" in r) { setRes(r as { created: number; merged: number; searchId: string }); toast.success(`${r.created} new, ${r.merged} merged`); } })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />} Extract leads</Button>
        {res && <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" />{res.created} new · {res.merged} duplicates merged · <a className="text-primary underline" href={`/leads?search=${res.searchId}`}>view</a> · <a className="text-primary underline" href="/calls">start calling</a></p>}
      </CardBody>
    </Card>
  );
}

export function MapsCapture({ hasToken }: { hasToken: boolean }) {
  return (
    <Card><CardHeader title="Google Maps capture (via the LeadForge extension)" description="You search Maps in your own browser; one click saves every business currently listed — name, phone, address, rating, reviews, website, category." />
      <CardBody className="space-y-3 text-sm">
        <ol className="list-inside list-decimal space-y-1.5">
          <li>Install the extension: <code>chrome://extensions</code> → Developer mode → Load unpacked → <code>leadforge/extension</code>.</li>
          <li>{hasToken ? <Badge tone="success">Token set</Badge> : <a className="text-primary underline" href="/settings">Generate an extension token in Settings → Extension</a>} and paste the URL + token into the extension options.</li>
          <li>Open <a className="text-primary underline" href="https://www.google.com/maps/search/dental+clinics+in+anna+nagar" target="_blank" rel="noreferrer">Google Maps</a> and search e.g. “dental clinics in Anna Nagar”.</li>
          <li>Scroll the results list yourself as far as you like, then click the extension → <b>Read this page</b> → <b>Send to LeadForge</b>. Open a single place to capture its phone and website too.</li>
          <li>Leads appear in <a className="text-primary underline" href="/leads">Leads</a> and today&apos;s <a className="text-primary underline" href="/calls">call queue</a>, deduped.</li>
        </ol>
        <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-fg"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />The extension only reads what is on your screen when you click — it doesn&apos;t scroll, open places or run in the background. Automated Google Maps scraping breaks Google&apos;s terms and gets IPs blocked, so LeadForge doesn&apos;t do it.</p>
      </CardBody>
    </Card>
  );
}

export function QuickSearch({ city }: { city: string }) {
  const [what, setWhat] = React.useState("");
  const [where, setWhere] = React.useState(city);
  const [job, setJob] = React.useState<{ id: string; searchId: string } | null>(null);
  const [pending, start] = React.useTransition();
  const go = () => start(async () => {
    const { discoverAction } = await import("@/app/actions");
    const r = await discoverAction({ input: `${what} in ${where}`, filters: { city: where, limit: 100, radiusKm: 10 } });
    if ("error" in r && r.error) { toast.error(r.error); return; }
    if ("jobId" in r) setJob({ id: r.jobId!, searchId: r.searchId! });
  });
  return (
    <Card className="glass overflow-hidden">
      <CardBody className="space-y-4 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 p-5">
        <p className="text-sm text-muted-fg">Type what you&apos;re looking for and where, then press Search. You get company name, phone, email, website and address. Emails and websites are filled in automatically in the background.</p>
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); if (what.trim()) go(); }}>
          <Input className="h-12 text-base" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Business type, e.g. dental clinic, CA firm, garment exporter" autoFocus aria-label="Business type" />
          <Input className="h-12 text-base" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Location, e.g. Anna Nagar, Chennai" aria-label="Location" />
          <Button size="lg" className="h-12" disabled={pending || !what.trim() || Boolean(job)}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />} Search</Button>
        </form>
        {job && <JobProgress jobId={job.id} label="Search" onDoneHref={`/scraper/results/${job.searchId}`} />}
      </CardBody>
    </Card>
  );
}

export function AutoRefresh({ active }: { active: boolean }) {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { fetch("/api/jobs/tick", { method: "POST" }).finally(() => { force((x) => x + 1); location.reload(); }); }, 6000);
    return () => clearInterval(t);
  }, [active]);
  return active ? <span className="flex items-center gap-2 text-xs text-muted-fg"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding emails &amp; websites… this page updates by itself</span> : <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Complete</span>;
}
