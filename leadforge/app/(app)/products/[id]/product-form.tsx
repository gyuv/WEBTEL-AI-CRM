"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Wand2, Trash2, Plus, X, Upload, FileText } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { saveProductAction, deleteProductAction, autofillProductAction } from "@/app/actions";

type Obj = { objection: string; rebuttal: string };
interface P {
  id?: string; name: string; category: string | null; shortDesc: string | null; longDesc: string | null; targetIndustries: string[]; icp: string | null; problemsSolved: string[];
  benefits: string[]; pricing: string | null; usps: string[]; competitors: string[]; caseStudies: string | null; objections: Obj[]; brochureUrl: string | null; imageUrl: string | null; active: boolean;
}
const empty: P = { name: "", category: "", shortDesc: "", longDesc: "", targetIndustries: [], icp: "", problemsSolved: [], benefits: [], pricing: "", usps: [], competitors: [], caseStudies: "", objections: [], brochureUrl: "", imageUrl: "", active: true };

function Tags({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [t, setT] = React.useState("");
  const add = () => { const parts = t.split(",").map((x) => x.trim()).filter(Boolean); if (parts.length) onChange([...new Set([...value, ...parts])]); setT(""); };
  return (
    <div className="rounded-md border border-border bg-card p-1.5">
      <div className="flex flex-wrap gap-1">
        {value.map((v) => <span key={v} className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{v}<button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`}><X className="h-3 w-3" /></button></span>)}
        <input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} onBlur={add} placeholder={placeholder} className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none" />
      </div>
    </div>
  );
}

export function ProductForm({ product }: { product: (P & Record<string, unknown>) | null }) {
  const router = useRouter();
  const [p, setP] = React.useState<P>(product ?? empty);
  const [src, setSrc] = React.useState("");
  const [pending, start] = React.useTransition();
  const [filling, setFilling] = React.useState(false);
  const set = <K extends keyof P>(k: K, v: P[K]) => setP((x) => ({ ...x, [k]: v }));

  const autofill = async (text: string) => {
    setFilling(true);
    try {
      const r = await autofillProductAction(text);
      if ("error" in r && r.error) { toast.error(r.error); return; }
      if ("data" in r && r.data) {
        const d = r.data;
        setP((x) => ({ ...x, ...Object.fromEntries(Object.entries(d).filter(([, v]) => (Array.isArray(v) ? v.length : v))) } as P));
        toast.success(`Auto-filled (${r.model}). Review before saving.`);
      }
    } finally { setFilling(false); }
  };
  const upload = async (f: File) => {
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error);
    if (f.type === "application/pdf") { if (j.url) set("brochureUrl", j.url); if (j.text) await autofill(j.text); }
    else if (j.url) set("imageUrl", j.url);
    if (!j.stored) toast.message("File parsed but not stored (configure Supabase Storage to keep files on Vercel).");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Card><CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *"><Input value={p.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Category"><Input value={p.category ?? ""} onChange={(e) => set("category", e.target.value)} placeholder="e.g. CRM software" /></Field>
          <Field label="Short description" className="sm:col-span-2"><Input value={p.shortDesc ?? ""} onChange={(e) => set("shortDesc", e.target.value)} /></Field>
          <Field label="Long description" className="sm:col-span-2"><Textarea rows={4} value={p.longDesc ?? ""} onChange={(e) => set("longDesc", e.target.value)} /></Field>
          <Field label="Target industries" hint="Use 'all' to match any industry" className="sm:col-span-2"><Tags value={p.targetIndustries} onChange={(v) => set("targetIndustries", v)} placeholder="Dental clinic, Manufacturing…" /></Field>
          <Field label="Problems it solves (tags)" hint="Matched against lead pain points: e.g. crm, website, booking, seo, reviews, whatsapp" className="sm:col-span-2"><Tags value={p.problemsSolved} onChange={(v) => set("problemsSolved", v)} placeholder="crm, slow website…" /></Field>
          <Field label="Ideal customer profile" className="sm:col-span-2"><Textarea rows={2} value={p.icp ?? ""} onChange={(e) => set("icp", e.target.value)} /></Field>
          <Field label="Key benefits" className="sm:col-span-2"><Tags value={p.benefits} onChange={(v) => set("benefits", v)} placeholder="save 5 hours/week…" /></Field>
          <Field label="USPs"><Tags value={p.usps} onChange={(v) => set("usps", v)} placeholder="Tamil UI…" /></Field>
          <Field label="Competitors"><Tags value={p.competitors} onChange={(v) => set("competitors", v)} placeholder="Zoho…" /></Field>
          <Field label="Pricing / plans"><Input value={p.pricing ?? ""} onChange={(e) => set("pricing", e.target.value)} /></Field>
          <Field label="Status"><label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={p.active} onChange={(e) => set("active", e.target.checked)} /> Active (used in pitches)</label></Field>
          <Field label="Case studies / testimonials" className="sm:col-span-2"><Textarea rows={3} value={p.caseStudies ?? ""} onChange={(e) => set("caseStudies", e.target.value)} /></Field>
        </CardBody></Card>
        <Card>
          <CardHeader title="Objections & rebuttals" action={<Button size="sm" variant="outline" onClick={() => set("objections", [...p.objections, { objection: "", rebuttal: "" }])}><Plus className="h-3.5 w-3.5" /> Add</Button>} />
          <CardBody className="space-y-2">
            {p.objections.map((o, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <Input placeholder="Objection" value={o.objection} onChange={(e) => set("objections", p.objections.map((x, j) => (j === i ? { ...x, objection: e.target.value } : x)))} />
                <Input placeholder="Rebuttal" value={o.rebuttal} onChange={(e) => set("objections", p.objections.map((x, j) => (j === i ? { ...x, rebuttal: e.target.value } : x)))} />
                <Button variant="ghost" size="icon" onClick={() => set("objections", p.objections.filter((_, j) => j !== i))} aria-label="Remove"><X className="h-4 w-4" /></Button>
              </div>
            ))}
            {!p.objections.length && <p className="text-sm text-muted-fg">Add common objections — they power your call scripts and reply drafts.</p>}
          </CardBody>
        </Card>
        <div className="flex gap-2">
          <Button disabled={pending || !p.name} onClick={() => start(async () => {
            const r = await saveProductAction({ ...p, category: p.category ?? "", shortDesc: p.shortDesc ?? "", longDesc: p.longDesc ?? "", icp: p.icp ?? "", pricing: p.pricing ?? "", caseStudies: p.caseStudies ?? "", brochureUrl: p.brochureUrl ?? "", imageUrl: p.imageUrl ?? "", objections: p.objections.filter((o) => o.objection) });
            if ("error" in r && r.error) toast.error(r.error); else { toast.success("Saved"); if ("redirect" in r && r.redirect) router.push(r.redirect); else router.refresh(); }
          })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save product</Button>
          {p.id && <Button variant="ghost" onClick={() => confirm("Delete this product?") && start(async () => { await deleteProductAction(p.id!); router.push("/products"); })}><Trash2 className="h-4 w-4" /> Delete</Button>}
        </div>
      </div>
      <div className="space-y-4">
        <Card className="glass">
          <CardHeader title="AI auto-fill" description="Paste a product page URL or brochure text, or upload a PDF." />
          <CardBody className="space-y-2">
            <Textarea rows={6} value={src} onChange={(e) => setSrc(e.target.value)} placeholder="https://yourcompany.in/product  — or paste brochure text" />
            <Button className="w-full" disabled={filling || !src.trim()} onClick={() => autofill(src)}>{filling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Auto-fill fields</Button>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-fg hover:bg-muted">
              <Upload className="h-4 w-4" /> Upload brochure PDF / image
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            {p.brochureUrl && <a href={p.brochureUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-primary"><FileText className="h-4 w-4" /> Brochure</a>}
            {p.imageUrl && <img src={p.imageUrl} alt="" className="rounded-md border border-border" />}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
