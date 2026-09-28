import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { resolveRange } from "@/lib/date-range";
import { inr } from "@/lib/format";
import { campaignPerformance, funnelFromRow, sourcePerformance } from "@/server/services/analytics";
import { DateFilter } from "@/components/date-filter";
import { Funnel, MultiBarChart, MoneyBarChart } from "@/components/charts";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Select, Stat, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SourceAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePageActor();
  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to);
  const filter = { range, campaign: sp.campaign || undefined, assignedUserId: sp.assignedUserId || undefined };
  const [rows, campaigns, users] = await Promise.all([
    sourcePerformance(actor, filter),
    campaignPerformance(actor, filter),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const selected = rows.find((r) => r.id === sp.source);
  const sum = (k: "totalLeads" | "contacted" | "interested" | "demosScheduled" | "quotationsSent" | "won") => rows.reduce((a, r) => a + r[k], 0);
  const funnel = funnelFromRow(selected ?? { totalLeads: sum("totalLeads"), contacted: sum("contacted"), interested: sum("interested"), demosScheduled: sum("demosScheduled"), quotationsSent: sum("quotationsSent"), won: sum("won") });
  const active = rows.filter((r) => r.totalLeads > 0 || r.totalSales > 0);
  const hidden = new URLSearchParams(sp);

  return (
    <div className="space-y-4">
      <PageHeader title="Lead Source Analytics" description="Source → Leads → Demos → Quotations → Won → Revenue. All figures are computed live." actions={<Suspense><DateFilter /></Suspense>} />
      <Card className="p-3">
        <form className="flex flex-wrap items-end gap-2">
          {["range", "from", "to"].map((k) => hidden.get(k) && <input key={k} type="hidden" name={k} value={hidden.get(k)!} />)}
          <Input name="campaign" placeholder="Filter by campaign" defaultValue={sp.campaign} className="w-56" />
          {actor.role === "ADMIN" && (
            <Select name="assignedUserId" defaultValue={sp.assignedUserId ?? ""} className="w-48">
              <option value="">All salespeople</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
          <Select name="source" defaultValue={sp.source ?? ""} className="w-56">
            <option value="">Funnel: all sources</option>
            {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Button size="sm">Apply</Button>
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Conversion Funnel — {selected?.name ?? "All sources"}</CardTitle></CardHeader>
          <CardContent><Funnel stages={funnel.stages} /></CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Lead → Demo" value={`${funnel.leadToDemo}%`} />
          <Stat label="Demo → Quotation" value={`${funnel.demoToQuotation}%`} />
          <Stat label="Quotation → Won" value={`${funnel.quotationToWon}%`} />
          <Stat label="Overall Lead → Won" value={`${funnel.leadToWon}%`} />
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Source Performance</CardTitle></CardHeader>
        <Table>
          <thead>
            <tr>
              <Th>Lead Source</Th><Th className="text-right">Leads</Th><Th className="text-right">Contacted</Th><Th className="text-right">Interested</Th><Th className="text-right">Demos Sched.</Th><Th className="text-right">Demos Done</Th><Th className="text-right">Quotations</Th><Th className="text-right">Won</Th><Th className="text-right">Lost</Th><Th className="text-right">Sales</Th><Th className="text-right">Pipeline</Th><Th className="text-right">Conv. %</Th><Th className="text-right">Avg Deal</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.totalLeads ? "" : "text-muted-foreground"}>
                <Td><Link className="text-primary hover:underline" href={`/leads?leadSourceId=${r.id}`}>{r.name}</Link>{!r.active && <span className="ml-1 text-xs">(disabled)</span>}</Td>
                <Td className="text-right">{r.totalLeads}</Td><Td className="text-right">{r.contacted}</Td><Td className="text-right">{r.interested}</Td><Td className="text-right">{r.demosScheduled}</Td><Td className="text-right">{r.demosCompleted}</Td><Td className="text-right">{r.quotationsSent}</Td><Td className="text-right">{r.won}</Td><Td className="text-right">{r.lost}</Td>
                <Td className="text-right">{inr(r.totalSales)}</Td><Td className="text-right">{inr(r.pipelineValue)}</Td><Td className="text-right">{r.conversionRate}%</Td><Td className="text-right">{inr(r.averageDealValue)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Source-wise Sales</CardTitle></CardHeader><CardContent><MoneyBarChart data={active.map((r) => ({ name: r.name, sales: r.totalSales }))} x="name" y="sales" color="#059669" /></CardContent></Card>
        <Card><CardHeader><CardTitle>Source-wise Pipeline Value</CardTitle></CardHeader><CardContent><MoneyBarChart data={active.map((r) => ({ name: r.name, pipeline: r.pipelineValue }))} x="name" y="pipeline" color="#7c3aed" /></CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Compare Sources</CardTitle></CardHeader><CardContent>
          <MultiBarChart data={active.map((r) => ({ name: r.name, leads: r.totalLeads, contacted: r.contacted, demos: r.demosScheduled, quotes: r.quotationsSent, won: r.won }))} x="name" bars={[{ key: "leads", label: "Leads" }, { key: "contacted", label: "Contacted" }, { key: "demos", label: "Demos" }, { key: "quotes", label: "Quotations" }, { key: "won", label: "Won" }]} height={300} />
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Campaign Performance</CardTitle></CardHeader>
        <Table>
          <thead><tr><Th>Campaign</Th><Th>Source</Th><Th className="text-right">Leads</Th><Th className="text-right">Quotations</Th><Th className="text-right">Won</Th><Th className="text-right">Pipeline</Th></tr></thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.campaign + c.source}><Td><Link className="text-primary hover:underline" href={`/leads?campaign=${encodeURIComponent(c.campaign)}`}>{c.campaign}</Link></Td><Td>{c.source}</Td><Td className="text-right">{c.leads}</Td><Td className="text-right">{c.quotations}</Td><Td className="text-right">{c.won}</Td><Td className="text-right">{inr(c.pipeline)}</Td></tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
