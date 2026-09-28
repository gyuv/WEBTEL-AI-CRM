"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { pasteProfileAction } from "@/app/actions";

export function PeopleImport() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [paste, setPaste] = React.useState("");
  const up = async (f: File) => {
    setBusy(true);
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/import/people", { method: "POST", body: fd });
    const j = await r.json(); setBusy(false);
    if (!r.ok) return toast.error(j.error);
    toast.success(`Imported ${j.saved} people (${j.skipped} skipped)`); router.refresh();
  };
  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border p-4 text-sm text-muted-fg hover:bg-muted">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload CSV
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && up(e.target.files[0])} />
      </label>
      <Textarea rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="…or paste profile text you copied from your browser (name, headline, 'at Company', location, About)" />
      <Button size="sm" disabled={!paste.trim()} onClick={async () => { const r = await pasteProfileAction(paste); if ("error" in r && r.error) toast.error(r.error); else { toast.success(`Added ${"name" in r ? r.name : ""}`); setPaste(""); router.refresh(); } }}>Parse &amp; match to company</Button>
    </div>
  );
}
