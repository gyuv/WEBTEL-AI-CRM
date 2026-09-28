import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { customerScope } from "@/server/services/access";
import { fmtDate, fmtDateTime, inr } from "@/lib/format";
import { AiPanel } from "@/components/ai-panel";
import { ActivityForm, FollowupForm, MeetingForm, OpportunityForm, SaleForm } from "@/components/record-forms";
import { Badge, buttonVariants, Card, CardContent, CardHeader, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;
  const c = await prisma.customer.findFirst({
    where: { id, ...customerScope(actor) },
    include: {
      lead: { include: { leadSource: true } },
      activities: { orderBy: { activityDate: "desc" } },
      meetings: { orderBy: { meetingDate: "desc" } },
      followups: { orderBy: { followupDate: "asc" } },
      opportunities: { include: { products: true } },
      quotations: { orderBy: { quotationDate: "desc" } },
      sales: { include: { product: true }, orderBy: { saleDate: "desc" } },
    },
  });
  if (!c) notFound();
  const products = await prisma.product.findMany({ where: { active: true }, select: { id: true, productName: true }, orderBy: { productName: "asc" } });
  const total = c.sales.reduce((s, x) => s + Number(x.amount), 0);
  const kv = (k: string, v: React.ReactNode) => (
    <div><div className="text-[11px] uppercase text-muted-foreground">{k}</div><div className="whitespace-pre-wrap text-sm">{v || "—"}</div></div>
  );
  return (
    <div className="space-y-4">
      <PageHeader
        title={c.customerName}
        description={<>{c.companyName} {c.isDemo && <Badge tone="PENDING">DEMO DATA</Badge>}</>}
        actions={
          <>
            <Link href={`/customers/${c.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>Edit</Link>
            <Link href={`/quotations/new?customerId=${c.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>New Quotation</Link>
            {c.lead && <Link href={`/leads/${c.lead.id}`} className={buttonVariants({ size: "sm" })}>Original Lead</Link>}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Customer Profile</CardTitle><span className="text-sm font-semibold">Total sales: {inr(total)}</span></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {kv("Phone", c.phone)}{kv("Email", c.email)}{kv("City", c.city)}{kv("Industry", c.industry)}
              {kv("Users", c.numberOfUsers)}{kv("Current Software", c.currentSoftware)}{kv("Current Server", c.currentServer)}{kv("Cloud Provider", c.currentCloudProvider)}
              {kv("Address", c.address)}{kv("Pain Points", c.painPoints)}{kv("Requirements", c.requirements)}{kv("Notes", c.notes)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Original Lead Source (preserved)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {kv("Source", c.lead?.leadSource.name ?? "Direct customer entry")}{kv("Campaign", c.lead?.campaignName)}{kv("Referral", c.lead?.referralName)}{kv("Source Details", c.lead?.leadSourceDetails)}{kv("Lead Created", fmtDate(c.lead?.createdAt))}
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Sales</CardTitle></CardHeader><CardContent className="space-y-3">
            <SaleForm customerId={c.id} products={products} />
            <Table><thead><tr><Th>Date</Th><Th>Product</Th><Th>Payment</Th><Th className="text-right">Amount</Th></tr></thead><tbody>
              {c.sales.map((s) => <tr key={s.id}><Td>{fmtDate(s.saleDate)}</Td><Td>{s.product?.productName ?? "—"}</Td><Td><Badge>{s.paymentStatus}</Badge></Td><Td className="text-right">{inr(s.amount.toString())}</Td></tr>)}
            </tbody></Table>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Quotations</CardTitle></CardHeader>
            <Table><thead><tr><Th>Number</Th><Th>Date</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></thead><tbody>
              {c.quotations.map((q) => <tr key={q.id}><Td><Link className="text-primary hover:underline" href={`/quotations/${q.id}`}>{q.quotationNumber}</Link></Td><Td>{fmtDate(q.quotationDate)}</Td><Td><Badge>{q.status}</Badge></Td><Td className="text-right">{inr(q.totalAmount.toString())}</Td></tr>)}
            </tbody></Table>
          </Card>
          <Card><CardHeader><CardTitle>Opportunities</CardTitle></CardHeader><CardContent className="space-y-3">
            <OpportunityForm customerId={c.id} leadId={c.leadId ?? undefined} products={products} />
            {c.opportunities.map((o) => <div key={o.id} className="text-sm">{o.opportunityName} · <Badge>{o.stage}</Badge> · {inr(o.estimatedAmount.toString())}</div>)}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Activities</CardTitle></CardHeader><CardContent className="space-y-3">
            <ActivityForm customerId={c.id} />
            {c.activities.map((a) => <div key={a.id} className="text-sm"><Badge>{a.activityType}</Badge> <b>{a.subject}</b> <span className="text-xs text-muted-foreground">{fmtDate(a.activityDate)}</span></div>)}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Meetings</CardTitle></CardHeader><CardContent className="space-y-3">
            <MeetingForm customerId={c.id} />
            {c.meetings.map((m) => <div key={m.id} className="text-sm"><Badge>{m.meetingType}</Badge> {fmtDateTime(m.meetingDate)} — {m.nextSteps ?? m.notes}</div>)}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Follow-ups</CardTitle></CardHeader><CardContent className="space-y-3">
            <FollowupForm customerId={c.id} />
            {c.followups.map((f) => <div key={f.id} className="text-sm"><Badge>{f.status}</Badge> {fmtDate(f.followupDate)} — {f.message}</div>)}
          </CardContent></Card>
        </div>
        <div><AiPanel customerId={c.id} leadId={c.leadId ?? undefined} phone={c.phone} email={c.email} /></div>
      </div>
    </div>
  );
}
