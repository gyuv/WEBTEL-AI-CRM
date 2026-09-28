import "server-only";
import { and, eq, inArray, desc } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import type { RawLead } from "../providers/types";
import { domainFromUrl, normalizeCompanyName, toUrl } from "../utils";
import { normalizePhone } from "../leadgen/phones";
import { extractEmails } from "../leadgen/emails";
import { findDuplicate } from "../leadgen/dedupe";
import type { LeadStatus } from "../db/schema";
import { audit, notify } from "./core";

export async function addSource(
  userId: string, entityType: string, entityId: string, field: string, value: string | null | undefined,
  o: { sourceUrl?: string | null; snippet?: string | null; method?: "found" | "guessed" | "inferred" | "user"; confidence?: number; provider?: string } = {},
) {
  if (value === undefined || value === null || value === "") return;
  const db = await getDb();
  await db.insert(schema.sourceRecords).values({
    userId, entityType, entityId, field, value: String(value).slice(0, 2000), sourceUrl: o.sourceUrl ?? null,
    snippet: o.snippet?.slice(0, 500) ?? null, method: o.method ?? "found", confidence: o.confidence ?? 80, provider: o.provider,
  });
}

export async function addPhone(userId: string, leadId: string, raw: string, source: string, personId?: string) {
  const n = normalizePhone(raw);
  if (!n) return null;
  const db = await getDb();
  await db.insert(schema.leadPhones).values({ userId, leadId, e164: n.e164, kind: n.kind, source, personId }).onConflictDoNothing();
  return n;
}

export async function addEmail(userId: string, leadId: string, email: string, o: { kind: "found" | "guessed"; confidence: number; sourceUrl?: string | null; mxOk?: boolean | null; personId?: string }) {
  const db = await getDb();
  await db.insert(schema.leadEmails).values({
    userId, leadId, email: email.toLowerCase(), kind: o.kind, confidence: o.confidence, sourceUrl: o.sourceUrl, mxOk: o.mxOk ?? null, personId: o.personId,
  }).onConflictDoNothing();
}

/** Insert or merge a discovered lead. Dedupe by domain → phone → fuzzy name (same city). */
export async function upsertRawLead(userId: string, raw: RawLead, searchId?: string | null) {
  const db = await getDb();
  const domain = domainFromUrl(raw.website);
  const phones = (raw.phones ?? []).map((p) => normalizePhone(p)?.e164).filter(Boolean) as string[];
  const norm = normalizeCompanyName(raw.name);
  const candidates = await db.select({ id: schema.leads.id, name: schema.leads.name, domain: schema.leads.domain, city: schema.leads.city })
    .from(schema.leads).where(eq(schema.leads.userId, userId));
  const phoneRows = phones.length
    ? await db.select({ leadId: schema.leadPhones.leadId, e164: schema.leadPhones.e164 }).from(schema.leadPhones)
      .where(and(eq(schema.leadPhones.userId, userId), inArray(schema.leadPhones.e164, phones)))
    : [];
  const dup = findDuplicate(
    { name: raw.name, domain, phones, city: raw.city },
    candidates.map((c) => ({ ...c, phones: phoneRows.filter((p) => p.leadId === c.id).map((p) => p.e164) })),
  );
  let leadId: string;
  let created = false;
  if (dup) {
    leadId = dup.match.id;
    const [cur] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
    await db.update(schema.leads).set({
      website: cur.website ?? toUrl(raw.website), domain: cur.domain ?? domain, address: cur.address ?? raw.address,
      area: cur.area ?? raw.area, pincode: cur.pincode ?? raw.pincode, rating: cur.rating ?? raw.rating,
      reviewsCount: cur.reviewsCount ?? raw.reviewsCount, mapsUrl: cur.mapsUrl ?? raw.mapsUrl, updatedAt: new Date(),
    }).where(eq(schema.leads.id, leadId));
  } else {
    const [row] = await db.insert(schema.leads).values({
      userId, name: raw.name.trim(), normalizedName: norm, domain, website: toUrl(raw.website), address: raw.address,
      area: raw.area, city: raw.city, pincode: raw.pincode, lat: raw.lat, lng: raw.lng, category: raw.category,
      rating: raw.rating, reviewsCount: raw.reviewsCount, mapsUrl: raw.mapsUrl, socials: raw.socials ?? {},
      yearEst: raw.yearEst, sizeEstimate: raw.sizeEstimate, primarySource: raw.source, searchId: searchId ?? null,
    }).onConflictDoNothing().returning({ id: schema.leads.id });
    if (!row) {
      const [ex] = await db.select({ id: schema.leads.id }).from(schema.leads).where(and(eq(schema.leads.userId, userId), eq(schema.leads.domain, domain!)));
      leadId = ex.id;
    } else {
      leadId = row.id;
      created = true;
      await db.insert(schema.statusHistory).values({ userId, leadId, toStatus: "new", reason: `Discovered via ${raw.source}`, actor: "system" });
    }
  }
  const src = { sourceUrl: raw.sourceUrl, provider: raw.source, method: "found" as const, confidence: raw.source === "mock" ? 50 : 85 };
  if (created) {
    for (const f of ["name", "address", "website", "category", "rating", "pincode"] as const) {
      const v = f === "rating" ? raw.rating?.toString() : (raw as unknown as Record<string, string | null | undefined>)[f];
      await addSource(userId, "lead", leadId, f, v, src);
    }
  }
  for (const p of raw.phones ?? []) {
    const n = await addPhone(userId, leadId, p, raw.source);
    if (n && created) await addSource(userId, "lead", leadId, "phone", n.e164, src);
  }
  for (const e of (raw.emails ?? []).flatMap((x) => extractEmails(x))) {
    await addEmail(userId, leadId, e, { kind: "found", confidence: raw.source === "mock" ? 60 : 90, sourceUrl: raw.sourceUrl });
  }
  return { id: leadId, created, dupReason: dup?.reason ?? null };
}

