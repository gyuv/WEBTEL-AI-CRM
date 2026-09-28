import "server-only";
import * as cheerio from "cheerio";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { getSettings } from "./core";
import { politeFetch } from "../compliance/fetcher";
import { detectTech, auditHtml, type SiteAudit } from "../leadgen/techstack";
import { extractEmails, guessEmails, hasMx } from "../leadgen/emails";
import { extractPhones } from "../leadgen/phones";
import { addEmail, addPhone, addSource } from "./leads";
import { upsertPerson } from "./people";
import { rng, pick, mockPeople } from "../mock/data";
import { domainFromUrl } from "../utils";

type Progress = (pct: number, msg: string) => Promise<void>;

const PATHS = ["/", "/about", "/about-us", "/contact", "/contact-us", "/team", "/our-team", "/leadership", "/management", "/careers", "/blog"];
const PERSON_TITLE_RE = /(founder|co-founder|owner|proprietor|director|managing director|\bmd\b|ceo|cto|cfo|coo|chairman|partner|head|manager|principal|dr\.)/i;

export interface CrawlOutput {
  tech: string[]; audit: Partial<SiteAudit>; pages: { url: string; status: string; note?: string }[];
  emails: { email: string; url: string }[]; phones: { raw: string; url: string }[]; socials: Record<string, string>;
  people: { name: string; title: string; url: string; snippet: string }[]; text: string; hiringSignals: string[];
}

export function parsePage(html: string, url: string) {
  const $ = cheerio.load(html);
  $("script:not([type='application/ld+json']),style,noscript,svg").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const emails = extractEmails(html).map((email) => ({ email, url }));
  const phones = [...$("a[href^='tel:']").map((_, a) => $(a).attr("href")!.slice(4)).get(), ...extractPhones(text).map((p) => p.e164)].map((raw) => ({ raw, url }));
  const socials: Record<string, string> = {};
  $("a[href]").each((_, a) => {
    const h = $(a).attr("href")!;
    for (const k of ["facebook", "instagram", "linkedin", "twitter", "x.com", "youtube"]) if (h.includes(`${k}.`) && !socials[k]) socials[k.replace(".com", "")] = h;
    if (/wa\.me\/|api\.whatsapp\.com\/send/.test(h) && !socials.whatsapp) socials.whatsapp = h;
  });
  const people: CrawlOutput["people"] = [];
  // schema.org Person in JSON-LD
  $("script[type='application/ld+json']").each((_, s) => {
    try {
      const j = JSON.parse($(s).text());
      const arr = Array.isArray(j) ? j : j["@graph"] ?? [j];
      for (const n of arr) {
        const persons = n["@type"] === "Person" ? [n] : [n.founder, n.employee, n.member].flat().filter((x: { "@type"?: string }) => x?.["@type"] === "Person");
        for (const p of persons) if (p?.name) people.push({ name: String(p.name), title: String(p.jobTitle ?? "Team member"), url, snippet: "schema.org Person markup" });
      }
    } catch { /* ignore */ }
  });
  // Heuristic team cards: heading with a name followed by a short title line.
  $("h2,h3,h4,h5,strong,b").each((_, el) => {
    const name = $(el).text().trim();
    if (!/^([Dd]r\.?\s)?[A-Z][a-z]+(\s[A-Z][a-z.]*){1,3}$/.test(name)) return;
    const next = $(el).next().text().trim() || $(el).parent().text().replace(name, "").trim().slice(0, 80);
    if (PERSON_TITLE_RE.test(next) && next.length < 80) people.push({ name, title: next.split(/\n/)[0].trim(), url, snippet: `${name} — ${next.slice(0, 80)}` });
  });
  const hiringSignals: string[] = [];
  if (/careers|jobs|we'?re hiring|join our team|current openings/i.test(text)) {
    const roles = text.match(/(sales (executive|manager|representative)|business development|telecaller|marketing executive|developer|accountant|nurse|technician)/gi);
    if (roles) hiringSignals.push(`Hiring: ${[...new Set(roles.map((r) => r.toLowerCase()))].slice(0, 4).join(", ")}`);
  }
  return { text, emails, phones, socials, people, hiringSignals };
}

