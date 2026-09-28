import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { getSettings, notify } from "./core";
import { politeFetch } from "../compliance/fetcher";
import { extractListings, findNextPage } from "./scraper-parse";
export { parseBulkText } from "./scraper-parse";
import { parseQueryIntent } from "../leadgen/intent";
import { discoverMock, discoverOsm, type RawLead } from "../providers";
import { upsertRawLead } from "./leads";

type Progress = (p: number, m: string) => Promise<void>;
export interface SaveOpts { requirePhone?: boolean; addToCallQueue?: boolean; autoEnrich?: boolean; searchId?: string | null; category?: string | null; city?: string | null }

/** Save scraped leads: dedupe, optional phone filter, optional "call today" task. */
export async function saveScraped(userId: string, leads: RawLead[], o: SaveOpts, progress?: Progress) {
  const db = await getDb();
  let created = 0, merged = 0, skipped = 0;
  const ids: string[] = [];
  for (const [i, l] of leads.entries()) {
    if (o.requirePhone && !(l.phones ?? []).length) { skipped++; continue; }
    const r = await upsertRawLead(userId, { ...l, category: l.category ?? o.category ?? null, city: l.city ?? o.city ?? null }, o.searchId);
    ids.push(r.id);
    if (r.created) {
      created++;
      if (o.addToCallQueue) await db.insert(schema.tasks).values({ userId, leadId: r.id, kind: "call", title: `Call ${l.name}`, dueAt: new Date(), origin: "scraper" });
    } else merged++;
    if (progress && i % 10 === 0) await progress(60 + Math.round((i / Math.max(leads.length, 1)) * 35), `Saving ${i + 1}/${leads.length}`);
  }
  if (o.autoEnrich) {
    const { enqueue } = await import("./jobs");
    for (const id of ids.slice(0, 500)) await enqueue(userId, "enrich", { leadId: id }, `enrich:${id}`);
  }
  if (o.searchId) await db.update(schema.searches).set({ resultCount: ids.length }).where(eq(schema.searches.id, o.searchId));
  return { created, merged, skipped, total: ids.length };
}

/** Area sweep: every category × every area, from OpenStreetMap (free, no key). */
export async function sweep(userId: string, p: { categories: string[]; areas: string[]; city: string; radiusKm: number; perQuery: number } & SaveOpts, progress: Progress) {
  const s = await getSettings(userId);
  const combos = p.categories.flatMap((c) => (p.areas.length ? p.areas : [""]).map((a) => ({ c, a })));
  const all: RawLead[] = [];
  const notes: string[] = [];
  for (const [i, { c, a }] of combos.entries()) {
    await progress(Math.round((i / combos.length) * 60), `Sweeping ${c}${a ? ` in ${a}` : ""} (${i + 1}/${combos.length})`);
    const intent = parseQueryIntent(`${c} in ${a || p.city}`, p.city);
    if (a) { intent.area = a; intent.location = p.city; }
    const opts = { intent, limit: p.perQuery, radiusKm: p.radiusKm, userId };
    try {
      all.push(...(s.mockMode ? discoverMock(opts) : await discoverOsm(opts)));
    } catch (e) { notes.push(`${c}/${a}: ${(e as Error).message}`); }
  }
  const res = await saveScraped(userId, all, { ...p, city: p.city }, progress);
  await notify(`Area sweep done: ${res.created} new leads`, notes.slice(0, 3).join("; ") || undefined, undefined, "discovery", userId);
  return { ...res, combos: combos.length, found: all.length, notes };
}

export async function scrapeSite(userId: string, p: { urls: string[]; maxPages: number } & SaveOpts, progress: Progress) {
  const s = await getSettings(userId);
  const all: RawLead[] = [];
  const log: { url: string; status: string; found: number }[] = [];
  let pages = 0;
  const total = p.urls.length * p.maxPages;
  for (const start of p.urls) {
    let url: string | null = start;
    const visited = new Set<string>();
    for (let i = 0; url && i < p.maxPages && !visited.has(url); i++) {
      visited.add(url);
      await progress(Math.round((pages / total) * 60), `Reading ${url.slice(0, 70)}`);
      const r = await politeFetch(url, { contact: s.userAgentContact, minDelayMs: 1500 });
      pages++;
      if (!r.ok || !r.html) { log.push({ url, status: r.reason ?? "failed", found: 0 }); break; }
      const found = extractListings(r.html, r.url);
      log.push({ url: r.url, status: "ok", found: found.length });
      all.push(...found);
      url = findNextPage(r.html, r.url);
    }
  }
  const res = await saveScraped(userId, all, p, progress);
  await notify(`Website scrape done: ${res.created} new leads from ${pages} page(s)`, undefined, undefined, "discovery", userId);
  return { ...res, pages, log };
}

