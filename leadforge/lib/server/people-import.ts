import "server-only";
import Papa from "papaparse";
import { matchCompany, upsertPerson } from "./people";
import { upsertRawLead } from "./leads";

export interface CapturedPerson { name: string; headline?: string | null; company?: string | null; location?: string | null; profileUrl?: string | null; about?: string | null; activity?: string | null; email?: string | null; title?: string | null }

/** Save a person captured by the user (extension / paste / CSV). Creates the company as a lead if it doesn't exist. */
export async function savePerson(userId: string, p: CapturedPerson, source: string, opts: { leadId?: string | null; createCompany?: boolean } = {}) {
  let leadId = opts.leadId ?? null;
  const company = p.company ?? p.headline?.match(/(?: at | @ )(.+)$/i)?.[1]?.trim() ?? null;
  if (!leadId) {
    const m = await matchCompany(userId, company);
    leadId = m?.lead.id ?? null;
  }
  if (!leadId && company && opts.createCompany !== false) {
    leadId = (await upsertRawLead(userId, { name: company, city: p.location?.split(",")[0] ?? null, source })).id;
  }
  if (!leadId) return { ok: false as const, reason: "No company to attach to" };
  const id = await upsertPerson(userId, leadId, { fullName: p.name, title: p.title ?? null, headline: p.headline ?? null, location: p.location ?? null, profileUrl: p.profileUrl ?? null, about: p.about ?? null, activity: p.activity ?? null, source });
  return { ok: true as const, leadId, personId: id };
}

/** LinkedIn "Connections.csv" export, Sales Navigator / Recruiter exports, or any CSV with name + company. */
export async function importPeopleCsv(userId: string, text: string) {
  // LinkedIn exports start with a "Notes:" preamble before the header row.
  const start = text.search(/^(First Name|first name|Name|name|Full Name)/m);
  const csv = Papa.parse<Record<string, string>>(start > 0 ? text.slice(start) : text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  const g = (r: Record<string, string>, ...k: string[]) => k.map((x) => r[x]).find((v) => v && v.trim())?.trim() ?? null;
  let saved = 0, skipped = 0;
  for (const r of csv.data.slice(0, 5000)) {
    const name = g(r, "full name", "name") ?? [g(r, "first name"), g(r, "last name")].filter(Boolean).join(" ");
    const company = g(r, "company", "company name", "current company", "organization");
    if (!name || !company) { skipped++; continue; }
    const res = await savePerson(userId, { name, company, title: g(r, "position", "title", "job title", "current title"), profileUrl: g(r, "url", "profile url", "linkedin url", "person linkedin url"), location: g(r, "location", "geography") }, "csv-import");
    if (res.ok) saved++; else skipped++;
  }
  return { saved, skipped, total: csv.data.length };
}