async function crawlSite(website: string, contact: string, progress: Progress): Promise<CrawlOutput> {
  const base = new URL(website);
  const out: CrawlOutput = { tech: [], audit: {}, pages: [], emails: [], phones: [], socials: {}, people: [], text: "", hiringSignals: [] };
  const urls = new Set(PATHS.map((p) => new URL(p, base.origin).toString()));
  const sm = await politeFetch(new URL("/sitemap.xml", base.origin).toString(), { contact });
  if (sm.ok && sm.html) {
    for (const m of sm.html.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (/(about|team|leadership|management|contact|career|press|news)/i.test(m[1]) && urls.size < 16) urls.add(m[1].trim());
    }
    out.pages.push({ url: sm.url, status: "ok", note: "sitemap" });
  }
  let i = 0;
  for (const url of urls) {
    i++;
    await progress(10 + Math.round((i / urls.size) * 50), `Crawling ${new URL(url).pathname}`);
    const r = await politeFetch(url, { contact, minDelayMs: 800 });
    if (!r.ok || !r.html) { out.pages.push({ url, status: "skipped", note: r.reason }); continue; }
    out.pages.push({ url: r.url, status: "ok" });
    if (url === new URL("/", base.origin).toString()) {
      out.tech = detectTech(r.html, r.headers);
      out.audit = auditHtml(r.html, r.url, r.ms);
    }
    else {
      // Features found on any page count (e.g. booking form on /contact).
      const a = auditHtml(r.html, r.url);
      for (const k of ["hasBookingOrForm", "hasChat", "hasWhatsappWidget", "hasEcommerce", "hasBlog", "hasCareers"] as const) if (a[k]) out.audit[k] = true;
      for (const t of detectTech(r.html)) if (!out.tech.includes(t)) out.tech.push(t);
    }
    const p = parsePage(r.html, r.url);
    out.emails.push(...p.emails); out.phones.push(...p.phones); out.people.push(...p.people); out.hiringSignals.push(...p.hiringSignals);
    Object.assign(out.socials, p.socials);
    if (out.text.length < 6000) out.text += " " + p.text.slice(0, 2000);
  }
  return out;
}

function mockCrawl(name: string, website: string | null): CrawlOutput {
  const r = rng(`crawl:${name}`);
  const techPool = ["WordPress", "Wix", "Google Analytics", "jQuery", "Bootstrap", "Razorpay", "WhatsApp widget", "Tawk.to chat", "Zoho SalesIQ/CRM", "Meta Pixel"];
  const tech = techPool.filter(() => r() > 0.65);
  const domain = domainFromUrl(website);
  const audit: Partial<SiteAudit> = {
    ssl: r() > 0.3, mobileViewport: r() > 0.35, metaDescription: r() > 0.5, h1: r() > 0.3, responseMs: Math.floor(400 + r() * 4200),
    copyrightYear: 2014 + Math.floor(r() * 12), hasBookingOrForm: r() > 0.55, hasChat: tech.includes("Tawk.to chat"),
    hasWhatsappWidget: tech.includes("WhatsApp widget"), hasEcommerce: tech.includes("Razorpay"), hasBlog: r() > 0.6, hasCareers: r() > 0.6,
  };
  const people = mockPeople(name, domain, 1 + Math.floor(r() * 2)).map((p) => ({ name: p.name, title: p.title, url: `${website}/about`, snippet: `${p.name}, ${p.title} (About page)` }));
  return {
    tech, audit,
    pages: ["/", "/about", "/contact", "/careers"].map((p) => ({ url: `${website}${p}`, status: "ok", note: "mock" })),
    emails: domain && r() > 0.3 ? [{ email: `${pick(r, ["info", "contact", "sales", "enquiry"])}@${domain}`, url: `${website}/contact` }] : [],
    phones: [], socials: r() > 0.5 ? { facebook: `https://facebook.com/${domain?.split(".")[1] ?? "page"}` } : {},
    people, text: `${name} is a trusted name in Chennai serving customers since ${2000 + Math.floor(r() * 20)}.`,
    hiringSignals: audit.hasCareers && r() > 0.4 ? [pick(r, ["Hiring: sales executive, telecaller", "Hiring: marketing executive", "Hiring: accountant", "Hiring: business development"])] : [],
  };
}

