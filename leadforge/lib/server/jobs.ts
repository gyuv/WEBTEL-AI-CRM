import "server-only";
import { and, eq, sql, desc } from "drizzle-orm";
import Papa from "papaparse";
import { getDb, schema } from "../db/client";
import { getSettings, notify } from "./core";
import { parseInput, nameFromMapsUrl, type SearchIntent } from "../leadgen/intent";
import { discoverMock, discoverOsm, discoverPlaces, searchWeb, type RawLead } from "../providers";
import { upsertRawLead } from "./leads";
import { enrichLead } from "./enrich";
import { discoverPeopleViaSearch } from "./people";
import { analyzeLead } from "../ai/engine";
import { domainFromUrl } from "../utils";

export type JobType = "discover" | "enrich" | "people" | "analyze" | "inbox_sync" | "sweep" | "scrape_site";

export async function enqueue(userId: string, type: JobType, payload: Record<string, unknown>, idempotencyKey?: string) {
  const db = await getDb();
  const [row] = await db.insert(schema.jobs).values({ userId, type, payload, idempotencyKey })
    .onConflictDoNothing().returning();
  if (row) return row;
  const [ex] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.userId, userId), eq(schema.jobs.idempotencyKey, idempotencyKey!)));
  if (ex && (ex.status === "failed" || ex.status === "done")) {
    const [re] = await db.update(schema.jobs).set({ status: "queued", attempts: 0, error: null, progress: 0, runAfter: new Date(), payload }).where(eq(schema.jobs.id, ex.id)).returning();
    return re;
  }
  return ex;
}

async function claim() {
  const db = await getDb();
  await db.execute(sql`update jobs set status = 'queued', locked_at = null where status = 'running' and locked_at < now() - interval '5 minutes'`);
  const res = await db.execute(sql`
    update jobs set status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
    where id = (select id from jobs where status = 'queued' and run_after <= now() order by created_at limit 1 for update skip locked)
    returning id`);
  const rows = (res as unknown as { rows?: { id: string }[] }).rows ?? (res as unknown as { id: string }[]);
  const id = rows[0]?.id;
  if (!id) return null;
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return job;
}

