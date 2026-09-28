import { eq } from "drizzle-orm";
import { Package, Plus, Lightbulb } from "lucide-react";
import { ctx } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { productPerformance } from "@/lib/server/analytics";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, buttonClass } from "@/components/ui";

export const metadata = { title: "My products" };

export default async function ProductsPage() {
  const { db, userId } = await ctx();
  const products = await db.select().from(schema.products).where(eq(schema.products.userId, userId)).orderBy(schema.products.name);
  const perf = new Map((await productPerformance(userId)).map((p) => [p.id, p]));
  return (
    <>
      <PageHeader title="My products & offerings" description="Your catalog is injected into every pitch, so recommendations match what you actually sell."
        actions={<><a href="/insights" className={buttonClass("outline")}><Lightbulb className="h-4 w-4" /> Gap finder</a><a href="/products/new" className={buttonClass()}><Plus className="h-4 w-4" /> Add product</a></>} />
      {products.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => {
            const s = perf.get(p.id);
            return (
              <a key={p.id} href={`/products/${p.id}`} className="group">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardHeader title={<span className="flex items-center gap-2">{p.name}{!p.active && <Badge>inactive</Badge>}</span>} description={p.category ?? undefined} />
                  <CardBody className="space-y-3">
                    <p className="line-clamp-2 text-sm text-muted-fg">{p.shortDesc}</p>
                    <div className="flex flex-wrap gap-1">{p.problemsSolved.slice(0, 6).map((t) => <Badge key={t} tone="primary">{t}</Badge>)}</div>
                    <div className="grid grid-cols-4 gap-1 text-center text-xs">
                      {([["Pitched", s?.pitched], ["Replies", s?.replies], ["Meetings", s?.meetings], ["Wins", s?.wins]] as const).map(([k, v]) => <div key={k} className="rounded bg-muted py-1.5"><p className="font-semibold tabular-nums">{v ?? 0}</p><p className="text-[10px] text-muted-fg">{k}</p></div>)}
                    </div>
                    {s?.top_industry && <p className="text-[11px] text-muted-fg">Best-fit industry: <b className="text-fg">{s.top_industry}</b></p>}
                    {p.pricing && <p className="text-xs">{p.pricing}</p>}
                  </CardBody>
                </Card>
              </a>
            );
          })}
        </div>
      ) : <EmptyState icon={<Package />} title="No products yet" description="Add what you sell. Paste a URL or brochure and AI fills in the details." action={<a href="/products/new" className={buttonClass()}>Add product</a>} />}
    </>
  );
}