export async function enrichLead(userId: string, leadId: string, progress: Progress) {
  const db = await getDb();
  const settings = await getSettings(userId);
  const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.userId, userId)));
  if (!lead) throw new Error("Lead not found");
  await db.update(schema.leads).set({ enrichStatus: "running" }).where(eq(schema.leads.id, leadId));
  await progress(5, "Starting enrichment");

  if (!lead.website && !settings.mockMode) {
    const found = await findWebsite(userId, lead.name, lead.area ?? lead.city);
    if (found) {
      const { domainFromUrl: d } = await import("../utils");
      await db.update(schema.leads).set({ website: found.url, domain: d(found.url) }).where(eq(schema.leads.id, leadId)).catch(() => undefined);
      lead.website = found.url;
      await addSource(userId, "lead", leadId, "website", found.url, { sourceUrl: found.source, provider: "web-search", method: "inferred", confidence: 70 });
      await progress(8, `Found website ${found.url}`);
    }
  }
  let crawl: CrawlOutput | null = null;
  if (lead.website) {
    crawl = settings.mockMode || /\.example\.in/.test(lead.website)
      ? mockCrawl(lead.name, lead.website)
      : settings.providers.website ? await crawlSite(lead.website, settings.userAgentContact, progress) : null;
  }
  await progress(62, "Saving contacts");
  const src = settings.mockMode ? "mock" : "website";
  if (crawl) {
    for (const e of crawl.emails) {
      await addEmail(userId, leadId, e.email, { kind: "found", confidence: src === "mock" ? 60 : 95, sourceUrl: e.url });
      await addSource(userId, "lead", leadId, "email", e.email, { sourceUrl: e.url, provider: src, confidence: 95 });
    }
    for (const p of crawl.phones.slice(0, 6)) {
      const n = await addPhone(userId, leadId, p.raw, src);
      if (n) await addSource(userId, "lead", leadId, "phone", n.e164, { sourceUrl: p.url, provider: src });
    }
    const seen = new Set<string>();
    for (const p of crawl.people) {
      if (seen.has(p.name.toLowerCase())) continue;
      seen.add(p.name.toLowerCase());
      await upsertPerson(userId, leadId, { fullName: p.name, title: p.title, source: settings.mockMode ? "mock-site" : "company-site", sourceUrl: p.url, headline: p.snippet });
    }
    if ((lead.name === lead.domain || lead.name.includes(".")) && crawl.audit.title) {
      const nice = crawl.audit.title.split(/[|\-–]/)[0].trim();
      if (nice.length > 2) await db.update(schema.leads).set({ name: nice, normalizedName: nice.toLowerCase() }).where(eq(schema.leads.id, leadId));
    }
    const wa = crawl.socials.whatsapp?.match(/(\d{10,13})/)?.[1];
    await db.update(schema.leads).set({
      socials: { ...(lead.socials ?? {}), ...crawl.socials },
      whatsapp: lead.whatsapp ?? (wa ? `+${wa}` : null),
    }).where(eq(schema.leads.id, leadId));
    await db.insert(schema.leadEnrichment).values({
      leadId, userId, techStack: crawl.tech, audit: { ...crawl.audit, hiringSignals: crawl.hiringSignals, mock: settings.mockMode },
      pages: crawl.pages, textSample: crawl.text.slice(0, 6000),
    }).onConflictDoUpdate({
      target: schema.leadEnrichment.leadId,
      set: { techStack: crawl.tech, audit: { ...crawl.audit, hiringSignals: crawl.hiringSignals, mock: settings.mockMode }, pages: crawl.pages, textSample: crawl.text.slice(0, 6000), updatedAt: new Date() },
    });
    for (const t of crawl.tech) await addSource(userId, "lead", leadId, "tech", t, { sourceUrl: lead.website, provider: src, method: "inferred", confidence: 80 });
  } else {
    await db.insert(schema.leadEnrichment).values({ leadId, userId, techStack: [], audit: { noWebsite: true }, pages: [] })
      .onConflictDoUpdate({ target: schema.leadEnrichment.leadId, set: { audit: { noWebsite: true }, updatedAt: new Date() } });
  }

  await progress(75, "Guessing email patterns (labelled as guesses)");
  if (lead.domain) {
    const mx = settings.mockMode ? true : await hasMx(lead.domain);
    const existing = (await db.select().from(schema.leadEmails).where(eq(schema.leadEmails.leadId, leadId))).map((e) => e.email);
    if (mx !== false) {
      for (const g of guessEmails(null, lead.domain, existing).slice(0, 2)) {
        if (!existing.includes(g.email)) await addEmail(userId, leadId, g.email, { kind: "guessed", confidence: g.confidence, mxOk: mx });
      }
      const people = await db.select().from(schema.leadPeople).where(eq(schema.leadPeople.leadId, leadId));
      for (const p of people) {
        const g = guessEmails(p.fullName, lead.domain, existing)[0];
        if (g && !p.guessedEmail) await db.update(schema.leadPeople).set({ guessedEmail: g.email }).where(eq(schema.leadPeople.id, p.id));
      }
    }
  }
  await db.update(schema.leads).set({ enrichStatus: "done", lastEnrichedAt: new Date(), updatedAt: new Date() }).where(eq(schema.leads.id, leadId));
  await progress(80, "Enrichment complete");
  return { pages: crawl?.pages.length ?? 0, emails: crawl?.emails.length ?? 0, people: crawl?.people.length ?? 0 };
}

const NOT_OWN_SITE = /justdial|indiamart|sulekha|tradeindia|facebook|instagram|linkedin|youtube|wikipedia|practo|zomato|swiggy|google|quora|reddit|twitter|x\.com|yelp|magicbricks|99acres|naukri|indeed|glassdoor|asklaila|yellowpages|mouthshut|lybrate|zaubacorp|tofler|crunchbase|ambitionbox/i;

/** Finds a company's own website from free web-search results (never scrapes Google itself). */
async function findWebsite(userId: string, name: string, place: string | null) {
  const { searchWeb, webSearchAvailable } = await import("../providers");
  if (!(await webSearchAvailable(userId))) return null;
  const res = await searchWeb(`"${name}" ${place ?? ""} contact`, userId, 8).catch(() => []);
  const { nameSimilarity } = await import("../leadgen/dedupe");
  const tokens = name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 3);
  for (const r of res) {
    const d = domainFromUrl(r.url);
    if (!d || NOT_OWN_SITE.test(d)) continue;
    const looksRight = tokens.some((t) => d.includes(t)) || nameSimilarity(r.title.split(/[|\-–]/)[0], name) > 0.6;
    if (looksRight) return { url: `https://${d}`, source: r.url };
  }
  return null;
}