/** Process queued jobs until the time budget is used. Safe to call concurrently (row locking). */
export async function runJobs(budgetMs = 50000) {
  const start = Date.now();
  let done = 0;
  while (Date.now() - start < budgetMs) {
    const job = await claim();
    if (!job) break;
    const db = await getDb();
    const progress = async (p: number, msg: string) => {
      await db.update(schema.jobs).set({ progress: p, progressMsg: msg, updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
    };
    try {
      const result = await HANDLERS[job.type as JobType](job.userId, job.payload, progress);
      await db.update(schema.jobs).set({ status: "done", progress: 100, progressMsg: "Done", result: result ?? {}, error: null, updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      const failed = job.attempts >= job.maxAttempts;
      await db.update(schema.jobs).set({
        status: failed ? "failed" : "queued", error: msg, updatedAt: new Date(),
        runAfter: new Date(Date.now() + 2 ** job.attempts * 15000),
      }).where(eq(schema.jobs.id, job.id));
      if (failed) await notify(`Job failed: ${job.type}`, msg, (job.payload.leadId as string) ?? undefined, "error", job.userId);
    }
    done++;
  }
  return { processed: done };
}

type Handler = (userId: string, payload: Record<string, unknown>, progress: (p: number, m: string) => Promise<void>) => Promise<Record<string, unknown> | void>;

const AGGREGATORS = /justdial|indiamart|sulekha|tradeindia|facebook|instagram|linkedin|youtube|wikipedia|practo|zomato|swiggy|google|quora|reddit|twitter|x\.com|yelp|magicbricks|99acres|naukri|indeed/i;

async function discover(userId: string, payload: Record<string, unknown>, progress: (p: number, m: string) => Promise<void>) {
  const db = await getDb();
  const s = await getSettings(userId);
  const raw = String(payload.input ?? "");
  const filters = (payload.filters ?? {}) as { radiusKm?: number; limit?: number; hasWebsite?: "any" | "yes" | "no"; minRating?: number; category?: string; city?: string };
  const parsed = payload.inputType === "csv" ? { type: "csv" as const, items: [] } : parseInput(raw, filters.city || s.defaultCity);
  const limit = Math.min(filters.limit ?? 30, 100);
  let leads: RawLead[] = [];
  const intent: SearchIntent | undefined = parsed.intent ? { ...parsed.intent, ...(filters.category ? { category: filters.category } : {}), ...(filters.city ? { location: filters.city } : {}) } : undefined;
  await progress(5, `Input understood as: ${parsed.type}`);
  const notes: string[] = [];

  if (parsed.type === "query" && intent) {
    const opts = { intent, limit, radiusKm: filters.radiusKm ?? 5, userId };
    if (s.mockMode) leads = discoverMock(opts);
    else {
      if (s.providers.places) { try { leads.push(...(await discoverPlaces(opts))); } catch (e) { notes.push((e as Error).message); } }
      if (s.providers.osm) {
        await progress(15, "Searching OpenStreetMap");
        try { leads.push(...(await discoverOsm(opts))); } catch (e) { notes.push(`OSM: ${(e as Error).message}`); }
      }
      if (leads.length < limit / 2) {
        await progress(30, "Searching the web for more");
        const results = await searchWeb(`${intent.category} ${intent.area ?? ""} ${intent.location}`, userId, 10).catch(() => []);
        for (const r of results) {
          const d = domainFromUrl(r.url);
          if (!d || AGGREGATORS.test(d)) continue;
          leads.push({ name: r.title.split(/[|\-–]/)[0].trim(), website: `https://${d}`, city: intent.location, area: intent.area, category: intent.category, source: `search:${r.source}`, sourceUrl: r.url });
        }
      }
    }
  } else if (parsed.type === "names") {
    for (const [i, name] of parsed.items.entries()) {
      await progress(5 + Math.round((i / parsed.items.length) * 40), `Looking up ${name}`);
      let website: string | null = null;
      const res = await searchWeb(`"${name}" ${filters.city ?? s.defaultCity}`, userId, 5).catch(() => []);
      const hit = res.find((r) => { const d = domainFromUrl(r.url); return d && !AGGREGATORS.test(d); });
      if (hit) website = `https://${domainFromUrl(hit.url)}`;
      leads.push({ name, website, city: filters.city ?? s.defaultCity, category: filters.category ?? null, source: s.mockMode ? "mock" : "paste", sourceUrl: hit?.url });
    }
  } else if (parsed.type === "urls") {
    leads = parsed.items.map((u) => ({ name: domainFromUrl(u)!, website: u, city: filters.city ?? null, category: filters.category ?? null, source: "url", sourceUrl: u }));
  } else if (parsed.type === "maps") {
    leads = parsed.items.map((u) => ({ name: nameFromMapsUrl(u) ?? "Unnamed place", mapsUrl: u, city: filters.city ?? s.defaultCity, category: filters.category ?? null, source: "maps-link", sourceUrl: u }));
  } else if (parsed.type === "csv") {
    const csv = Papa.parse<Record<string, string>>(raw.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
    const g = (r: Record<string, string>, ...keys: string[]) => keys.map((k) => r[k]).find((v) => v && v.trim())?.trim() ?? null;
    leads = csv.data.map((r) => ({
      name: g(r, "name", "company", "company name", "business", "organization") ?? "Unnamed",
      phones: [g(r, "phone", "mobile", "phone number", "contact"), g(r, "phone2", "landline")].filter(Boolean) as string[],
      emails: [g(r, "email", "email address")].filter(Boolean) as string[],
      website: g(r, "website", "url", "domain"), city: g(r, "city") ?? filters.city ?? null, area: g(r, "area", "locality"),
      address: g(r, "address"), category: g(r, "category", "industry") ?? filters.category ?? null, pincode: g(r, "pincode", "zip"),
      source: "csv", sourceUrl: null,
    })).filter((l) => l.name !== "Unnamed");
  }

  if (filters.hasWebsite === "yes") leads = leads.filter((l) => l.website);
  if (filters.hasWebsite === "no") leads = leads.filter((l) => !l.website);
  if (filters.minRating) leads = leads.filter((l) => (l.rating ?? 0) >= filters.minRating!);
  leads = leads.slice(0, parsed.type === "csv" ? 2000 : limit);

  let created = 0, merged = 0;
  const ids: string[] = [];
  for (const [i, l] of leads.entries()) {
    const r = await upsertRawLead(userId, l, payload.searchId as string);
    ids.push(r.id);
    if (r.created) created++; else merged++;
    if (i % 5 === 0) await progress(50 + Math.round((i / Math.max(leads.length, 1)) * 40), `Saved ${i + 1}/${leads.length}`);
  }
  if (payload.searchId) {
    await db.update(schema.searches).set({ resultCount: ids.length, intent: (intent ?? { type: parsed.type }) as unknown as Record<string, unknown> }).where(eq(schema.searches.id, payload.searchId as string));
  }
  if (payload.autoEnrich !== false) {
    for (const id of ids) await enqueue(userId, "enrich", { leadId: id }, `enrich:${id}`);
  }
  await notify(`Discovery finished: ${created} new, ${merged} merged`, notes.join("; ") || undefined, undefined, "discovery", userId);
  return { created, merged, total: ids.length, leadIds: ids.slice(0, 200), notes, intent: intent as unknown as Record<string, unknown> };
}

export const HANDLERS: Record<JobType, Handler> = {
  discover,
  async enrich(userId, payload, progress) {
    const leadId = String(payload.leadId);
    const r = await enrichLead(userId, leadId, progress);
    const p = await discoverPeopleViaSearch(userId, leadId, progress);
    await progress(92, "Analyzing pain points & product fit");
    await analyzeLead(userId, leadId);
    return { ...r, peopleFromSearch: p.found, peopleNote: "skipped" in p ? p.skipped : null };
  },
  async people(userId, payload, progress) {
    return discoverPeopleViaSearch(userId, String(payload.leadId), progress);
  },
  async analyze(userId, payload) {
    const r = await analyzeLead(userId, String(payload.leadId), { force: Boolean(payload.force) });
    return { model: r.model, pains: r.analysis.pains.length };
  },
  async sweep(userId, payload, progress) {
    const { sweep } = await import("./scraper");
    return sweep(userId, payload as never, progress) as unknown as Record<string, unknown>;
  },
  async scrape_site(userId, payload, progress) {
    const { scrapeSite } = await import("./scraper");
    return scrapeSite(userId, payload as never, progress) as unknown as Record<string, unknown>;
  },
  async inbox_sync(userId) {
    const { syncGmail } = await import("./inbox");
    return syncGmail(userId);
  },
};

export async function recentJobs(userId: string, limit = 20) {
  const db = await getDb();
  return db.select().from(schema.jobs).where(eq(schema.jobs.userId, userId)).orderBy(desc(schema.jobs.createdAt)).limit(limit);
}
