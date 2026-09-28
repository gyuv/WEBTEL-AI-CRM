import * as cheerio from "cheerio";
import type { RawLead } from "../providers/types";
import { extractPhones } from "../leadgen/phones";
import { extractEmails } from "../leadgen/emails";
import { domainFromUrl } from "../utils";

/* ---------------- Generic list / directory page scraper ---------------- */

const NAME_SEL = "h1,h2,h3,h4,h5,strong,b,a,.name,.title,[itemprop=name]";

/** Extracts business entries from any HTML list page. Exported for tests. */
export function extractListings(html: string, pageUrl: string): RawLead[] {
  const $ = cheerio.load(html);
  $("script:not([type='application/ld+json']),style,noscript,svg,nav,header,footer").remove();
  const out: RawLead[] = [];
  // 1) structured data
  $("script[type='application/ld+json']").each((_, s) => {
    try {
      const j = JSON.parse($(s).text());
      const nodes = [j, ...(Array.isArray(j) ? j : []), ...(j["@graph"] ?? []), ...((j.itemListElement ?? []).map((x: { item?: unknown }) => x.item ?? x))].flat();
      for (const n of nodes) {
        if (!n || typeof n !== "object" || !n.name) continue;
        const t = String(n["@type"] ?? "");
        if (!/Business|Organization|Store|Restaurant|Clinic|Dentist|Hotel|Service|Place/i.test(t)) continue;
        const addr = typeof n.address === "string" ? n.address : [n.address?.streetAddress, n.address?.addressLocality, n.address?.postalCode].filter(Boolean).join(", ");
        out.push({ name: String(n.name), phones: n.telephone ? [String(n.telephone)] : [], emails: n.email ? [String(n.email).replace(/^mailto:/, "")] : [], website: n.url ?? null, address: addr || null, pincode: n.address?.postalCode ?? null, rating: n.aggregateRating?.ratingValue ? Number(n.aggregateRating.ratingValue) : null, source: "scrape", sourceUrl: pageUrl });
      }
    } catch { /* ignore */ }
  });
  // 2) repeated blocks that contain a phone number
  const candidates = $("li, tr, article, .card, .listing, .item, .result, .member, .company, div").toArray().filter((el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    return t.length > 10 && t.length < 700 && (extractPhones(t).length > 0 || $(el).find("a[href^='tel:']").length > 0);
  });
  // keep innermost blocks only
  const inner = candidates.filter((el) => !candidates.some((o) => o !== el && $(el).find(o).length > 0));
  for (const el of inner) {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, " ").trim();
    const nameEl = $el.find(NAME_SEL).toArray().map((n) => $(n).text().replace(/\s+/g, " ").trim()).find((t) => t.length > 2 && t.length < 90 && !/^\+?[\d\s-]{6,}$/.test(t) && !/call|phone|mobile|email|website|view|more|details/i.test(t));
    const name = nameEl ?? text.split(/[|,\n•·-]/)[0].trim().slice(0, 80);
    if (!name || name.length < 3) continue;
    const tel = $el.find("a[href^='tel:']").map((_, a) => $(a).attr("href")!.slice(4)).get();
    const phones = [...new Set([...tel, ...extractPhones(text).map((p) => p.e164)])];
    const site = $el.find("a[href^='http']").map((_, a) => $(a).attr("href")!).get().find((h) => { const d = domainFromUrl(h); return d && d !== domainFromUrl(pageUrl) && !/facebook|instagram|twitter|linkedin|youtube|google|wa\.me|whatsapp/.test(d); }) ?? null;
    const pin = text.match(/(?<!\d)[1-8]\d{5}(?!\d)/)?.[0] ?? null;
    const addrMatch = text.match(/(?:No\.?|#|Door)?\s*[\w/-]*,?[^|]{0,120}(?<!\d)[1-8]\d{5}(?!\d)/)?.[0]?.trim() ?? null;
    out.push({ name, phones, emails: extractEmails($el.html() ?? ""), website: site, address: addrMatch, pincode: pin, source: "scrape", sourceUrl: pageUrl });
  }
  // dedupe by name+phone within page
  const seen = new Set<string>();
  return out.filter((l) => { const k = `${l.name.toLowerCase()}|${l.phones?.[0] ?? ""}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export function findNextPage(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const rel = $("a[rel=next], link[rel=next]").attr("href");
  const txt = $("a").toArray().find((a) => /^(next|next page|›|»|>|older)$/i.test($(a).text().trim()) || /next/i.test($(a).attr("aria-label") ?? ""));
  const href = rel ?? (txt ? $(txt).attr("href") : undefined);
  if (!href || href.startsWith("#") || href.startsWith("javascript")) return null;
  try {
    const u = new URL(href, pageUrl);
    return u.host === new URL(pageUrl).host ? u.toString() : null;
  } catch { return null; }
}

/** Bulk paste: any messy text (WhatsApp forwards, PDF copy, directory text). One lead per line/block with a phone. */
export function parseBulkText(text: string, category?: string | null, city?: string | null): RawLead[] {
  const blocks = text.split(/\n\s*\n|\r?\n(?=\S)/).map((b) => b.trim()).filter(Boolean);
  const out: RawLead[] = [];
  for (const b of blocks) {
    const phones = extractPhones(b).map((p) => p.e164);
    if (!phones.length) continue;
    const name = b.replace(/(?:\+91[\s-]?)?(?:\d[\s-]?){10,12}/g, "").replace(/[-:|,•]+\s*$/g, "").split(/\n|[|•]/)[0].replace(/(phone|mobile|mob|ph|tel|contact)\s*[:.-]?/gi, "").trim().slice(0, 80) || `Lead ${phones[0]}`;
    out.push({ name, phones, emails: extractEmails(b), pincode: b.match(/(?<!\d)[1-8]\d{5}(?!\d)/)?.[0] ?? null, category: category ?? null, city: city ?? null, source: "paste" });
  }
  return out;
}

