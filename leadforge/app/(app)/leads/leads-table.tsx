"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, flexRender, type ColumnDef, type SortingState, type VisibilityState, type RowSelectionState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Star, Globe, Phone, Mail, Users, ArrowUpDown, Columns3, Download, Sparkles, X, ExternalLink, Search, Trash2, ListPlus, Radar, Building2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, ScoreRing, Select, buttonClass } from "@/components/ui";
import { bulkAction } from "@/app/actions";
import { statusLabel, timeAgo, cn } from "@/lib/utils";
import { LEAD_STATUSES } from "@/lib/db/schema";

export interface LeadRow {
  id: string; name: string; category: string | null; area: string | null; city: string | null; website: string | null; rating: number | null; reviewsCount: number | null;
  status: string; score: number; starred: boolean; enrichStatus: string; primarySource: string | null; doNotCall: boolean; createdAt: string; nextFollowUpAt: string | null;
  phones: number; emails: number; people: number; dms: number; topPain: string | null; topProduct: string | null;
}

export const STATUS_TONE: Record<string, "default" | "primary" | "success" | "warning" | "danger" | "info" | "accent"> = {
  new: "default", researched: "info", contacted: "primary", replied: "accent", interested: "success", meeting_booked: "success", proposal: "warning", won: "success", lost: "danger", unsubscribed: "danger",
};

