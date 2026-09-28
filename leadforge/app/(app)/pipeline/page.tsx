import { and, desc, eq, notInArray } from "drizzle-orm";
import { ctx } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { PageHeader } from "@/components/ui";
import { Kanban } from "./kanban";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const { db, userId } = await ctx();
  const leads = await db.select({ id: schema.leads.id, name: schema.leads.name, status: schema.leads.status, score: schema.leads.score, category: schema.leads.category, dealValue: schema.leads.dealValue, nextFollowUpAt: schema.leads.nextFollowUpAt })
    .from(schema.leads).where(and(eq(schema.leads.userId, userId), notInArray(schema.leads.status, ["new"]))).orderBy(desc(schema.leads.score)).limit(1500);
  return (
    <>
      <PageHeader title="Pipeline" description="Drag cards to change status. Every move is logged in the audit trail. ('New' leads live in Leads.)" />
      <Kanban leads={leads.map((l) => ({ ...l, nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null }))} />
    </>
  );
}
