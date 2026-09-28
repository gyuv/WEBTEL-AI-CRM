import { Suspense } from "react";
import { requirePageActor } from "@/server/session";
import { resolveRange } from "@/lib/date-range";
import { inr, label } from "@/lib/format";
import {
  dashboardSummary,
  followupActivity,
  monthlySales,
  opportunityPipeline,
  productSales,
  sourcePerformance,
  statusDistribution,
} from "@/server/services/analytics";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, Stat } from "@/components/ui";
import { DateFilter } from "@/components/date-filter";
import { ActivityLineChart, DonutChart, MoneyBarChart, MultiBarChart } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePageActor();
  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to);
  const [s, monthly, status, products, sources, pipeline, activity] = await Promise.all([
    dashboardSummary(actor, range),
    monthlySales(actor),
    statusDistribution(actor, range),
    productSales(actor, range),
    sourcePerformance(actor, { range }),
    opportunityPipeline(actor),
    followupActivity(actor),
  ]);
  const activeSources = sources.filter((x) => x.totalLeads > 0 || x.totalSales > 0);

  return (
    <div>
      <PageHeader title="Dashboard" description="Live figures from your CRM" actions={<Suspense><DateFilter /></Suspense>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total Leads" value={s.totalLeads} />
        <Stat label="New Leads" value={s.newLeads} />
        <Stat label="Follow-ups Due Today" value={s.followupsToday} />
        <Stat label="Demos Scheduled" value={s.demosScheduled} />
        <Stat label="Quotations Pending" value={s.quotationsPending} />
        <Stat label="Negotiations" value={s.negotiations} />
        <Stat label="Won Deals" value={s.won} />
        <Stat label="Lost Deals" value={s.lost} />
        <Stat label="Total Sales" value={inr(s.totalSales)} />
        <Stat label="Current Month Sales" value={inr(s.currentMonthSales)} />
        <Stat label="Conversion Rate" value={`${s.conversionRate}%`} hint="Won ÷ leads" />
        <Stat label="Pipeline Value" value={inr(s.pipelineValue)} hint="Open leads' estimated value" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Monthly Sales (last 12 months)</CardTitle></CardHeader>
          <CardContent><MoneyBarChart data={monthly} x="month" y="sales" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Lead Status Distribution</CardTitle></CardHeader>
          <CardContent><DonutChart data={status.map((x) => ({ name: label(x.status), value: x.count }))} nameKey="name" valueKey="value" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Product-wise Sales</CardTitle></CardHeader>
          <CardContent><MoneyBarChart data={products} x="product" y="sales" color="#059669" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Lead Source Performance</CardTitle></CardHeader>
          <CardContent>
            <MultiBarChart
              data={activeSources.map((x) => ({ name: x.name, leads: x.totalLeads, demos: x.demosScheduled, quotes: x.quotationsSent, won: x.won }))}
              x="name"
              bars={[{ key: "leads", label: "Leads" }, { key: "demos", label: "Demos" }, { key: "quotes", label: "Quotations" }, { key: "won", label: "Won" }]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Lead Source Conversion %</CardTitle></CardHeader>
          <CardContent>
            <MultiBarChart percent data={activeSources.map((x) => ({ name: x.name, conv: x.conversionRate }))} x="name" bars={[{ key: "conv", label: "Lead → Won %" }]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Opportunity Pipeline (₹ by stage)</CardTitle></CardHeader>
          <CardContent><MoneyBarChart data={pipeline.map((p) => ({ stage: label(p.stage), amount: p.amount }))} x="stage" y="amount" color="#7c3aed" /></CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Follow-up Activity (last 30 days)</CardTitle></CardHeader>
          <CardContent><ActivityLineChart data={activity} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