export async function setStatus(userId: string, leadId: string, to: LeadStatus, reason: string, actor = "user") {
  const db = await getDb();
  const [cur] = await db.select({ status: schema.leads.status, name: schema.leads.name }).from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.userId, userId)));
  if (!cur || cur.status === to) return false;
  await db.update(schema.leads).set({ status: to, updatedAt: new Date() }).where(eq(schema.leads.id, leadId));
  await db.insert(schema.statusHistory).values({ userId, leadId, fromStatus: cur.status, toStatus: to, reason, actor });
  await audit("status_change", "lead", leadId, { from: cur.status, to, reason, actor }, userId);
  const rank = ["new", "researched", "contacted", "replied", "interested", "meeting_booked", "proposal", "won"];
  if (rank.indexOf(to) > rank.indexOf(cur.status) && rank.indexOf(to) >= 3) {
    await notify(`Status improved: ${cur.name}`, `${cur.status} → ${to}. ${reason}`, leadId, "status", userId);
  }
  return true;
}

export async function isSuppressed(userId: string, kind: "email" | "phone" | "domain", value: string) {
  const db = await getDb();
  const [r] = await db.select().from(schema.suppressionList)
    .where(and(eq(schema.suppressionList.userId, userId), eq(schema.suppressionList.kind, kind), eq(schema.suppressionList.value, value.toLowerCase())));
  return Boolean(r);
}

export async function suppress(userId: string, kind: "email" | "phone" | "domain", value: string, reason: string) {
  const db = await getDb();
  await db.insert(schema.suppressionList).values({ userId, kind, value: value.toLowerCase(), reason }).onConflictDoNothing();
}

export async function getLeadBundle(userId: string, leadId: string) {
  const db = await getDb();
  const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.userId, userId)));
  if (!lead) return null;
  const [phones, emails, people, enrichment, insights, sources, calls, outreach, msgs, notes, history, tasks] = await Promise.all([
    db.select().from(schema.leadPhones).where(eq(schema.leadPhones.leadId, leadId)),
    db.select().from(schema.leadEmails).where(eq(schema.leadEmails.leadId, leadId)).orderBy(desc(schema.leadEmails.confidence)),
    db.select().from(schema.leadPeople).where(eq(schema.leadPeople.leadId, leadId)).orderBy(desc(schema.leadPeople.dmScore)),
    db.select().from(schema.leadEnrichment).where(eq(schema.leadEnrichment.leadId, leadId)),
    db.select().from(schema.leadInsights).where(eq(schema.leadInsights.leadId, leadId)),
    db.select().from(schema.sourceRecords).where(and(eq(schema.sourceRecords.entityType, "lead"), eq(schema.sourceRecords.entityId, leadId))),
    db.select().from(schema.callLogs).where(eq(schema.callLogs.leadId, leadId)).orderBy(desc(schema.callLogs.startedAt)),
    db.select().from(schema.outreachLog).where(eq(schema.outreachLog.leadId, leadId)).orderBy(desc(schema.outreachLog.sentAt)),
    db.select().from(schema.messages).where(eq(schema.messages.leadId, leadId)).orderBy(desc(schema.messages.receivedAt)),
    db.select().from(schema.notes).where(eq(schema.notes.leadId, leadId)).orderBy(desc(schema.notes.createdAt)),
    db.select().from(schema.statusHistory).where(eq(schema.statusHistory.leadId, leadId)).orderBy(desc(schema.statusHistory.createdAt)),
    db.select().from(schema.tasks).where(eq(schema.tasks.leadId, leadId)).orderBy(schema.tasks.dueAt),
  ]);
  return { lead, phones, emails, people, enrichment: enrichment[0] ?? null, insights: Object.fromEntries(insights.map((i) => [i.kind, i])), sources, calls, outreach, msgs, notes, history, tasks };
}
export type LeadBundle = NonNullable<Awaited<ReturnType<typeof getLeadBundle>>>;
