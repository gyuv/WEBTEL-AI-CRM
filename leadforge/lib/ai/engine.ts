import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { generate } from "../llm";
import { getProfile } from "../server/core";
import { AnalysisSchema, AssetsSchema, PersonAiSchema, type Analysis, type Assets, type Evidence } from "./schemas";
import { ruleAnalysis, ruleAssets, type LeadCtx, type ProductCtx, type ProfileCtx } from "./rules";
import { scoreLead } from "../leadgen/scoring";
import { industryMatch } from "./pains";
import { firstName } from "../utils";

export async function buildContext(userId: string, leadId: string): Promise<LeadCtx | null> {
  const db = await getDb();
  const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.userId, userId)));
  if (!lead) return null;
  const [enr] = await db.select().from(schema.leadEnrichment).where(eq(schema.leadEnrichment.leadId, leadId));
  const people = await db.select().from(schema.leadPeople).where(eq(schema.leadPeople.leadId, leadId));
  const sources = await db.select().from(schema.sourceRecords).where(and(eq(schema.sourceRecords.entityType, "lead"), eq(schema.sourceRecords.entityId, leadId)));
  const evidence: Evidence[] = [];
  const at = (d?: Date | null) => d?.toISOString() ?? null;
  const listing = sources.find((s) => s.field === "name");
  evidence.push({ id: "listing-1", fact: `Listed as "${lead.name}", category ${lead.category ?? "unknown"}, ${lead.address ?? lead.city ?? ""}${lead.website ? "" : "; no website in listing"}`, sourceUrl: listing?.sourceUrl ?? lead.mapsUrl, provider: lead.primarySource ?? "import", collectedAt: at(lead.createdAt) });
  if (lead.rating !== null) evidence.push({ id: "rating-1", fact: `Rating ${lead.rating} from ${lead.reviewsCount ?? "?"} reviews`, sourceUrl: lead.mapsUrl, provider: lead.primarySource ?? "listing", collectedAt: at(lead.createdAt) });
  if (enr && lead.website && !(enr.audit as Record<string, unknown>).noWebsite) {
    const a = enr.audit as Record<string, unknown>;
    evidence.push({ id: "site-1", fact: `Website audit: ${lead.website.startsWith("https") ? "HTTPS" : "HTTP only"}, mobile viewport ${a.mobileViewport ? "yes" : "no"}, response ${a.responseMs ?? "?"}ms, copyright ${a.copyrightYear ?? "?"}, booking/enquiry form ${a.hasBookingOrForm ? "yes" : "no"}, chat ${a.hasChat ? "yes" : "no"}, meta description ${a.metaDescription ? "yes" : "no"}`, sourceUrl: lead.website, provider: a.mock ? "mock" : "website", collectedAt: at(enr.updatedAt) });
    if (enr.techStack.length) evidence.push({ id: "tech-1", fact: `Technologies detected: ${enr.techStack.join(", ")}`, sourceUrl: lead.website, provider: a.mock ? "mock" : "website", collectedAt: at(enr.updatedAt) });
    else evidence.push({ id: "tech-1", fact: "No known marketing/CRM/analytics technologies detected on the website", sourceUrl: lead.website, provider: a.mock ? "mock" : "website", collectedAt: at(enr.updatedAt) });
    ((a.hiringSignals as string[]) ?? []).forEach((h, i) => evidence.push({ id: `hiring-${i + 1}`, fact: h, sourceUrl: `${lead.website}/careers`, provider: a.mock ? "mock" : "website", collectedAt: at(enr.updatedAt) }));
    if (enr.textSample) evidence.push({ id: "site-text", fact: `Website text excerpt: ${enr.textSample.slice(0, 600)}`, sourceUrl: lead.website, provider: a.mock ? "mock" : "website", collectedAt: at(enr.updatedAt) });
  }
  people.forEach((p, i) => evidence.push({ id: `person-${i + 1}`, fact: `${p.fullName} — ${p.title ?? p.headline ?? "role unknown"} (source: ${p.source})`, sourceUrl: p.sourceUrl ?? p.profileUrl, provider: p.source, collectedAt: at(p.createdAt) }));
  return {
    lead: { id: lead.id, name: lead.name, category: lead.category, city: lead.city, area: lead.area, website: lead.website, rating: lead.rating, reviewsCount: lead.reviewsCount, yearEst: lead.yearEst, sizeEstimate: lead.sizeEstimate, socials: lead.socials ?? {}, whatsapp: lead.whatsapp },
    tech: enr?.techStack ?? [], audit: (enr?.audit as Record<string, unknown>) ?? null,
    people: people.map((p) => ({ id: p.id, fullName: p.fullName, title: p.title, roleGroup: p.roleGroup, dmScore: p.dmScore, headline: p.headline })),
    evidence,
  };
}

