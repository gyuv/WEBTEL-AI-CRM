import { desc, eq, inArray, and } from "drizzle-orm";
import { ctx, getSettings, getApiKey } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { PageHeader, Badge, Card, CardHeader } from "@/components/ui";
import { Tabs } from "@/components/client";
import { QuickSearch, SweepForm, SiteForm, PasteForm, MapsCapture } from "./scraper-client";
import { CATEGORY_PRESETS } from "@/lib/leadgen/intent-presets";
import { KNOWN_PLACES } from "@/lib/leadgen/intent";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Lead scraper" };

export default async function ScraperPage() {
  const { db, userId } = await ctx();
  const s = await getSettings(userId);
  const hasToken = Boolean(await getApiKey("extension_token", userId));
  const runs = await db.select().from(schema.searches).where(and(eq(schema.searches.userId, userId), inArray(schema.searches.inputType, ["sweep", "scrape", "paste", "capture"]))).orderBy(desc(schema.searches.createdAt)).limit(15);
  return (
    <>
      <PageHeader title="Lead scraper" description={<>Bulk-collect businesses with phone numbers for telecalling. Free, no per-run caps, duplicates merged automatically. {s.mockMode && <Badge tone="warning">Mock mode: switch to live data in Settings for real results</Badge>}</>} />
      <Tabs storageKey="lf:scrapertab" tabs={[
        { id: "quick", label: "Quick search", content: <QuickSearch city={s.defaultCity} /> },
        { id: "sweep", label: "Area sweep", content: <SweepForm presets={CATEGORY_PRESETS} places={KNOWN_PLACES} city={s.defaultCity} /> },
        { id: "site", label: "Website / directory", content: <SiteForm city={s.defaultCity} /> },
        { id: "maps", label: "Google Maps capture", content: <MapsCapture hasToken={hasToken} /> },
        { id: "paste", label: "Bulk paste", content: <PasteForm city={s.defaultCity} /> },
      ]} />
      <Card className="mt-5">
        <CardHeader title="Recent scrape runs" />
        <ul className="divide-y divide-border">
          {runs.map((r) => (
            <li key={r.id}><a href={`/leads?search=${r.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50"><Badge>{r.inputType}</Badge><span className="flex-1 truncate">{r.rawInput.split("\n")[0]}</span><span className="text-xs text-muted-fg">{r.resultCount} leads · {timeAgo(r.createdAt)}</span></a></li>
          ))}
          {!runs.length && <li className="p-4 text-sm text-muted-fg">No runs yet.</li>}
        </ul>
      </Card>
    </>
  );
}
