import { and, desc, eq, sql } from "drizzle-orm";
import { ctx } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { PageHeader, buttonClass } from "@/components/ui";
import { LeadsTable, type LeadRow } from "./leads-table";
import { Radar } from "lucide-react";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ search?: string; list?: string; status?: string }> }) {
  const sp = await searchParams;
  const { db, userId } = await ctx();
  const conds = [eq(schema.leads.userId, userId)];
  if (sp.search) conds.push(eq(schema.leads.searchId, sp.search));
  if (sp.list) conds.push(sql`${schema.leads.id} in (select lead_id from list_leads where list_id = ${sp.list})`);
  const rows = await db.select({
    id: schema.leads.id, name: schema.leads.name, category: schema.leads.category, area: schema.leads.area, city: schema.leads.city,
    website: schema.leads.website, rating: schema.leads.rating, reviewsCount: schema.leads.reviewsCount, status: schema.leads.status, score: schema.leads.score,
    starred: schema.leads.starred, enrichStatus: schema.leads.enrichStatus, primarySource: schema.leads.primarySource, doNotCall: schema.leads.doNotCall,
    createdAt: schema.leads.createdAt, nextFollowUpAt: schema.leads.nextFollowUpAt,
    phones: sql<number>`(select count(*)::int from lead_phones p where p.lead_id = ${schema.leads.id})`,
    emails: sql<number>`(select count(*)::int from lead_emails e where e.lead_id = ${schema.leads.id} and e.kind = 'found')`,
    people: sql<number>`(select count(*)::int from lead_people p where p.lead_id = ${schema.leads.id})`,
    dms: sql<number>`(select count(*)::int from lead_people p where p.lead_id = ${schema.leads.id} and p.dm_score >= 70)`,
    topPain: sql<string | null>`(select i.payload->'pains'->0->>'title' from lead_insights i where i.lead_id = ${schema.leads.id} and i.kind = 'analysis')`,
    topProduct: sql<string | null>`(select i.payload->'matches'->0->>'productName' from lead_insights i where i.lead_id = ${schema.leads.id} and i.kind = 'analysis')`,
  }).from(schema.leads).where(and(...conds)).orderBy(desc(schema.leads.score)).limit(5000);
  const lists = await db.select().from(schema.lists).where(eq(schema.lists.userId, userId));
  const data: LeadRow[] = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), nextFollowUpAt: r.nextFollowUpAt?.toISOString() ?? null }));
  return (
    <>
      <PageHeader title="Leads" description={`${rows.length} lead${rows.length === 1 ? "" : "s"}${sp.search ? " from this search" : ""}${sp.list ? " in list" : ""}`}
        actions={<a href="/discover" className={buttonClass()}><Radar className="h-4 w-4" /> Find more</a>} />
      <LeadsTable data={data} lists={lists.map((l) => ({ id: l.id, name: l.name }))} initialStatus={sp.status} />
    </>
  );
}