export function LeadsTable({ data, lists, initialStatus }: { data: LeadRow[]; lists: { id: string; name: string }[]; initialStatus?: string }) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "score", desc: true }]);
  const [global, setGlobal] = React.useState("");
  const [status, setStatus] = React.useState(initialStatus ?? "");
  const [category, setCategory] = React.useState("");
  const [visibility, setVisibility] = React.useState<VisibilityState>({ source: false, created: false, product: false });
  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [drawer, setDrawer] = React.useState<LeadRow | null>(null);
  const [showCols, setShowCols] = React.useState(false);
  const [pending, start] = React.useTransition();
  React.useEffect(() => { try { const v = localStorage.getItem("lf:cols"); if (v) setVisibility(JSON.parse(v)); } catch { /* ignore */ } }, []);
  React.useEffect(() => { try { localStorage.setItem("lf:cols", JSON.stringify(visibility)); } catch { /* ignore */ } }, [visibility]);

  const categories = React.useMemo(() => [...new Set(data.map((d) => d.category).filter(Boolean))] as string[], [data]);
  const filtered = React.useMemo(() => data.filter((d) => (!status || d.status === status) && (!category || d.category === category)), [data, status, category]);

  const columns = React.useMemo<ColumnDef<LeadRow>[]>(() => [
    { id: "select", size: 36, enableSorting: false, header: ({ table }) => <input type="checkbox" aria-label="Select all" checked={table.getIsAllRowsSelected()} onChange={table.getToggleAllRowsSelectedHandler()} />, cell: ({ row }) => <input type="checkbox" aria-label="Select row" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} onClick={(e) => e.stopPropagation()} /> },
    { id: "score", accessorKey: "score", header: "Score", size: 64, cell: ({ getValue }) => <ScoreRing value={getValue<number>()} size={32} /> },
    { id: "name", accessorKey: "name", header: "Company", size: 280, cell: ({ row: { original: r } }) => (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5"><a href={`/leads/${r.id}`} onClick={(e) => e.stopPropagation()} className="truncate font-medium hover:text-primary hover:underline">{r.name}</a>{r.starred && <Star className="h-3 w-3 shrink-0 fill-warning text-warning" />}{r.doNotCall && <Badge tone="danger">DNC</Badge>}</div>
        <p className="truncate text-xs text-muted-fg">{[r.category, r.area ?? r.city].filter(Boolean).join(" · ")}</p>
      </div>) },
    { id: "status", accessorKey: "status", header: "Status", size: 120, cell: ({ getValue }) => <Badge tone={STATUS_TONE[getValue<string>()]}>{statusLabel(getValue<string>())}</Badge> },
    { id: "contacts", header: "Reach", size: 150, accessorFn: (r) => r.phones * 2 + r.emails + r.dms * 3, cell: ({ row: { original: r } }) => (
      <div className="flex items-center gap-2 text-xs text-muted-fg">
        <span className={cn("flex items-center gap-0.5", r.phones && "text-fg")} title="Phones"><Phone className="h-3 w-3" />{r.phones}</span>
        <span className={cn("flex items-center gap-0.5", r.emails && "text-fg")} title="Emails found"><Mail className="h-3 w-3" />{r.emails}</span>
        <span className={cn("flex items-center gap-0.5", r.people && "text-fg")} title="People (decision-makers)"><Users className="h-3 w-3" />{r.people}{r.dms ? <span className="text-success">({r.dms})</span> : null}</span>
        {r.website && <Globe className="h-3 w-3 text-fg" />}
      </div>) },
    { id: "pain", accessorKey: "topPain", header: "Top pain", size: 200, cell: ({ getValue }) => <span className="truncate text-xs">{getValue<string>() ?? <span className="text-muted-fg">—</span>}</span> },
    { id: "product", accessorKey: "topProduct", header: "Pitch", size: 170, cell: ({ getValue }) => getValue<string>() ? <Badge tone="accent">{getValue<string>()}</Badge> : <span className="text-muted-fg">—</span> },
    { id: "rating", accessorKey: "rating", header: "Rating", size: 80, cell: ({ row: { original: r } }) => r.rating ? <span className="text-xs tabular-nums">★ {r.rating} <span className="text-muted-fg">({r.reviewsCount ?? 0})</span></span> : <span className="text-muted-fg">—</span> },
    { id: "enrich", accessorKey: "enrichStatus", header: "Enrichment", size: 110, cell: ({ getValue }) => <Badge tone={getValue<string>() === "done" ? "success" : getValue<string>() === "running" ? "info" : "default"}>{getValue<string>()}</Badge> },
    { id: "source", accessorKey: "primarySource", header: "Source", size: 90, cell: ({ getValue }) => <Badge>{getValue<string>() ?? "—"}</Badge> },
    { id: "created", accessorKey: "createdAt", header: "Added", size: 90, cell: ({ getValue }) => <span className="text-xs text-muted-fg">{timeAgo(getValue<string>())}</span> },
  ], []);

  const table = useReactTable({
    data: filtered, columns, state: { sorting, globalFilter: global, columnVisibility: visibility, rowSelection: selection },
    getRowId: (r) => r.id, onSortingChange: setSorting, onGlobalFilterChange: setGlobal, onColumnVisibilityChange: setVisibility, onRowSelectionChange: setSelection,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(), enableRowSelection: true,
    globalFilterFn: (row, _c, v: string) => `${row.original.name} ${row.original.category} ${row.original.area} ${row.original.city} ${row.original.topPain}`.toLowerCase().includes(v.toLowerCase()),
  });
  const rows = table.getRowModel().rows;
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 56, overscan: 12 });
  const selected = Object.keys(selection).filter((k) => selection[k]);

  const bulk = (action: Parameters<typeof bulkAction>[1], value?: string) => start(async () => {
    const r = await bulkAction(selected, action, value);
    if ("error" in r && r.error) toast.error(r.error); else { toast.success("Done"); setSelection({}); router.refresh(); }
  });

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(null); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!data.length) return <EmptyState icon={<Building2 />} title="No leads yet" description="Type what you're looking for — e.g. 'dental clinics in Anna Nagar' — or paste names, URLs or a CSV." action={<a href="/discover" className={buttonClass()}><Radar className="h-4 w-4" /> Discover leads</a>} />;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-fg" /><Input className="pl-8" placeholder="Filter by name, area, pain…" value={global} onChange={(e) => setGlobal(e.target.value)} /></div>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter"><option value="">All statuses</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</Select>
        <Select className="w-auto max-w-[200px]" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category filter"><option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</Select>
        <div className="relative">
          <Button variant="outline" onClick={() => setShowCols((s) => !s)}><Columns3 className="h-4 w-4" /> Columns</Button>
          {showCols && <Card className="absolute right-0 z-20 mt-1 w-48 p-2">{table.getAllLeafColumns().filter((c) => c.id !== "select").map((c) => (
            <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"><input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />{typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}</label>
          ))}</Card>}
        </div>
        <a className={buttonClass("outline")} href={`/api/export?format=csv${selected.length ? `&ids=${selected.join(",")}` : ""}`}><Download className="h-4 w-4" /> CSV</a>
        <a className={buttonClass("outline")} href={`/api/export?format=xlsx${selected.length ? `&ids=${selected.join(",")}` : ""}`}><Download className="h-4 w-4" /> XLSX</a>
      </div>

      {selected.length > 0 && (
        <div className="glass sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg p-2 text-sm animate-fade-in">
          <span className="px-2 font-medium">{selected.length} selected</span>
          <Select className="h-8 w-auto text-xs" defaultValue="" onChange={(e) => e.target.value && bulk("status", e.target.value)}><option value="">Set status…</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</Select>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => bulk("star", "true")}><Star className="h-3.5 w-3.5" /> Star</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => { const n = window.prompt("Add to list (new or existing name):", lists[0]?.name ?? "Hot leads"); if (n) bulk("list", n); }}><ListPlus className="h-3.5 w-3.5" /> List</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => bulk("enrich")}><Sparkles className="h-3.5 w-3.5" /> Re-enrich</Button>
          <a className={buttonClass("outline", "sm")} href={`/api/export?kind=mailmerge&format=csv&ids=${selected.join(",")}`}><Mail className="h-3.5 w-3.5" /> Mail-merge CSV</a>
          <Button size="sm" variant="danger" disabled={pending} onClick={() => confirm(`Delete ${selected.length} leads?`) && bulk("delete")}><Trash2 className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={() => setSelection({})}><X className="h-3.5 w-3.5" /></Button>
        </div>
      )}
      {lists.length > 0 && <div className="mb-3 flex flex-wrap gap-1.5 text-xs">{lists.map((l) => <a key={l.id} href={`/leads?list=${l.id}`} className="rounded-full border border-border px-2.5 py-1 hover:bg-muted">{l.name}</a>)}</div>}

      <Card className="overflow-hidden">
        <div ref={parentRef} className="max-h-[calc(100dvh-260px)] min-h-[300px] overflow-auto">
          <div style={{ minWidth: table.getVisibleLeafColumns().reduce((s, c) => s + c.getSize(), 0) }}>
            <div className="sticky top-0 z-10 flex border-b border-border bg-card/95 text-xs font-medium text-muted-fg backdrop-blur">
              {table.getHeaderGroups()[0].headers.map((h) => (
                <div key={h.id} style={{ width: h.getSize(), flex: h.id === "name" ? "1 0 auto" : undefined }} className="flex items-center px-3 py-2">
                  {h.column.getCanSort() ? <button className="flex items-center gap-1 hover:text-fg" onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header, h.getContext())}<ArrowUpDown className="h-3 w-3" /></button> : flexRender(h.column.columnDef.header, h.getContext())}
                </div>
              ))}
            </div>
            <div style={{ height: virt.getTotalSize(), position: "relative" }}>
              {virt.getVirtualItems().map((vi) => {
                const row = rows[vi.index];
                return (
                  <div key={row.id} onClick={() => setDrawer(row.original)}
                    className={cn("absolute left-0 right-0 flex cursor-pointer items-center border-b border-border text-sm hover:bg-muted/50", row.getIsSelected() && "bg-primary/5", drawer?.id === row.id && "bg-muted")}
                    style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}>
                    {row.getVisibleCells().map((c) => <div key={c.id} style={{ width: c.column.getSize(), flex: c.column.id === "name" ? "1 0 auto" : undefined }} className="min-w-0 px-3">{flexRender(c.column.columnDef.cell, c.getContext())}</div>)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="border-t border-border px-3 py-2 text-xs text-muted-fg">{rows.length} shown · click a row for quick view · click the name to open</div>
      </Card>

      {drawer && (
        <div className="fixed inset-0 z-40" onClick={() => setDrawer(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <aside className="glass absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto p-5 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start gap-3">
              <ScoreRing value={drawer.score} size={44} />
              <div className="min-w-0 flex-1"><h2 className="text-lg font-semibold leading-tight">{drawer.name}</h2><p className="text-sm text-muted-fg">{[drawer.category, drawer.area, drawer.city].filter(Boolean).join(" · ")}</p></div>
              <Button variant="ghost" size="icon" onClick={() => setDrawer(null)} aria-label="Close"><X className="h-4 w-4" /></Button>
            </div>
            <div className="mb-4 flex flex-wrap gap-1.5"><Badge tone={STATUS_TONE[drawer.status]}>{statusLabel(drawer.status)}</Badge><Badge>{drawer.primarySource}</Badge><Badge tone={drawer.enrichStatus === "done" ? "success" : "info"}>enrichment: {drawer.enrichStatus}</Badge></div>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-fg">Phones</dt><dd className="font-semibold">{drawer.phones}</dd></div>
              <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-fg">Emails</dt><dd className="font-semibold">{drawer.emails}</dd></div>
              <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-fg">People</dt><dd className="font-semibold">{drawer.people} <span className="text-xs text-success">{drawer.dms ? `(${drawer.dms} DM)` : ""}</span></dd></div>
            </dl>
            {drawer.topPain && <div className="mt-4"><p className="text-xs text-muted-fg">Top pain point</p><p className="text-sm">{drawer.topPain}</p></div>}
            {drawer.topProduct && <div className="mt-3"><p className="text-xs text-muted-fg">Recommended pitch</p><Badge tone="accent">{drawer.topProduct}</Badge></div>}
            <div className="mt-6 grid gap-2">
              <a href={`/leads/${drawer.id}`} className={buttonClass("primary")}>Open full profile <ExternalLink className="h-4 w-4" /></a>
              <a href={`/calls?lead=${drawer.id}`} className={buttonClass("outline")}><Phone className="h-4 w-4" /> Call now</a>
              {drawer.website && <a href={drawer.website} target="_blank" rel="noreferrer" className={buttonClass("outline")}><Globe className="h-4 w-4" /> Website</a>}
              <a href={`/discover?q=${encodeURIComponent(`${drawer.category ?? ""} in ${drawer.area ?? drawer.city ?? ""}`)}`} className={buttonClass("ghost")}><Radar className="h-4 w-4" /> Find more like this</a>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
