import { Lightbulb, CheckCircle2, AlertCircle } from "lucide-react";
import { ctx } from "@/lib/server/core";
import { gapFinder, productPerformance, breakdowns } from "@/lib/server/analytics";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { Bars } from "@/components/charts";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const { userId } = await ctx();
  const [gaps, perf, bd] = await Promise.all([gapFinder(userId), productPerformance(userId), breakdowns(userId)]);
  const uncovered = gaps.filter((g) => !g.covered);
  return (
    <>
      <PageHeader title="Insights" description="What your leads struggle with, what you can sell them, and where your catalog has gaps." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="Gap finder" description="Pain points aggregated across all analysed leads. Red = frequent pain you have no product for (product-idea signal)." />
          <CardBody>
            {gaps.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <Bars data={gaps.slice(0, 12).map((g) => ({ pain: g.title.length > 28 ? g.title.slice(0, 27) + "…" : g.title, leads: g.n }))} x="pain" y="leads" layout="vertical" height={Math.max(220, gaps.slice(0, 12).length * 28)} />
                <ul className="space-y-1.5">
                  {gaps.map((g) => (
                    <li key={g.title} className="flex items-center gap-2 text-sm">
                      {g.covered ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <AlertCircle className="h-4 w-4 shrink-0 text-danger" />}
                      <span className="flex-1">{g.title}</span><Badge>{g.n} leads</Badge>
                      {g.covered ? <span className="hidden text-[11px] text-muted-fg md:inline">{g.products.join(", ")}</span> : <Badge tone="danger">No product</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : <EmptyState icon={<Lightbulb />} title="No analysed leads yet" />}
            {uncovered.length > 0 && <p className="mt-4 rounded-md bg-warning/10 p-3 text-sm text-warning"><b>Product idea:</b> {uncovered[0].n} of your leads show “{uncovered[0].title}”. Consider partnering or adding an offering for it.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Product performance" />
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-fg"><tr><th className="p-3">Product</th><th className="p-3 text-right">Pitched</th><th className="p-3 text-right">Replies</th><th className="p-3 text-right">Meetings</th><th className="p-3 text-right">Wins</th><th className="p-3">Best industry</th></tr></thead>
            <tbody className="divide-y divide-border">{perf.map((p) => <tr key={p.id}><td className="p-3"><a href={`/products/${p.id}`} className="hover:underline">{p.name}</a></td><td className="p-3 text-right tabular-nums">{p.pitched}</td><td className="p-3 text-right tabular-nums">{p.replies}</td><td className="p-3 text-right tabular-nums">{p.meetings}</td><td className="p-3 text-right tabular-nums">{p.wins}</td><td className="p-3 text-xs">{p.top_industry ?? "—"}</td></tr>)}</tbody></table></div>
        </Card>
        <Card>
          <CardHeader title="Best industries" description="Leads that became interested or better" />
          <CardBody>{bd.byCategory.length ? <Bars data={bd.byCategory.map((c) => ({ category: (c.category ?? "").slice(0, 22), interested: c.interested, leads: c.leads }))} x="category" y="leads" layout="vertical" /> : <p className="text-sm text-muted-fg">No data.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Template / variant performance" />
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-fg"><tr><th className="p-3">Variant</th><th className="p-3 text-right">Sent</th><th className="p-3 text-right">Replied</th><th className="p-3 text-right">Rate</th></tr></thead>
            <tbody className="divide-y divide-border">{bd.byTemplate.map((t) => <tr key={t.variant}><td className="p-3">{t.variant}</td><td className="p-3 text-right">{t.sent}</td><td className="p-3 text-right">{t.replied}</td><td className="p-3 text-right">{t.sent ? Math.round((t.replied / t.sent) * 100) : 0}%</td></tr>)}
            {!bd.byTemplate.length && <tr><td colSpan={4} className="p-4 text-center text-muted-fg">Log sent emails to compare variants.</td></tr>}</tbody></table></div>
        </Card>
        <Card>
          <CardHeader title="Call outcomes" />
          <CardBody>{bd.outcomes.length ? <Bars data={bd.outcomes.map((o) => ({ outcome: o.outcome.replace(/_/g, " "), n: o.n }))} x="outcome" y="n" layout="vertical" /> : <p className="text-sm text-muted-fg">No calls logged.</p>}</CardBody>
        </Card>
      </div>
    </>
  );
}
