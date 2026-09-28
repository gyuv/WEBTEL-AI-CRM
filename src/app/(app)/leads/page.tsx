import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { listLeads } from "@/server/services/leads";
import { inr, fmtDate, label } from "@/lib/format";
import { leadStatusValues, priorityValues } from "@/lib/validators";
import { Badge, Button, buttonVariants, Card, Empty, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePageActor();
  const sp = await searchParams;
  const [data, sources, users, cities] = await Promise.all([
    listLeads(actor, sp),
    prisma.leadSource.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.lead.findMany({ where: { city: { not: null } }, distinct: ["city"], select: { city: true }, orderBy: { city: "asc" } }),
  ]);
  const qs = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) p.set(k, String(v));
    return `/leads?${p.toString()}`;
  };
  const sortLink = (key: string, text: string) => {
    const dir = sp.sort === key && sp.dir !== "asc" ? "asc" : "desc";
    return <Link href={qs({ sort: key, dir, page: 1 })} className="hover:underline">{text}{sp.sort === key ? (sp.dir === "asc" ? " ↑" : " ↓") : ""}</Link>;
  };
  const exportQs = new URLSearchParams(sp);
  exportQs.delete("page");

  return (
    <div>
      <PageHeader
        title="Leads"
        description={`${data.total} lead(s)`}
        actions={
          <>
            <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/reports/export?${exportQs}&format=csv`}>Export CSV</a>
            <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/reports/export?${exportQs}&format=xlsx`}>Export Excel</a>
            <Link className={buttonVariants({ size: "sm" })} href="/leads/new">+ New Lead</Link>
          </>
        }
      />
      <Card className="mb-4 p-3">
        <form className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
          <Input name="q" placeholder="Search name, company, phone…" defaultValue={sp.q} className="col-span-2" />
          <Select name="leadSourceId" defaultValue={sp.leadSourceId ?? ""}>
            <option value="">All sources</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (disabled)"}</option>)}
          </Select>
          <Input name="campaign" placeholder="Campaign" defaultValue={sp.campaign} />
          <Select name="status" defaultValue={sp.status ?? ""}>
            <option value="">All statuses</option>
            {leadStatusValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
          <Select name="priority" defaultValue={sp.priority ?? ""}>
            <option value="">All priorities</option>
            {priorityValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
          <Select name="city" defaultValue={sp.city ?? ""}>
            <option value="">All cities</option>
            {cities.map((c) => <option key={c.city} value={c.city!}>{c.city}</option>)}
          </Select>
          <Select name="assignedUserId" defaultValue={sp.assignedUserId ?? ""}>
            <option value="">All salespeople</option>
            <option value="unassigned">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <Input type="date" name="from" defaultValue={sp.from} title="Created from" />
          <Input type="date" name="to" defaultValue={sp.to} title="Created to" />
          <div className="col-span-2 flex gap-2">
            <Button size="sm" type="submit">Apply filters</Button>
            <Link href="/leads" className={buttonVariants({ variant: "ghost", size: "sm" })}>Reset</Link>
          </div>
        </form>
      </Card>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>{sortLink("name", "Name")}</Th>
              <Th>Company</Th>
              <Th>Phone</Th>
              <Th>Source</Th>
              <Th>Campaign / Details</Th>
              <Th>{sortLink("status", "Status")}</Th>
              <Th>{sortLink("priority", "Priority")}</Th>
              <Th className="text-right">{sortLink("estimatedValue", "Value")}</Th>
              <Th>Assigned</Th>
              <Th>{sortLink("createdAt", "Created")}</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((l) => (
              <tr key={l.id} className="hover:bg-muted/40">
                <Td><Link href={`/leads/${l.id}`} className="font-medium text-primary hover:underline">{l.name}</Link></Td>
                <Td>{l.companyName}</Td>
                <Td>{l.phone}</Td>
                <Td>{l.leadSource.name}</Td>
                <Td className="max-w-[200px] truncate text-xs text-muted-foreground">{[l.campaignName, l.referralName, l.leadSourceDetails].filter(Boolean).join(" · ")}</Td>
                <Td><Badge>{l.status}</Badge></Td>
                <Td><Badge>{l.priority}</Badge></Td>
                <Td className="text-right tabular-nums">{inr(l.estimatedValue.toString())}</Td>
                <Td>{l.assignedUser?.name ?? "—"}</Td>
                <Td className="whitespace-nowrap">{fmtDate(l.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!data.rows.length && <Empty>No leads match these filters.</Empty>}
        <div className="flex items-center justify-between p-3 text-sm">
          <span className="text-muted-foreground">Page {data.page} of {data.pages}</span>
          <div className="flex gap-2">
            {data.page > 1 && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={qs({ page: data.page - 1 })}>Previous</Link>}
            {data.page < data.pages && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={qs({ page: data.page + 1 })}>Next</Link>}
          </div>
        </div>
      </Card>
    </div>
  );
}
