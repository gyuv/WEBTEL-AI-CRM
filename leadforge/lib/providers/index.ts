import "server-only";
import { cacheGet, cacheSet, getApiKey, getSettings, trackUsage, usageToday } from "../server/core";
import { hashString, sleep } from "../utils";
import { userAgent } from "../compliance/fetcher";
import { mockCompanies, mockPeople } from "../mock/data";
import { FREE_LIMITS } from "../settings-types";
import type { DiscoveryOptions, RawLead, WebResult } from "./types";

export type { RawLead, WebResult };

const last = new Map<string, number>();
async function throttle(id: string, minMs: number) {
  const wait = (last.get(id) ?? 0) + minMs - Date.now();
  if (wait > 0) await sleep(wait);
  last.set(id, Date.now());
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let err: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { err = e; await sleep(800 * 2 ** i); }
  }
  throw err;
}

async function guard(id: string, userId: string) {
  const lim = FREE_LIMITS[id]?.daily ?? Infinity;
  if ((await usageToday(id, userId)) >= lim) throw new Error(`${id}: daily free-tier limit reached`);
}

/* ---------------- Nominatim (geocoding) ---------------- */
export async function geocode(place: string, userId = "owner"): Promise<{ lat: number; lng: number; display: string } | null> {
  const key = `geo:${place.toLowerCase()}`;
  const hit = await cacheGet<{ lat: number; lng: number; display: string }>(key);
  if (hit) return hit;
  const s = await getSettings(userId);
  if (s.mockMode || !s.providers.nominatim) return { lat: 13.0827, lng: 80.2707, display: `${place} (approx.)` };
  await guard("nominatim", userId);
  await throttle("nominatim", 1100);
  const r = await withRetry(() => fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(place)}`, {
    headers: { "user-agent": userAgent(s.userAgentContact) }, signal: AbortSignal.timeout(10000),
  }));
  await trackUsage("nominatim", 1, 0, userId);
  if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
  const j = (await r.json()) as { lat: string; lon: string; display_name: string }[];
  if (!j[0]) return null;
  const out = { lat: Number(j[0].lat), lng: Number(j[0].lon), display: j[0].display_name };
  await cacheSet("geo", key, out, 60 * 60 * 24 * 30);
  return out;
}

/* ---------------- OSM Overpass ---------------- */
export async function discoverOsm({ intent, limit, radiusKm, userId }: DiscoveryOptions): Promise<RawLead[]> {
  const s = await getSettings(userId);
  const where = [intent.area, intent.location].filter(Boolean).join(", ");
  const geo = await geocode(where, userId);
  if (!geo) return [];
  const rad = Math.round(radiusKm * 1000);
  const tagQ = intent.osmTags.length
    ? intent.osmTags.map((t) => `nwr["${t.key}"="${t.value}"]["name"](around:${rad},${geo.lat},${geo.lng});`).join("\n")
    : `nwr["name"~"${intent.keywords.map((k) => k.replace(/[^a-z0-9]/gi, "")).filter(Boolean).join("|") || "."}",i](around:${rad},${geo.lat},${geo.lng});`;
  const query = `[out:json][timeout:25];(\n${tagQ}\n);out center ${Math.min(limit * 2, 300)};`;
  const key = `osm:${hashString(query)}`;
  let data = await cacheGet<{ elements: OsmEl[] }>(key);
  if (!data) {
    await guard("osm", userId);
    await throttle("osm", 1000);
    const r = await withRetry(async () => {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST", body: "data=" + encodeURIComponent(query),
        headers: { "user-agent": userAgent(s.userAgentContact), "content-type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) throw new Error(`Overpass unavailable (HTTP ${res.status})`);
      return res;
    });
    await trackUsage("osm", 1, 0, userId);
    data = (await r.json()) as { elements: OsmEl[] };
    await cacheSet("osm", key, data, 60 * 60 * 24 * 7);
  }
  return data.elements.filter((e) => e.tags?.name).slice(0, limit).map((e) => {
    const t = e.tags!;
    const phones = [t.phone, t["contact:phone"], t.mobile, t["contact:mobile"]].filter(Boolean).flatMap((p) => p!.split(/[;,]/));
    return {
      name: t.name!,
      address: [t["addr:housenumber"], t["addr:street"], t["addr:suburb"], t["addr:city"], t["addr:postcode"]].filter(Boolean).join(", ") || null,
      area: t["addr:suburb"] ?? intent.area ?? null,
      city: t["addr:city"] ?? intent.location,
      pincode: t["addr:postcode"] ?? null,
      lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon,
      phones,
      emails: [t.email, t["contact:email"]].filter(Boolean) as string[],
      website: t.website ?? t["contact:website"] ?? null,
      category: intent.category,
      socials: Object.fromEntries(Object.entries({ facebook: t["contact:facebook"], instagram: t["contact:instagram"] }).filter(([, v]) => v)) as Record<string, string>,
      mapsUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      source: "osm", sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    } satisfies RawLead;
  });
}
interface OsmEl { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

/* ---------------- Google Places (OPTIONAL, billing required, off by default) ---------------- */
export async function discoverPlaces({ intent, limit, userId }: DiscoveryOptions): Promise<RawLead[]> {
  const s = await getSettings(userId);
  const key = await getApiKey("places", userId);
  if (!key || !s.providers.places) return [];
  if ((await usageToday("places", userId)) >= s.placesDailyBudget) throw new Error("Google Places daily budget reached (Settings → Providers)");
  const textQuery = `${intent.category} in ${[intent.area, intent.location].filter(Boolean).join(", ")}`;
  type P = { displayName?: { text: string }; formattedAddress?: string; nationalPhoneNumber?: string; internationalPhoneNumber?: string; websiteUri?: string; rating?: number; userRatingCount?: number; googleMapsUri?: string; location?: { latitude: number; longitude: number }; primaryTypeDisplayName?: { text: string } };
  const out: RawLead[] = [];
  let pageToken: string | undefined;
  // Up to 3 pages × 20 = 60 results per query (Google's max). Each page counts toward the daily budget.
  for (let page = 0; page < 3 && out.length < limit; page++) {
    if ((await usageToday("places", userId)) >= s.placesDailyBudget) break;
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json", "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.location,places.primaryTypeDisplayName,nextPageToken",
      },
      body: JSON.stringify({ textQuery, pageSize: 20, regionCode: "IN", languageCode: "en", ...(pageToken ? { pageToken } : {}) }),
      signal: AbortSignal.timeout(15000),
    });
    await trackUsage("places", 1, 0, userId);
    if (!r.ok) throw new Error(`Google Places HTTP ${r.status}: ${(await r.text()).slice(0, 150)}`);
    const j = (await r.json()) as { places?: P[]; nextPageToken?: string };
    for (const p of j.places ?? []) {
      out.push({
        name: p.displayName?.text ?? "Unknown", address: p.formattedAddress, city: intent.location, area: intent.area,
        pincode: p.formattedAddress?.match(/\b\d{6}\b/)?.[0] ?? null,
        phones: [p.internationalPhoneNumber ?? p.nationalPhoneNumber].filter(Boolean) as string[], website: p.websiteUri, rating: p.rating, reviewsCount: p.userRatingCount,
        mapsUrl: p.googleMapsUri, lat: p.location?.latitude, lng: p.location?.longitude, category: p.primaryTypeDisplayName?.text ?? intent.category,
        source: "places", sourceUrl: p.googleMapsUri,
      });
    }
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }
  return out.slice(0, limit);
}

/* ---------------- Mock discovery ---------------- */
export function discoverMock({ intent, limit }: DiscoveryOptions): RawLead[] {
  return mockCompanies(intent.category, intent.location || "Chennai", intent.area, Math.min(limit, 25), intent.keywords.join(" ")).map((c) => ({
    name: c.name, address: c.address, area: c.area, city: c.city, pincode: c.pincode, lat: c.lat, lng: c.lng,
    phones: [c.phone, c.phone2].filter(Boolean) as string[], emails: c.email ? [c.email] : [], website: c.website,
    category: c.category, rating: c.rating, reviewsCount: c.reviews, yearEst: c.yearEst, sizeEstimate: c.size,
    mapsUrl: `https://www.openstreetmap.org/search?query=${encodeURIComponent(c.name + " " + c.area)}`,
    source: "mock", sourceUrl: null,
  }));
}

