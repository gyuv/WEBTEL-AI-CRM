import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { classifyTitle } from "../people/roles";
import { parseLinkedinSearchResult, xrayQueries } from "../people/deeplinks";
import { normalizePersonName, normalizeCompanyName } from "../utils";
import { nameSimilarity } from "../leadgen/dedupe";
import { guessEmails } from "../leadgen/emails";
import { searchWeb, webSearchAvailable } from "../providers";
import { addSource } from "./leads";

export interface PersonInput {
  fullName: string; title?: string | null; headline?: string | null; profileUrl?: string | null; location?: string | null;
  about?: string | null; activity?: string | null; source: string; sourceUrl?: string | null; notes?: string | null;
}

export async function upsertPerson(userId: string, leadId: string, p: PersonInput) {
  const db = await getDb();
  const norm = normalizePersonName(p.fullName);
  if (!norm || norm.length < 3) return null;
  const title = p.title ?? p.headline?.split(/ at | @ /i)[0] ?? null;
  const c = classifyTitle(title ?? p.headline);
  const [lead] = await db.select({ domain: schema.leads.domain }).from(schema.leads).where(eq(schema.leads.id, leadId));
  const guessed = lead?.domain ? guessEmails(p.fullName, lead.domain)[0]?.email : null;
  const existing = await db.select().from(schema.leadPeople).where(and(eq(schema.leadPeople.leadId, leadId), eq(schema.leadPeople.normalizedName, norm)));
  if (existing[0]) {
    const e = existing[0];
    await db.update(schema.leadPeople).set({
      title: e.title ?? title, headline: p.headline ?? e.headline, profileUrl: e.profileUrl ?? p.profileUrl, location: e.location ?? p.location,
      about: p.about ?? e.about, activity: p.activity ?? e.activity, roleGroup: c.roleGroup, seniority: c.seniority,
      dmScore: Math.max(e.dmScore, c.dmScore), updatedAt: new Date(),
    }).where(eq(schema.leadPeople.id, e.id));
    return e.id;
  }
  const [row] = await db.insert(schema.leadPeople).values({
    userId, leadId, fullName: p.fullName.trim(), normalizedName: norm, title, headline: p.headline, profileUrl: p.profileUrl, location: p.location,
    about: p.about, activity: p.activity, source: p.source, sourceUrl: p.sourceUrl ?? p.profileUrl, roleGroup: c.roleGroup, seniority: c.seniority,
    dmScore: c.dmScore, priority: c.dmScore, guessedEmail: guessed, notes: p.notes,
  }).onConflictDoNothing().returning({ id: schema.leadPeople.id });
  if (row) await addSource(userId, "person", row.id, "person", `${p.fullName} — ${title ?? ""}`, { sourceUrl: p.sourceUrl ?? p.profileUrl, provider: p.source, snippet: p.headline, confidence: p.source.startsWith("mock") ? 50 : 80 });
  return row?.id ?? null;
}

/** Channel A: public search API snippets only (never fetches linkedin.com). */
export async function discoverPeopleViaSearch(userId: string, leadId: string, progress?: (p: number, m: string) => Promise<void>) {
  const db = await getDb();
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
  if (!lead) return { found: 0, skipped: "lead not found" };
  if (!(await webSearchAvailable(userId))) return { found: 0, skipped: "No search API configured (Settings → Providers)" };
  let found = 0;
  const queries = xrayQueries(lead.name, lead.city).slice(0, 3);
  for (const [i, q] of queries.entries()) {
    await progress?.(82 + i * 4, `People search: ${q.slice(0, 50)}…`);
    let results;
    try { results = await searchWeb(q, userId, 10); } catch { continue; }
    for (const r of results) {
      const parsed = parseLinkedinSearchResult(r.title, r.snippet, r.url);
      if (!parsed) continue;
      const hay = `${parsed.headline ?? ""} ${r.snippet}`;
      const companyTok = normalizeCompanyName(lead.name);
      if (!normalizeCompanyName(hay).includes(companyTok) && nameSimilarity(hay, lead.name) < 0.5) continue;
      const id = await upsertPerson(userId, leadId, {
        fullName: parsed.name, headline: parsed.headline, title: parsed.headline?.split(/ - | at /)[0], profileUrl: parsed.profileUrl,
        location: parsed.location, source: r.source === "mock" ? "mock-search" : `search:${r.source}`, sourceUrl: parsed.profileUrl,
      });
      if (id) found++;
    }
  }
  return { found };
}

/** Auto-match a captured person to a company by fuzzy name/domain. */
export async function matchCompany(userId: string, companyName?: string | null, domain?: string | null) {
  const db = await getDb();
  const leads = await db.select({ id: schema.leads.id, name: schema.leads.name, domain: schema.leads.domain }).from(schema.leads).where(eq(schema.leads.userId, userId));
  if (domain) { const m = leads.find((l) => l.domain === domain); if (m) return { lead: m, score: 1 }; }
  if (!companyName) return null;
  let best: (typeof leads)[number] | null = null, s = 0;
  for (const l of leads) { const x = nameSimilarity(companyName, l.name); if (x > s) { s = x; best = l; } }
  return best && s >= 0.7 ? { lead: best, score: s } : null;
}

/** Parses pasted LinkedIn profile text (copied by the user from their own browser). */
export function parsePastedProfile(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const url = text.match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/in\/[^\s?#]+/i)?.[0] ?? null;
  const clean = lines.filter((l) => !/linkedin\.com|^(connect|message|follow|more|contact info|\d+(st|nd|rd|th)|·)$/i.test(l));
  const name = clean[0] ?? "";
  const headline = clean[1] ?? null;
  const location = clean.find((l) => /,\s*(india|tamil nadu)|chennai|bengaluru|coimbatore/i.test(l)) ?? null;
  const aboutIdx = lines.findIndex((l) => /^about$/i.test(l));
  const about = aboutIdx >= 0 ? lines.slice(aboutIdx + 1, aboutIdx + 4).join(" ") : null;
  const company = headline?.match(/(?: at | @ )(.+)$/i)?.[1]?.trim() ?? lines.find((l, i) => i > 1 && /(pvt|ltd|llp|limited|private|technologies|industries|exports|clinic|hospital)/i.test(l)) ?? null;
  return { name, headline, location, about, company, profileUrl: url };
}