export async function loadProducts(userId: string): Promise<ProductCtx[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.products).where(and(eq(schema.products.userId, userId), eq(schema.products.active, true)));
  return rows.map((p) => ({ id: p.id, name: p.name, category: p.category, shortDesc: p.shortDesc, targetIndustries: p.targetIndustries, problemsSolved: p.problemsSolved, benefits: p.benefits, usps: p.usps, pricing: p.pricing, objections: p.objections, caseStudies: p.caseStudies }));
}

async function loadMe(userId: string): Promise<ProfileCtx> {
  const p = await getProfile(userId);
  return { displayName: p.displayName ?? "", companyName: p.companyName ?? "", signature: p.signature ?? "", meetingLink: p.meetingLink ?? "", phone: p.phone ?? "" };
}

function catalogText(products: ProductCtx[]) {
  return products.map((p) => `- id=${p.id} | ${p.name} | ${p.category ?? ""} | ${p.shortDesc ?? ""} | industries: ${p.targetIndustries.join(", ")} | solves: ${p.problemsSolved.join(", ")} | benefits: ${p.benefits.join("; ")} | pricing: ${p.pricing ?? "n/a"} | objections: ${p.objections.map((o) => `${o.objection} => ${o.rebuttal}`).join(" / ")}`).join("\n");
}

/** Remove anything the LLM said that isn't backed by a real evidence id or a real product. */
function sanitize(a: Analysis, ctx: LeadCtx, products: ProductCtx[]): Analysis {
  const ids = new Set(ctx.evidence.map((e) => e.id));
  const pids = new Set(products.map((p) => p.id));
  const peopleIds = new Set(ctx.people.map((p) => p.id));
  return {
    ...a,
    pains: a.pains.map((p) => ({ ...p, evidenceIds: p.evidenceIds.filter((i) => ids.has(i)) })).filter((p) => p.evidenceIds.length),
    signals: a.signals.map((s) => ({ ...s, evidenceIds: s.evidenceIds.filter((i) => ids.has(i)) })).filter((s) => s.evidenceIds.length),
    matches: a.matches.filter((m) => pids.has(m.productId)).map((m) => ({ ...m, targetPersonId: m.targetPersonId && peopleIds.has(m.targetPersonId) ? m.targetPersonId : null })).slice(0, 3),
  };
}

