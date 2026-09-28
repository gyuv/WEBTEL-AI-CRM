import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { Download, Phone } from "lucide-react";
import { ctx } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { Card, PageHeader, Badge, buttonClass, EmptyState } from "@/components/ui";
import { AutoRefresh } from "../../scraper-client";

export const metadata = { title: "Search results" };

const SORTS = [
  { id: "phone", label: "Phone first" },
  { id: "new", label: "New entries" },
  { id: "popular", label: "Popular / most visited" },
  { id: "rated", label: "Top rated" },
  { id: "email", label: "Has email" },
  { id: "name", label: "A–Z" },
] as const;

export default async function Results({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sort?: string; only?: string }> }) {
  const { id } = await params;
  const { sort = "phone", only } = await searchParams;
  const { db, userId } = await ctx();
  const [search] = await db.select().from(schema.searches).where(and(eq(schema.searches.id, id), eq(schema.searches.userId, userId)));
  if (!search) notFound();
  const leads = await db.select().from(schema.leads).where(and(eq(schema.leads.userId, userId), eq(schema.leads.searchId, id)));
  const ids = leads.map((l) => l.id);
  const [phones, emails] = ids.length ? await Promise.all([
    db.select().from(schema.leadPhones).where(inArray(schema.leadPhones.leadId, ids)),
    db.select().from(schema.leadEmails).where(inArray(schema.leadEmails.leadId, ids)),
  ]) : [[], []];
  const running = leads.some((l) => l.enrichStatus !== "done");
  const rows = leads.map((l) => ({
    l,
    phones: phones.filter((p) => p.leadId === l.id),
    email: emails.filter((e) => e.leadId === l.id).sort((a, b) => (a.kind === "found" ? -1 : 1) - (b.kind === "found" ? -1 : 1) || b.confidence - a.confidence)[0],
  })).filter((r) => only === "phone" ? r.phones.length > 0 : only === "email" ? r.email?.kind === "found" : only === "website" ? Boolean(r.l.website) : true)
    .sort((a, b) => {
      switch (sort) {
        // "New": newest businesses (year established), then most recently added to LeadForge.
        case "new": return (b.l.yearEst ?? 0) - (a.l.yearEst ?? 0) || b.l.createdAt.getTime() - a.l.createdAt.getTime();
        // "Popular / most visited": review count is the public proxy for footfall (visit counts are not published).
        case "popular": return (b.l.reviewsCount ?? -1) - (a.l.reviewsCount ?? -1);
        case "rated": return (b.l.rating ?? 0) - (a.l.rating ?? 0) || (b.l.reviewsCount ?? 0) - (a.l.reviewsCount ?? 0);
        case "email": return Number(b.email?.kind === "found") - Number(a.email?.kind === "found") || b.phones.length - a.phones.length;
        case "name": return a.l.name.localeCompare(b.l.name);
        default: return b.phones.length - a.phones.length || (b.l.reviewsCount ?? 0) - (a.l.reviewsCount ?? 0);
      }
    });
  const newest = [...leads].map((l) => l.yearEst ?? 0).sort((a, b) => b - a)[Math.floor(leads.length * 0.2)] ?? 0;
  const popular = [...leads].map((l) => l.reviewsCount ?? 0).sort((a, b) => b - a)[Math.floor(leads.length * 0.2)] ?? Infinity;
  const link = (k: string, v?: string) => { const q = new URLSearchParams({ sort, ...(only ? { only } : {}) }); if (v) q.set(k, v); else q.delete(k); return `?${q}`; };
  return (
    <>
      <PageHeader title={search.rawInput.split("\n")[0]} description={<span className="flex items-center gap-3">{leads.length} companies · {rows.filter((r) => r.phones.length).length} with phone · {rows.filter((r) => r.email?.kind === "found").length} with email <AutoRefresh active={running} /></span>}
        actions={<><a className={buttonClass("outline")} href={`/api/export?format=xlsx&ids=${ids.join(",")}`}><Download className="h-4 w-4" /> Excel</a><a className={buttonClass("outline")} href={`/api/export?format=csv&ids=${ids.join(",")}`}><Download className="h-4 w-4" /> CSV</a><a className={buttonClass()} href="/calls"><Phone className="h-4 w-4" /> Start calling</a></>} />
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 text-muted-fg">Sort:</span>
        {SORTS.map((x) => <a key={x.id} href={link("sort", x.id)} className={`rounded-full border px-2.5 py-1 ${sort === x.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-fg hover:text-fg"}`}>{x.label}</a>)}
        <span className="ml-3 mr-1 text-muted-fg">Show:</span>
        {[["", "All"], ["phone", "With phone"], ["email", "With email"], ["website", "With website"]].map(([v, l]) => <a key={v} href={link("only", v)} className={`rounded-full border px-2.5 py-1 ${(only ?? "") === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-fg hover:text-fg"}`}>{l}</a>)}
      </div>
      {rows.length ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-fg"><tr><th className="p-3">#</th><th className="p-3">Company</th><th className="p-3">Phone</th><th className="p-3">Email</th><th className="p-3">Website</th><th className="p-3">Address / location</th></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ l, phones: ph, email }, i) => (
                <tr key={l.id} className="align-top hover:bg-muted/40">
                  <td className="p-3 text-muted-fg">{i + 1}</td>
                  <td className="p-3"><a href={`/leads/${l.id}`} className="font-medium hover:text-primary hover:underline">{l.name}</a><p className="text-xs text-muted-fg">{l.category}{l.rating ? ` · ★ ${l.rating}` : ""}{l.reviewsCount ? ` (${l.reviewsCount} reviews)` : ""}{l.yearEst ? ` · since ${l.yearEst}` : ""}</p>
                    <div className="mt-1 flex gap-1">{(l.yearEst ?? 0) >= new Date().getFullYear() - 2 || (newest && (l.yearEst ?? 0) >= newest && l.yearEst) ? <Badge tone="info">New</Badge> : null}{(l.reviewsCount ?? 0) > 0 && (l.reviewsCount ?? 0) >= popular ? <Badge tone="success">Popular</Badge> : null}{(l.rating ?? 0) >= 4.5 && (l.reviewsCount ?? 0) >= 20 ? <Badge tone="accent">Top rated</Badge> : null}</div></td>
                  <td className="p-3">{ph.length ? ph.map((p) => <a key={p.id} href={`tel:${p.e164}`} className="block font-mono text-xs hover:text-primary">{p.e164}</a>) : <span className="text-xs text-muted-fg">{l.enrichStatus === "done" ? "not found" : "searching…"}</span>}</td>
                  <td className="p-3">{email ? <span className="font-mono text-xs">{email.email} {email.kind === "guessed" && <Badge tone="warning">guess</Badge>}</span> : <span className="text-xs text-muted-fg">{l.enrichStatus === "done" ? "not found" : "searching…"}</span>}</td>
                  <td className="p-3">{l.website ? <a href={l.website} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{l.domain ?? l.website}</a> : <span className="text-xs text-muted-fg">—</span>}</td>
                  <td className="p-3 text-xs">{l.address ?? [l.area, l.city].filter(Boolean).join(", ")}{l.pincode && !l.address?.includes(l.pincode) ? ` ${l.pincode}` : ""}{l.mapsUrl && <a href={l.mapsUrl} target="_blank" rel="noreferrer" className="ml-1 text-primary">map</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : <EmptyState title="No companies found" description="Try a nearby area, a broader type (e.g. 'clinic' instead of 'pediatric dental clinic'), or a bigger radius." action={<a className={buttonClass()} href="/scraper">New search</a>} />}
    </>
  );
}