/* ---------------- Web search (Brave / Google CSE / SearXNG) ---------------- */
export async function searchWeb(query: string, userId = "owner", count = 10): Promise<WebResult[]> {
  const s = await getSettings(userId);
  if (s.mockMode) return mockWebSearch(query);
  const key = `web:${hashString(query)}`;
  const hit = await cacheGet<WebResult[]>(key);
  if (hit) return hit;
  let results: WebResult[] | null = null;
  if (s.providers.searxng && s.searxngUrl) {
    try {
      const r = await fetch(`${s.searxngUrl.replace(/\/$/, "")}/search?format=json&q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(15000) });
      const j = (await r.json()) as { results: { title: string; url: string; content: string }[] };
      await trackUsage("searxng", 1, 0, userId);
      results = j.results.slice(0, count).map((x) => ({ title: x.title, url: x.url, snippet: x.content ?? "", source: "searxng" }));
    } catch { /* fall through */ }
  }
  const brave = s.providers.brave ? await getApiKey("brave", userId) : null;
  if (!results && brave) {
    await guard("brave", userId); await throttle("brave", 1100);
    const r = await fetch(`https://api.search.brave.com/res/v1/web/search?count=${count}&q=${encodeURIComponent(query)}`, {
      headers: { "X-Subscription-Token": brave, accept: "application/json" }, signal: AbortSignal.timeout(15000),
    });
    await trackUsage("brave", 1, 0, userId);
    if (r.ok) {
      const j = (await r.json()) as { web?: { results: { title: string; url: string; description: string }[] } };
      results = (j.web?.results ?? []).map((x) => ({ title: stripTags(x.title), url: x.url, snippet: stripTags(x.description), source: "brave" }));
    }
  }
  const cse = s.providers.cse ? await getApiKey("cse", userId) : null;
  if (!results && cse && s.cseCx) {
    await guard("cse", userId);
    const r = await fetch(`https://www.googleapis.com/customsearch/v1?key=${cse}&cx=${s.cseCx}&num=${Math.min(count, 10)}&q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(15000) });
    await trackUsage("cse", 1, 0, userId);
    if (r.ok) {
      const j = (await r.json()) as { items?: { title: string; link: string; snippet: string }[] };
      results = (j.items ?? []).map((x) => ({ title: x.title, url: x.link, snippet: x.snippet, source: "cse" }));
    }
  }
  if (!results) return [];
  await cacheSet("web", key, results, 60 * 60 * 24 * 7);
  return results;
}

export async function webSearchAvailable(userId = "owner") {
  const s = await getSettings(userId);
  if (s.mockMode) return true;
  return Boolean((s.providers.searxng && s.searxngUrl) || (s.providers.brave && (await getApiKey("brave", userId))) || (s.providers.cse && s.cseCx && (await getApiKey("cse", userId))));
}

function stripTags(s: string) { return s.replace(/<[^>]+>/g, ""); }

function mockWebSearch(query: string): WebResult[] {
  const company = query.match(/"([^"]+)"/)?.[1];
  if (/linkedin\.com\/in/.test(query) && company) {
    return mockPeople(company, null, 3 + (company.length % 3)).map((p) => ({
      title: `${p.name} - ${p.title} - ${company} | LinkedIn`, url: p.profileUrl, snippet: p.snippet, source: "mock",
    }));
  }
  if (company || query) {
    const c = company ?? query;
    const slug = c.toLowerCase().replace(/[^a-z]+/g, "");
    return [{ title: `${c} – Official website`, url: `https://www.${slug}.example.in`, snippet: `${c}, Chennai. Contact us for enquiries.`, source: "mock" }];
  }
  return [];
}
