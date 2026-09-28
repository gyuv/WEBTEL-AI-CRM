import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { leadFilterSchema, leadStatusValues } from "@/lib/validators";
import { label, inr } from "@/lib/format";
import { leadReportRows, REPORT_COLUMNS } from "@/server/services/reports";
import { Button, Card, Field, Input, PageHeader, Select, Table, Td, Th, buttonVariants } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePageActor();
  const sp = await searchParams;
  const filter = leadFilterSchema.parse(sp);
  const [sources, users, products, rows] = await Promise.all([
    prisma.leadSource.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.product.findMany({ select: { id: true, productName: true }, orderBy: { productName: "asc" } }),
    leadReportRows(actor, filter),
  ]);
  const qs = new URLSearchParams(sp);
  const total = rows.reduce((s, r) => s + Number(r["Estimated Value"]), 0);
  return (
    <div>
      <PageHeader title="Lead Source Reports" description={`${rows.length} row(s) · estimated value ${inr(total)}`} actions={
        <>
          <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/reports/export?${qs}&format=csv`}>Export CSV</a>
          <a className={buttonVariants({ size: "sm" })} href={`/api/reports/export?${qs}&format=xlsx`}>Export Excel</a>
        </>
      } />
      <Card className="mb-4 p-3">
        <form className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
          <Field label="Lead Source"><Select name="leadSourceId" defaultValue={sp.leadSourceId ?? ""}><option value="">All</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Campaign"><Input name="campaign" defaultValue={sp.campaign} /></Field>
          <Field label="Salesperson"><Select name="assignedUserId" defaultValue={sp.assignedUserId ?? ""}><option value="">All</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="Product"><Select name="productId" defaultValue={sp.productId ?? ""}><option value="">All</option>{products.map((p) => <option key={p.id} value={p.id}>{p.productName}</option>)}</Select></Field>
          <Field label="Status"><Select name="status" defaultValue={sp.status ?? ""}><option value="">All</option>{leadStatusValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
          <Field label="From"><Input type="date" name="from" defaultValue={sp.from} /></Field>
          <Field label="To"><Input type="date" name="to" defaultValue={sp.to} /></Field>
          <div className="flex items-end"><Button size="sm">Run report</Button></div>
        </form>
      </Card>
      <Card>
        <Table>
          <thead><tr>{REPORT_COLUMNS.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 200).map((r, i) => (
              <tr key={i}>{REPORT_COLUMNS.map((c) => <Td key={c} className="whitespace-nowrap text-xs">{c === "Estimated Value" ? inr(r[c]) : r[c]}</Td>)}</tr>
            ))}
          </tbody>
        </Table>
        {rows.length > 200 && <p className="p-3 text-xs text-muted-foreground">Showing first 200 rows; export for the full report.</p>}
      </Card>
    </div>
  );
}
