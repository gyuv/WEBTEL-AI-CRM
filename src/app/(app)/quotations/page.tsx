import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { childScope } from "@/server/services/access";
import { fmtDate, inr } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function QuotationsPage() {
  const actor = await requirePageActor();
  const rows = await prisma.quotation.findMany({
    where: childScope(actor),
    include: { lead: { select: { id: true, name: true, companyName: true, leadSource: { select: { name: true } } } }, customer: { select: { customerName: true, companyName: true } } },
    orderBy: { quotationDate: "desc" },
    take: 500,
  });
  return (
    <div>
      <PageHeader title="Quotations" description="Create quotations from a lead or customer page" />
      <Card>
        <Table>
          <thead><tr><Th>Number</Th><Th>Date</Th><Th>Party</Th><Th>Source</Th><Th>Status</Th><Th>Valid Until</Th><Th className="text-right">Subtotal</Th><Th className="text-right">GST</Th><Th className="text-right">Total</Th></tr></thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.id}>
                <Td><Link href={`/quotations/${q.id}`} className="font-medium text-primary hover:underline">{q.quotationNumber}</Link></Td>
                <Td>{fmtDate(q.quotationDate)}</Td>
                <Td>{q.customer?.customerName ?? q.lead?.name}<div className="text-xs text-muted-foreground">{q.customer?.companyName ?? q.lead?.companyName}</div></Td>
                <Td>{q.lead?.leadSource.name ?? "—"}</Td>
                <Td><Badge>{q.status}</Badge></Td>
                <Td>{fmtDate(q.validUntil)}</Td>
                <Td className="text-right">{inr(q.subtotal.toString())}</Td>
                <Td className="text-right">{inr(q.gstAmount.toString())}</Td>
                <Td className="text-right font-medium">{inr(q.totalAmount.toString())}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!rows.length && <Empty>No quotations yet.</Empty>}
      </Card>
    </div>
  );
}
