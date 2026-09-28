import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { childScope } from "@/server/services/access";
import { fmtDate, inr, label } from "@/lib/format";
import { opportunityStageValues } from "@/lib/validators";
import { ActionForm } from "@/components/action-form";
import { setOpportunityStageAction } from "@/app/actions/crm";
import { Badge, Card, CardHeader, CardTitle, PageHeader, Select } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const actor = await requirePageActor();
  const opps = await prisma.opportunity.findMany({
    where: childScope(actor),
    include: { lead: { select: { id: true, name: true, leadSource: { select: { name: true } } } }, customer: { select: { id: true, customerName: true } }, products: { select: { productName: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const open = opps.filter((o) => !o.stage.startsWith("CLOSED"));
  const weighted = open.reduce((s, o) => s + (Number(o.estimatedAmount) * o.probability) / 100, 0);
  return (
    <div>
      <PageHeader title="Opportunity Pipeline" description={`${open.length} open · weighted pipeline ${inr(weighted)} · create opportunities from a lead or customer page`} />
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        {opportunityStageValues.map((stage) => {
          const list = opps.filter((o) => o.stage === stage);
          return (
            <Card key={stage} className="bg-muted/30">
              <CardHeader><CardTitle>{label(stage)}</CardTitle><span className="text-xs text-muted-foreground">{inr(list.reduce((s, o) => s + Number(o.estimatedAmount), 0))}</span></CardHeader>
              <div className="space-y-2 p-2">
                {list.map((o) => (
                  <div key={o.id} className="rounded border bg-white p-2 text-xs">
                    <div className="font-semibold">{o.opportunityName}</div>
                    <div>{o.lead ? <Link className="text-primary" href={`/leads/${o.lead.id}`}>{o.lead.name}</Link> : o.customer && <Link className="text-primary" href={`/customers/${o.customer.id}`}>{o.customer.customerName}</Link>}</div>
                    {o.lead && <div className="text-muted-foreground">Source: {o.lead.leadSource.name}</div>}
                    <div>{inr(o.estimatedAmount.toString())} · {o.probability}%</div>
                    <div className="text-muted-foreground">Close {fmtDate(o.expectedCloseDate)}</div>
                    {o.products.length > 0 && <div className="text-muted-foreground">{o.products.map((p) => p.productName).join(", ")}</div>}
                    {o.nextAction && <div>Next: {o.nextAction}</div>}
                    <ActionForm action={setOpportunityStageAction.bind(null, o.id)} submitLabel="Move" resetOnSuccess={false}>
                      <Select name="stage" defaultValue={o.stage} className="mt-1 h-7 text-xs">{opportunityStageValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
                    </ActionForm>
                  </div>
                ))}
                {!list.length && <Badge tone="x">empty</Badge>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