export async function analyzeLead(userId: string, leadId: string, opts: { force?: boolean } = {}) {
  const ctx = await buildContext(userId, leadId);
  if (!ctx) throw new Error("Lead not found");
  const products = await loadProducts(userId);
  const fallback = ruleAnalysis(ctx, products);
  const res = await generate({
    task: "analyze", userId, noCache: opts.force,
    system: "Identify pain points and buying signals ONLY from the evidence list; cite evidence ids. Rank up to 3 products ONLY from the catalog by fit.",
    prompt: `LEAD EVIDENCE (id: fact [source]):\n${ctx.evidence.map((e) => `${e.id}: ${e.fact} [${e.sourceUrl ?? e.provider}]`).join("\n")}\n\nPEOPLE (id, name, title): ${ctx.people.map((p) => `${p.id}, ${p.fullName}, ${p.title}`).join(" | ") || "none"}\n\nMY PRODUCT CATALOG:\n${catalogText(products) || "(empty)"}\n\nRULE-BASED DRAFT (improve wording, keep only supported claims):\n${JSON.stringify(fallback)}\n\nReturn JSON with keys: summary, industry, sizeEstimate, digitalMaturity (0-100), dataQuality (good|thin|insufficient), pains[{key,title,detail,confidence,evidenceIds}], signals[{title,confidence,evidenceIds}], matches[{productId,productName,fitPct,reasoning,targetRole,targetPersonId,objections[{objection,rebuttal}],openingLine}], whyNow.`,
    schema: AnalysisSchema, fallback: () => fallback,
  });
  const analysis = res.model.startsWith("mock") || res.model === "rules" ? res.data : sanitize(res.data, ctx, products);
  if (!analysis.pains.length && fallback.pains.length) analysis.pains = fallback.pains;
  if (!analysis.matches.length) analysis.matches = fallback.matches;
  const db = await getDb();
  const payload = { ...analysis, evidence: ctx.evidence, warnings: res.warnings };
  await db.insert(schema.leadInsights).values({ userId, leadId, kind: "analysis", payload, model: res.model })
    .onConflictDoUpdate({ target: [schema.leadInsights.leadId, schema.leadInsights.kind], set: { payload, model: res.model, createdAt: new Date() } });
  await rescore(userId, leadId, analysis, ctx);
  return { analysis, model: res.model, warnings: res.warnings };
}

export async function rescore(userId: string, leadId: string, analysis?: Analysis, ctx?: LeadCtx | null) {
  const db = await getDb();
  ctx ??= await buildContext(userId, leadId);
  if (!ctx) return;
  if (!analysis) {
    const [ins] = await db.select().from(schema.leadInsights).where(and(eq(schema.leadInsights.leadId, leadId), eq(schema.leadInsights.kind, "analysis")));
    analysis = ins ? (ins.payload as unknown as Analysis) : undefined;
  }
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
  const phones = await db.select().from(schema.leadPhones).where(eq(schema.leadPhones.leadId, leadId));
  const emails = await db.select().from(schema.leadEmails).where(eq(schema.leadEmails.leadId, leadId));
  const products = await loadProducts(userId);
  const s = scoreLead({
    hasWebsite: Boolean(lead.website), phones, emails, people: ctx.people,
    painCount: analysis?.pains.length ?? 0, productMatchTop: analysis?.matches[0]?.fitPct, signals: analysis?.signals.map((x) => x.title) ?? [],
    rating: lead.rating, reviewsCount: lead.reviewsCount, categoryMatchesIcp: products.some((p) => industryMatch(p.targetIndustries, lead.category)),
    digitalMaturity: analysis?.digitalMaturity ?? 50, doNotCall: lead.doNotCall,
  });
  await db.update(schema.leads).set({ score: s.score, fitScore: s.fit, intentScore: s.intent, reachScore: s.reach, updatedAt: new Date() }).where(eq(schema.leads.id, leadId));
  await db.insert(schema.leadInsights).values({ userId, leadId, kind: "score", payload: s as unknown as Record<string, unknown>, model: "rules" })
    .onConflictDoUpdate({ target: [schema.leadInsights.leadId, schema.leadInsights.kind], set: { payload: s as unknown as Record<string, unknown>, createdAt: new Date() } });
  if (lead.status === "new" && analysis) {
    const { setStatus } = await import("../server/leads");
    await setStatus(userId, leadId, "researched", "AI analysis completed", "system");
  }
  return s;
}

