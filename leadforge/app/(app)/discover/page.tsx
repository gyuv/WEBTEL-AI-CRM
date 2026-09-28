import { desc, eq } from "drizzle-orm";
import { ctx, getSettings } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { DiscoverForm } from "./discover-form";
import { recentJobs } from "@/lib/server/jobs";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Discover" };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { db, userId } = await ctx();
  const s = await getSettings(userId);
  const searches = await db.select().from(schema.searches).where(eq(schema.searches.userId, userId)).orderBy(desc(schema.searches.createdAt)).limit(12);
  const jobs = await recentJobs(userId, 12);
  const active = Object.entries(s.providers).filter(([, v]) => v).map(([k]) => k);
  return (
    <>
      <PageHeader title="Discover leads" description={<>Sources on: {s.mockMode ? <Badge tone="warning">Mock data</Badge> : active.map((a) => <Badge key={a} className="mr-1">{a}</Badge>)} · <a className="underline" href="/settings">change</a></>} />
      <DiscoverForm defaultCity={s.defaultCity} initial={q ?? ""} />
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent searches" />
          <ul className="divide-y divide-border">
            {searches.map((x) => (
              <li key={x.id}><a href={`/leads?search=${x.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                <Badge>{x.inputType}</Badge><span className="flex-1 truncate text-sm">{x.rawInput.split("\n")[0]}</span>
                <span className="text-xs text-muted-fg">{x.resultCount} · {timeAgo(x.createdAt)}</span>
              </a></li>
            ))}
            {!searches.length && <li className="p-4 text-sm text-muted-fg">No searches yet.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Background jobs" description="Enrichment runs automatically; progress updates live on each lead." />
          <ul className="divide-y divide-border">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <Badge tone={j.status === "done" ? "success" : j.status === "failed" ? "danger" : "info"}>{j.status}</Badge>
                <span className="w-16 text-xs text-muted-fg">{j.type}</span>
                <span className="flex-1 truncate text-xs">{j.error ?? j.progressMsg}</span>
                <span className="text-xs tabular-nums text-muted-fg">{j.progress}%</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
