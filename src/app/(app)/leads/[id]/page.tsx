import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { getLeadDetail } from "@/server/services/leads";
import { fmtDate, fmtDateTime, inr, label } from "@/lib/format";
import { leadStatusValues } from "@/lib/validators";
import { ActionForm } from "@/components/action-form";
import { AiPanel } from "@/components/ai-panel";
import { ActivityForm, FollowupForm, MeetingForm, OpportunityForm, SaleForm } from "@/components/record-forms";
import { Badge, buttonVariants, Card, CardContent, CardHeader, CardTitle, Empty, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { assignLeadAction, convertLeadAction, deleteLeadAction, setFollowupStatusAction, setLeadStatusAction } from "@/app/actions/crm";

export const dynamic = "force-dynamic";

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-muted-foreground">{k}</div>
      <div className="text-sm">{v || "—"}</div>
    </div>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;
  const lead = await getLeadDetail(actor, id);
  if (!lead) notFound();
  const [products, users] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, orderBy: { productName: "asc" }, select: { id: true, productName: true } }),
    actor.role === "ADMIN" ? prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const productsDiscussed = Array.from(new Set([
    ...lead.interestedProducts.map((p) => p.productName),
    ...lead.opportunities.flatMap((o) => o.products.map((p) => p.productName)),
    ...lead.meetings.map((m) => m.productsDiscussed).filter(Boolean) as string[],
  ]));
  const salesTotal = lead.sales.reduce((s, x) => s + Number(x.amount), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={lead.name}
        description={<>{lead.companyName} {lead.isDemo && <Badge tone="PENDING">DEMO DATA</Badge>}</>}
        actions={
          <>
            <Link href={`/leads/${lead.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>Edit</Link>
            <Link href={`/quotations/new?leadId=${lead.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>New Quotation</Link>
            {lead.customer && <Link href={`/customers/${lead.customer.id}`} className={buttonVariants({ size: "sm" })}>View Customer</Link>}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Customer Information</CardTitle><div className="flex gap-1"><Badge>{lead.status}</Badge><Badge>{lead.priority}</Badge></div></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Info k="Phone" v={lead.phone} />
              <Info k="Email" v={lead.email} />
              <Info k="City / State" v={[lead.city, lead.state].filter(Boolean).join(", ")} />
              <Info k="Industry" v={lead.industry} />
              <Info k="Company Size" v={lead.companySize} />
              <Info k="Pipeline Value" v={inr(lead.estimatedValue.toString())} />
              <Info k="Assigned To" v={lead.assignedUser?.name} />
              <Info k="Created" v={fmtDate(lead.createdAt)} />
              <Info k="Products Discussed" v={productsDiscussed.join(", ")} />
              <Info k="Sales to date" v={inr(salesTotal)} />
              <div className="col-span-2"><Info k="Notes" v={<span className="whitespace-pre-wrap">{lead.notes}</span>} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Lead Source</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Info k="Source" v={<Link className="text-primary hover:underline" href={`/leads?leadSourceId=${lead.leadSourceId}`}>{lead.leadSource.name}</Link>} />
              <Info k="Campaign" v={lead.campaignName} />
              <Info k="Referral" v={lead.referralName} />
              <Info k="Source Details" v={lead.leadSourceDetails} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Stage & Assignment</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <ActionForm action={setLeadStatusAction.bind(null, lead.id)} submitLabel="Update Stage" resetOnSuccess={false}>
                <Field label="Current Stage">
                  <Select name="status" defaultValue={lead.status}>{leadStatusValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
                </Field>
              </ActionForm>
              {actor.role === "ADMIN" && (
                <ActionForm action={assignLeadAction.bind(null, lead.id)} submitLabel="Assign" resetOnSuccess={false}>
                  <Field label="Assign to">
                    <Select name="assignedUserId" defaultValue={lead.assignedUserId ?? ""}>
                      <option value="">Unassigned</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  </Field>
                </ActionForm>
              )}
              {!lead.customer ? (
                <ActionForm action={convertLeadAction.bind(null, lead.id)} submitLabel="Convert to Customer" confirm="Convert this lead to a customer and mark it WON?">
                  <Field label="Number of users"><Input name="numberOfUsers" type="number" min={0} /></Field>
                  <Field label="Requirements"><Input name="requirements" /></Field>
                </ActionForm>
              ) : (
                <div className="text-sm text-emerald-700">Converted to customer on {fmtDate(lead.customer.createdAt)}. Original source data is preserved.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Activities ({lead.activities.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <ActivityForm leadId={lead.id} />
              <ul className="divide-y text-sm">
                {lead.activities.map((a) => (
                  <li key={a.id} className="py-2">
                    <div className="flex gap-2"><Badge>{a.activityType}</Badge><b>{a.subject}</b><span className="ml-auto text-xs text-muted-foreground">{fmtDate(a.activityDate)} · {a.status}</span></div>
                    {a.description && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{a.description}</p>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Meetings & Demos ({lead.meetings.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <MeetingForm leadId={lead.id} customerId={lead.customer?.id} />
              {lead.meetings.map((m) => (
                <div key={m.id} className="rounded border p-2 text-sm">
                  <div className="flex gap-2"><Badge>{m.meetingType}</Badge><span>{fmtDateTime(m.meetingDate)}</span></div>
                  {m.customerRequirements && <div><b>Requirements:</b> {m.customerRequirements}</div>}
                  {m.objections && <div><b>Objections:</b> {m.objections}</div>}
                  {m.productsDiscussed && <div><b>Products:</b> {m.productsDiscussed}</div>}
                  {m.nextSteps && <div><b>Next steps:</b> {m.nextSteps}</div>}
                  {m.notes && <div className="text-muted-foreground">{m.notes}</div>}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Follow-ups</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <FollowupForm leadId={lead.id} />
              <ul className="divide-y text-sm">
                {lead.followups.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 py-2">
                    <Badge>{f.status}</Badge>
                    <span>{fmtDate(f.followupDate)} {f.reminderTime}</span>
                    <span className="text-muted-foreground">{f.message}</span>
                    {f.status === "PENDING" && (
                      <div className="ml-auto">
                        <ActionForm action={setFollowupStatusAction.bind(null, f.id, "COMPLETED")} submitLabel="Mark done" />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Opportunities</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <OpportunityForm leadId={lead.id} customerId={lead.customer?.id} products={products} />
              <Table>
                <thead><tr><Th>Name</Th><Th>Stage</Th><Th className="text-right">Amount</Th><Th>Prob.</Th><Th>Close</Th><Th>Products</Th></tr></thead>
                <tbody>
                  {lead.opportunities.map((o) => (
                    <tr key={o.id}><Td>{o.opportunityName}</Td><Td><Badge>{o.stage}</Badge></Td><Td className="text-right">{inr(o.estimatedAmount.toString())}</Td><Td>{o.probability}%</Td><Td>{fmtDate(o.expectedCloseDate)}</Td><Td className="text-xs">{o.products.map((p) => p.productName).join(", ")}</Td></tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Quotations</CardTitle><Link href={`/quotations/new?leadId=${lead.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>+ New</Link></CardHeader>
            <Table>
              <thead><tr><Th>Number</Th><Th>Date</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></thead>
              <tbody>
                {lead.quotations.map((q) => (
                  <tr key={q.id}><Td><Link className="text-primary hover:underline" href={`/quotations/${q.id}`}>{q.quotationNumber}</Link></Td><Td>{fmtDate(q.quotationDate)}</Td><Td><Badge>{q.status}</Badge></Td><Td className="text-right">{inr(q.totalAmount.toString())}</Td></tr>
                ))}
              </tbody>
            </Table>
            {!lead.quotations.length && <Empty>No quotations yet.</Empty>}
          </Card>

          <Card>
            <CardHeader><CardTitle>Sales History</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <SaleForm leadId={lead.id} customerId={lead.customer?.id} products={products} />
              <Table>
                <thead><tr><Th>Date</Th><Th>Product</Th><Th>Payment</Th><Th className="text-right">Amount</Th></tr></thead>
                <tbody>
                  {lead.sales.map((s) => (
                    <tr key={s.id}><Td>{fmtDate(s.saleDate)}</Td><Td>{s.product?.productName ?? "—"}</Td><Td><Badge>{s.paymentStatus}</Badge></Td><Td className="text-right">{inr(s.amount.toString())}</Td></tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Stage History</CardTitle></CardHeader>
            <CardContent>
              <ul className="text-sm">
                {lead.statusHistory.map((h) => (
                  <li key={h.id} className="py-0.5 text-muted-foreground">{fmtDateTime(h.changedAt)} — {h.fromStatus ? `${label(h.fromStatus)} → ` : ""}<b className="text-foreground">{label(h.toStatus)}</b> {h.changedBy && `by ${h.changedBy.name}`}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {!lead.customer && (
            <ActionForm action={deleteLeadAction.bind(null, lead.id)} submitLabel="Delete Lead" confirm="Permanently delete this lead and its activities?">
              <p className="text-xs text-muted-foreground">Leads with customers or sales cannot be deleted; mark them LOST instead.</p>
            </ActionForm>
          )}
        </div>

        <div className="space-y-4">
          <AiPanel leadId={lead.id} customerId={lead.customer?.id} phone={lead.phone} email={lead.email} />
          <Card>
            <CardHeader><CardTitle>Recent AI Insights</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {lead.aiInteractions.map((a) => (
                <details key={a.id} className="rounded border p-2 text-xs">
                  <summary className="cursor-pointer">{label(a.interactionType)} · {fmtDateTime(a.createdAt)}</summary>
                  <pre className="mt-1 whitespace-pre-wrap">{a.response}</pre>
                </details>
              ))}
              {!lead.aiInteractions.length && <p className="text-xs text-muted-foreground">No AI insights yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