export async function generateAssets(userId: string, leadId: string, opts: { productId?: string | null; personId?: string | null; force?: boolean } = {}) {
  const db = await getDb();
  const ctx = await buildContext(userId, leadId);
  if (!ctx) throw new Error("Lead not found");
  let [ins] = await db.select().from(schema.leadInsights).where(and(eq(schema.leadInsights.leadId, leadId), eq(schema.leadInsights.kind, "analysis")));
  if (!ins) { await analyzeLead(userId, leadId); [ins] = await db.select().from(schema.leadInsights).where(and(eq(schema.leadInsights.leadId, leadId), eq(schema.leadInsights.kind, "analysis"))); }
  const analysis = ins.payload as unknown as Analysis;
  const products = await loadProducts(userId);
  const productId = opts.productId ?? analysis.matches[0]?.productId ?? null;
  const product = products.find((p) => p.id === productId) ?? null;
  const personId = opts.personId ?? analysis.matches.find((m) => m.productId === productId)?.targetPersonId ?? [...ctx.people].sort((a, b) => b.dmScore - a.dmScore)[0]?.id ?? null;
  const me = await loadMe(userId);
  const fallback = ruleAssets(ctx, analysis, product, personId, me);
  const res = await generate({
    task: "assets", userId, noCache: opts.force,
    system: "Write concise, respectful outreach for Indian SMB owners. Use only facts from the analysis. Tamil scripts in Tamil script; Tanglish in Latin script. Every email must end with an opt-out line. LinkedIn note under 300 characters.",
    prompt: `ANALYSIS:\n${JSON.stringify({ summary: analysis.summary, pains: analysis.pains, signals: analysis.signals, whyNow: analysis.whyNow })}\n\nPRODUCT:\n${product ? catalogText([product]) : "none selected"}\n\nTARGET PERSON: ${ctx.people.find((p) => p.id === personId)?.fullName ?? "unknown (use generic greeting)"}\nSENDER: ${JSON.stringify(me)}\n\nDRAFT TO IMPROVE (keep the same JSON shape and keys):\n${JSON.stringify(fallback)}`,
    schema: AssetsSchema, fallback: () => fallback,
  });
  const assets: Assets = { ...res.data, productId, personId };
  await db.insert(schema.leadInsights).values({ userId, leadId, kind: "assets", payload: assets as unknown as Record<string, unknown>, model: res.model })
    .onConflictDoUpdate({ target: [schema.leadInsights.leadId, schema.leadInsights.kind], set: { payload: assets as unknown as Record<string, unknown>, model: res.model, createdAt: new Date() } });
  return { assets, model: res.model, warnings: res.warnings };
}

export async function personAi(userId: string, personId: string) {
  const db = await getDb();
  const [p] = await db.select().from(schema.leadPeople).where(and(eq(schema.leadPeople.id, personId), eq(schema.leadPeople.userId, userId)));
  if (!p) throw new Error("Person not found");
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, p.leadId));
  const me = await loadMe(userId);
  const fn = firstName(p.fullName);
  const fallback = {
    icebreaker: p.activity
      ? `Saw your recent post about ${p.activity.slice(0, 60)} — really relevant.`
      : p.about ? `Your note on "${p.about.slice(0, 60)}" stood out.` : p.headline ? `Noticed you lead ${p.headline.replace(/^.* at /i, "")} — curious how you're handling growth this year.` : "insufficient data for a personal icebreaker — use the company pain point instead.",
    connectionNote: `Hi ${fn}, ${me.companyName ? `I'm with ${me.companyName} and ` : ""}I work with ${lead.category ?? "businesses"} in ${lead.city ?? "Chennai"}. Would be glad to connect and exchange ideas.`.slice(0, 295),
  };
  const res = await generate({
    task: "person", userId, schema: PersonAiSchema, fallback: () => fallback,
    prompt: `Person public info: name=${p.fullName}; headline=${p.headline ?? ""}; about=${p.about ?? ""}; recent activity=${p.activity ?? ""}; company=${lead.name}. Write an icebreaker using ONLY this info (or say insufficient data) and a LinkedIn connection note under 300 characters. Sender: ${me.displayName} from ${me.companyName}. JSON keys: icebreaker, connectionNote.`,
  });
  await db.update(schema.leadPeople).set({ icebreaker: res.data.icebreaker, connectionNote: res.data.connectionNote.slice(0, 300), updatedAt: new Date() }).where(eq(schema.leadPeople.id, personId));
  return res.data;
}
