"use client";
import * as React from "react";
import { toast } from "sonner";
import { Upload, Sparkles, Wand2, Link2, List, MapPin, FileSpreadsheet, Search } from "lucide-react";
import { Button, Card, Field, Input, Select, Textarea, Badge } from "@/components/ui";
import { JobProgress } from "@/components/client";
import { discoverAction } from "@/app/actions";

const EXAMPLES = ["dental clinics in Anna Nagar", "small garment exporters in Tirupur", "CA firms in T Nagar", "coaching centres in Velachery", "logistics companies in Ambattur"];

function detect(v: string) {
  const lines = v.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  if (lines.length > 1 && lines[0].includes(",") && lines.slice(1).every((l) => l.split(",").length === lines[0].split(",").length)) return { t: "CSV rows", icon: FileSpreadsheet };
  if (lines.every((l) => /google\.[a-z.]+\/maps|maps\.app\.goo\.gl/i.test(l))) return { t: "Google Maps links", icon: MapPin };
  if (lines.every((l) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(l))) return { t: `${lines.length} website${lines.length > 1 ? "s" : ""}`, icon: Link2 };
  if (lines.length > 1) return { t: `${lines.length} company names`, icon: List };
  return { t: "Natural-language search", icon: Search };
}

export function DiscoverForm({ defaultCity, initial = "" }: { defaultCity: string; initial?: string }) {
  const [input, setInput] = React.useState(initial);
  const [csvMode, setCsvMode] = React.useState(false);
  const [f, setF] = React.useState({ city: "", category: "", radiusKm: "5", limit: "30", hasWebsite: "any", minRating: "" });
  const [job, setJob] = React.useState<{ id: string; searchId: string } | null>(null);
  const [pending, start] = React.useTransition();
  const kind = csvMode ? { t: "CSV / Excel import", icon: FileSpreadsheet } : detect(input);

  const submit = () => start(async () => {
    const r = await discoverAction({
      input, inputType: csvMode ? "csv" : "auto",
      filters: { city: f.city || undefined, category: f.category || undefined, radiusKm: Number(f.radiusKm), limit: Number(f.limit), hasWebsite: f.hasWebsite as "any", minRating: f.minRating ? Number(f.minRating) : undefined },
    });
    if ("error" in r && r.error) { toast.error(r.error); return; }
    if ("jobId" in r) setJob({ id: r.jobId!, searchId: r.searchId! });
  });

  const onFile = async (file: File) => {
    if (/\.xlsx$/i.test(file.name)) {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch("/api/import/xlsx", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) return toast.error(j.error);
      setInput(j.csv); setCsvMode(true); toast.success(`Loaded ${j.rows} rows`);
    } else {
      setInput(await file.text()); setCsvMode(true); toast.success(`Loaded ${file.name}`);
    }
  };

  return (
    <Card className="glass overflow-hidden">
      <div className="bg-gradient-to-br from-primary/10 via-transparent to-accent/10 p-4 sm:p-6">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Wand2 className="h-4 w-4 text-primary" /> Whatever you give, LeadForge finds leads</div>
        <Textarea value={input} onChange={(e) => { setInput(e.target.value); if (!e.target.value) setCsvMode(false); }} rows={4} autoFocus
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && input.trim()) submit(); }}
          placeholder={"Try: dental clinics in Anna Nagar\nor paste company names (one per line), website URLs, Google Maps links, or CSV rows"}
          className="min-h-[110px] resize-y bg-card/80 text-base" aria-label="Lead search input" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {kind && <Badge tone="primary"><kind.icon className="h-3 w-3" /> {kind.t}</Badge>}
          {!input && EXAMPLES.map((e) => <button key={e} onClick={() => setInput(e)} className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-fg hover:text-fg">{e}</button>)}
          <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted">
            <Upload className="h-3.5 w-3.5" /> CSV / Excel
            <input type="file" accept=".csv,.xlsx,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-border p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="City"><Input placeholder={defaultCity} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        <Field label="Category"><Input placeholder="auto-detect" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
        <Field label="Radius (km)"><Input type="number" min={1} max={50} value={f.radiusKm} onChange={(e) => setF({ ...f, radiusKm: e.target.value })} /></Field>
        <Field label="Max results"><Input type="number" min={1} max={100} value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} /></Field>
        <Field label="Website"><Select value={f.hasWebsite} onChange={(e) => setF({ ...f, hasWebsite: e.target.value })}><option value="any">Any</option><option value="yes">Has website</option><option value="no">No website</option></Select></Field>
        <Field label="Min rating"><Input type="number" step="0.1" min={0} max={5} placeholder="any" value={f.minRating} onChange={(e) => setF({ ...f, minRating: e.target.value })} /></Field>
      </div>
      <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center">
        <div className="flex-1">{job ? <JobProgress jobId={job.id} label="Discovery" onDoneHref={`/leads?search=${job.searchId}`} /> : <p className="text-xs text-muted-fg">Leads are deduped, then enriched in the background (website, contacts, people, pain points). <span className="kbd">⌘</span> <span className="kbd">Enter</span> to run.</p>}</div>
        <Button size="lg" onClick={submit} disabled={pending || !input.trim() || Boolean(job)}><Sparkles className="h-4 w-4" /> Find leads</Button>
      </div>
    </Card>
  );
}
