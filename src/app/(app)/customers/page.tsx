import Link from "next/link";
import { requirePageActor } from "@/server/session";
import { listCustomers } from "@/server/services/crm";
import { fmtDate } from "@/lib/format";
import { Button, buttonVariants, Card, Empty, Input, PageHeader, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requirePageActor();
  const { q } = await searchParams;
  const rows = await listCustomers(actor, q);
  return (
    <div>
      <PageHeader title="Customers" description={`${rows.length} customer(s)`} actions={<Link href="/customers/new" className={buttonVariants({ size: "sm" })}>+ New Customer</Link>} />
      <form className="mb-3 flex max-w-md gap-2"><Input name="q" defaultValue={q} placeholder="Search name, company, phone, email" /><Button size="sm">Search</Button></form>
      <Card>
        <Table>
          <thead><tr><Th>Customer</Th><Th>Company</Th><Th>Phone</Th><Th>City</Th><Th>Original Lead Source</Th><Th>Campaign</Th><Th>Lead Created</Th><Th>Sales</Th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-muted/40">
                <Td><Link className="font-medium text-primary hover:underline" href={`/customers/${c.id}`}>{c.customerName}</Link></Td>
                <Td>{c.companyName}</Td>
                <Td>{c.phone}</Td>
                <Td>{c.city}</Td>
                <Td>{c.lead?.leadSource.name ?? "—"}</Td>
                <Td>{c.lead?.campaignName ?? "—"}</Td>
                <Td>{fmtDate(c.lead?.createdAt)}</Td>
                <Td>{c._count.sales}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!rows.length && <Empty>No customers found.</Empty>}
      </Card>
    </div>
  );
}
