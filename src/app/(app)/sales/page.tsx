import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { childScope } from "@/server/services/access";
import { fmtDate, inr } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const actor = await requirePageActor();
  const sales = await prisma.sale.findMany({
    where: childScope(actor),
    include: { product: true, customer: true, lead: { include: { leadSource: true } } },
    orderBy: { saleDate: "desc" },
    take: 500,
  });
  const total = sales.reduce((s, x) => s + Number(x.amount), 0);
  return (
    <div>
      <PageHeader title="Sales" description={`${sales.length} sale(s) · ${inr(total)} · record sales from a lead or customer page`} />
      <Card>
        <Table>
          <thead><tr><Th>Date</Th><Th>Customer</Th><Th>Product</Th><Th>Lead Source</Th><Th>Campaign</Th><Th>Payment</Th><Th className="text-right">Amount</Th></tr></thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id}>
                <Td>{fmtDate(s.saleDate)}</Td>
                <Td>{s.customer ? <Link className="text-primary hover:underline" href={`/customers/${s.customer.id}`}>{s.customer.customerName}</Link> : s.lead && <Link className="text-primary hover:underline" href={`/leads/${s.lead.id}`}>{s.lead.name}</Link>}</Td>
                <Td>{s.product?.productName ?? "—"}</Td>
                <Td>{s.lead?.leadSource.name ?? "—"}</Td>
                <Td>{s.lead?.campaignName ?? "—"}</Td>
                <Td><Badge>{s.paymentStatus}</Badge></Td>
                <Td className="text-right tabular-nums">{inr(s.amount.toString())}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!sales.length && <Empty>No sales recorded.</Empty>}
      </Card>
    </div>
  );
}
