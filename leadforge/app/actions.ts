"use server";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { ctx, getSettings, saveSettings, setApiKey, audit } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { enqueue, runJobs } from "@/lib/server/jobs";
import { setStatus, suppress, addEmail, addPhone } from "@/lib/server/leads";
import { analyzeLead, generateAssets, personAi } from "@/lib/ai/engine";
import { ingestReply, createGmailDraft } from "@/lib/server/inbox";
import { upsertPerson, parsePastedProfile, matchCompany } from "@/lib/server/people";
import { generate } from "@/lib/llm";
import { NotesSummarySchema, ProductAutofillSchema } from "@/lib/ai/schemas";
import { LEAD_STATUSES, CALL_OUTCOMES, type LeadStatus, type CallOutcome } from "@/lib/db/schema";
import { detectInputType } from "@/lib/leadgen/intent";
import { politeFetch } from "@/lib/compliance/fetcher";
import type { AppSettings } from "@/lib/settings-types";

const kick = () => after(() => runJobs(25000).catch(() => undefined));

/* ---------- Discovery & enrichment ---------- */
const DiscoverInput = z.object({
  input: z.string().min(2).max(200_000),
  filters: z.object({ city: z.string().max(80).optional(), category: z.string().max(80).optional(), radiusKm: z.coerce.number().min(1).max(50).optional(), limit: z.coerce.number().min(1).max(100).optional(), hasWebsite: z.enum(["any", "yes", "no"]).optional(), minRating: z.coerce.number().min(0).max(5).optional() }).default({}),
  inputType: z.enum(["auto", "csv"]).default("auto"),
  autoEnrich: z.boolean().default(true),
});

export async function discoverAction(raw: z.input<typeof DiscoverInput>) {
  const p = DiscoverInput.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0].message };
  const { db, userId } = await ctx();
  const type = p.data.inputType === "csv" ? "csv" : detectInputType(p.data.input);
  const [search] = await db.insert(schema.searches).values({ userId, rawInput: p.data.input.slice(0, 5000), inputType: type, filters: p.data.filters }).returning();
  const job = await enqueue(userId, "discover", { input: p.data.input, filters: p.data.filters, searchId: search.id, inputType: p.data.inputType, autoEnrich: p.data.autoEnrich });
  kick();
  return { jobId: job.id, searchId: search.id, inputType: type };
}

export async function enrichAction(leadIds: string[]) {
  const { userId } = await ctx();
  let last: string | undefined;
  for (const id of leadIds.slice(0, 500)) last = (await enqueue(userId, "enrich", { leadId: id }, `enrich:${id}`)).id;
  kick();
  return { jobId: last, count: leadIds.length };
}

export async function peopleSearchAction(leadId: string) {
  const { userId } = await ctx();
  const job = await enqueue(userId, "people", { leadId }, `people:${leadId}:${Date.now()}`);
  kick();
  return { jobId: job.id };
}

export async function analyzeAction(leadId: string) {
  const { userId } = await ctx();
  const r = await analyzeLead(userId, leadId, { force: true });
  revalidatePath(`/leads/${leadId}`);
  return { model: r.model, warnings: r.warnings };
}

export async function assetsAction(leadId: string, productId?: string | null, personId?: string | null) {
  const { userId } = await ctx();
  const r = await generateAssets(userId, leadId, { productId, personId, force: true });
  revalidatePath(`/leads/${leadId}`);
  return { model: r.model, warnings: r.warnings };
}

export async function personAiAction(personId: string) {
  const { userId } = await ctx();
  return personAi(userId, personId);
}

/* ---------- Lead updates ---------- */
export async function setStatusAction(leadId: string, status: string, reason = "Manual change") {
  if (!LEAD_STATUSES.includes(status as LeadStatus)) return { error: "Invalid status" };
  const { userId } = await ctx();
  await setStatus(userId, leadId, status as LeadStatus, reason, "user");
  revalidatePath("/pipeline");
  return {};
}

export async function bulkAction(leadIds: string[], action: "status" | "star" | "delete" | "list" | "enrich", value?: string) {
  const { db, userId } = await ctx();
  const ids = leadIds.slice(0, 1000);
  if (!ids.length) return { error: "Nothing selected" };
  const own = and(eq(schema.leads.userId, userId), inArray(schema.leads.id, ids));
  if (action === "status" && value) for (const id of ids) await setStatus(userId, id, value as LeadStatus, "Bulk update");
  if (action === "star") await db.update(schema.leads).set({ starred: value !== "false" }).where(own);
  if (action === "delete") { await db.delete(schema.leads).where(own); await audit("bulk_delete", "lead", undefined, { count: ids.length }, userId); }
  if (action === "enrich") return enrichAction(ids);
  if (action === "list" && value) {
    const [list] = await db.insert(schema.lists).values({ userId, name: value }).onConflictDoUpdate({ target: [schema.lists.userId, schema.lists.name], set: { name: value } }).returning();
    for (const id of ids) await db.insert(schema.listLeads).values({ listId: list.id, leadId: id }).onConflictDoNothing();
  }
  revalidatePath("/leads");
  return {};
}

export async function updateLeadAction(leadId: string, patch: { starred?: boolean; dndChecked?: boolean; doNotCall?: boolean; dealValue?: number; nextFollowUpAt?: string | null; category?: string; website?: string }) {
  const { db, userId } = await ctx();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["starred", "dndChecked", "doNotCall", "dealValue", "category", "website"] as const) if (patch[k] !== undefined) set[k] = patch[k];
  if (patch.nextFollowUpAt !== undefined) set.nextFollowUpAt = patch.nextFollowUpAt ? new Date(patch.nextFollowUpAt) : null;
  await db.update(schema.leads).set(set).where(and(eq(schema.leads.id, leadId), eq(schema.leads.userId, userId)));
  if (patch.doNotCall) {
    const phones = await db.select().from(schema.leadPhones).where(eq(schema.leadPhones.leadId, leadId));
    for (const p of phones) await suppress(userId, "phone", p.e164, "Do-not-call");
  }
  if (patch.dndChecked !== undefined) await db.update(schema.leadPhones).set({ dndChecked: patch.dndChecked }).where(eq(schema.leadPhones.leadId, leadId));
  revalidatePath(`/leads/${leadId}`);
  return {};
}

export async function addContactAction(leadId: string, kind: "phone" | "email", value: string) {
  const { userId } = await ctx();
  if (kind === "phone") { const n = await addPhone(userId, leadId, value, "manual"); if (!n) return { error: "Invalid phone number" }; }
  else { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return { error: "Invalid email" }; await addEmail(userId, leadId, value, { kind: "found", confidence: 100, sourceUrl: "manual" }); }
  revalidatePath(`/leads/${leadId}`);
  return {};
}

export async function addNoteAction(leadId: string, body: string) {
  if (!body.trim()) return { error: "Empty note" };
  const { db, userId } = await ctx();
  await db.insert(schema.notes).values({ userId, leadId, body: body.slice(0, 10000) });
  revalidatePath(`/leads/${leadId}`);
  return {};
}

export async function addTaskAction(leadId: string | null, title: string, dueAt: string, kind = "follow_up") {
  const { db, userId } = await ctx();
  await db.insert(schema.tasks).values({ userId, leadId, title: title.slice(0, 300), dueAt: new Date(dueAt), kind });
  if (leadId) await db.update(schema.leads).set({ nextFollowUpAt: new Date(dueAt) }).where(eq(schema.leads.id, leadId));
  return {};
}

export async function completeTaskAction(taskId: string) {
  const { db, userId } = await ctx();
  await db.update(schema.tasks).set({ doneAt: new Date() }).where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.userId, userId)));
  return {};
}

export async function markNotificationsRead() {
  const { db, userId } = await ctx();
  await db.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  return {};
}

/* ---------- Calls ---------- */
const OUTCOME_STATUS: Partial<Record<CallOutcome, LeadStatus>> = { interested: "interested", send_details: "interested", meeting_booked: "meeting_booked", not_interested: "lost" };
const OUTCOME_FOLLOWUP_DAYS: Partial<Record<CallOutcome, number>> = { not_reachable: 1, busy_callback: 1, gatekeeper: 2, interested: 2, send_details: 2 };

export async function logCallAction(input: { leadId: string; outcome: string; notes?: string; durationS?: number; personId?: string | null; phone?: string | null; followUpAt?: string | null }) {
  if (!CALL_OUTCOMES.includes(input.outcome as CallOutcome)) return { error: "Invalid outcome" };
  const { db, userId } = await ctx();
  const outcome = input.outcome as CallOutcome;
  await db.insert(schema.callLogs).values({ userId, leadId: input.leadId, outcome, notes: input.notes, durationS: input.durationS ?? 0, personId: input.personId ?? null, phone: input.phone });
  await db.update(schema.leads).set({ lastContactedAt: new Date() }).where(eq(schema.leads.id, input.leadId));
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, input.leadId));
  if (["new", "researched"].includes(lead.status)) await setStatus(userId, input.leadId, "contacted", `Call: ${outcome.replace(/_/g, " ")}`);
  const to = OUTCOME_STATUS[outcome];
  if (to) await setStatus(userId, input.leadId, to, `Call outcome: ${outcome.replace(/_/g, " ")}`);
  if (outcome === "dnd") {
    await db.update(schema.leads).set({ doNotCall: true }).where(eq(schema.leads.id, input.leadId));
    if (input.phone) await suppress(userId, "phone", input.phone, "Asked not to be called / DND");
  }
  if (outcome === "wrong_number" && input.phone) await db.delete(schema.leadPhones).where(and(eq(schema.leadPhones.leadId, input.leadId), eq(schema.leadPhones.e164, input.phone)));
  const days = OUTCOME_FOLLOWUP_DAYS[outcome];
  const due = input.followUpAt ? new Date(input.followUpAt) : days ? new Date(Date.now() + days * 86400000) : null;
  await db.update(schema.tasks).set({ doneAt: new Date() }).where(and(eq(schema.tasks.leadId, input.leadId), eq(schema.tasks.kind, "call"), isNull(schema.tasks.doneAt)));
  if (due) {
    await db.insert(schema.tasks).values({ userId, leadId: input.leadId, kind: "call", title: `Call back ${lead.name} (${outcome.replace(/_/g, " ")})`, dueAt: due, origin: "call" });
    await db.update(schema.leads).set({ nextFollowUpAt: due }).where(eq(schema.leads.id, input.leadId));
  } else {
    await db.update(schema.leads).set({ nextFollowUpAt: null }).where(eq(schema.leads.id, input.leadId));
  }
  revalidatePath("/calls");
  return {};
}

export async function summarizeNotesAction(notes: string, leadName: string) {
  const { userId } = await ctx();
  const lines = notes.split(/[.\n]/).map((s) => s.trim()).filter(Boolean);
  const r = await generate({
    task: "notes", userId, schema: NotesSummarySchema, noCache: true,
    fallback: () => ({
      summary: lines.slice(0, 2).join(". ") || "No notes.",
      nextActions: lines.filter((l) => /send|call|share|meet|quote|demo|follow|whatsapp|email/i.test(l)).slice(0, 4).concat(lines.length ? [] : ["Add notes to get suggestions"]),
      followUpInDays: /tomorrow/i.test(notes) ? 1 : /next week/i.test(notes) ? 7 : /(\d+)\s*days?/i.test(notes) ? Number(notes.match(/(\d+)\s*days?/i)![1]) : null,
    }),
    prompt: `Summarize these telecalling notes about ${leadName} into a one-line summary, 1-4 concrete next actions, and a follow-up in N days (or null). Notes:\n${notes.slice(0, 4000)}`,
  });
  return r.data;
}

/* ---------- Email ---------- */
export async function logEmailSentAction(input: { leadId: string; to: string; subject: string; body: string; productId?: string | null; personId?: string | null; variant?: string; channel?: string; scheduleFollowUps?: boolean }) {
  const { db, userId } = await ctx();
  const channel = input.channel ?? "email";
  await db.insert(schema.outreachLog).values({ userId, leadId: input.leadId, toAddress: input.to.toLowerCase(), subject: input.subject, body: input.body, productId: input.productId ?? null, personId: input.personId ?? null, variant: input.variant, channel });
  await db.update(schema.leads).set({ lastContactedAt: new Date() }).where(eq(schema.leads.id, input.leadId));
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, input.leadId));
  if (["new", "researched"].includes(lead.status)) await setStatus(userId, input.leadId, "contacted", `${channel} sent: ${input.subject || "(no subject)"}`);
  if (input.scheduleFollowUps !== false && channel === "email") {
    for (const d of [3, 7, 14]) {
      await db.insert(schema.tasks).values({ userId, leadId: input.leadId, kind: "email", title: `Day ${d} follow-up: ${lead.name}`, dueAt: new Date(Date.now() + d * 86400000), origin: "auto" });
    }
    await db.update(schema.leads).set({ nextFollowUpAt: new Date(Date.now() + 3 * 86400000) }).where(eq(schema.leads.id, input.leadId));
  }
  revalidatePath(`/leads/${input.leadId}`);
  return {};
}

export async function gmailDraftAction(input: { leadId: string; to: string; subject: string; body: string }) {
  const { db, userId } = await ctx();
  try {
    const d = await createGmailDraft(userId, input.to, input.subject, input.body);
    await db.insert(schema.auditLog).values({ userId, action: "gmail_draft", entity: "lead", entityId: input.leadId, detail: { draftId: d.id, threadId: d.message.threadId } });
    return { ok: true, threadId: d.message.threadId };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function saveTemplateAction(t: { id?: string; name: string; channel: string; subject?: string; body: string }) {
  const { db, userId } = await ctx();
  if (!t.name || !t.body) return { error: "Name and body are required" };
  if (t.id) await db.update(schema.templates).set({ name: t.name, channel: t.channel, subject: t.subject, body: t.body, updatedAt: new Date() }).where(and(eq(schema.templates.id, t.id), eq(schema.templates.userId, userId)));
  else await db.insert(schema.templates).values({ userId, name: t.name, channel: t.channel, subject: t.subject, body: t.body });
  revalidatePath("/email");
  return {};
}

export async function deleteTemplateAction(id: string) {
  const { db, userId } = await ctx();
  await db.delete(schema.templates).where(and(eq(schema.templates.id, id), eq(schema.templates.userId, userId)));
  return {};
}

/* ---------- Inbox ---------- */
export async function pasteReplyAction(input: { leadId?: string | null; from?: string; subject?: string; body: string }) {
  if (!input.body?.trim()) return { error: "Paste the reply text" };
  const { userId } = await ctx();
  const r = await ingestReply(userId, { ...input, source: "paste" });
  revalidatePath("/inbox");
  return r;
}

export async function syncInboxAction() {
  const { userId } = await ctx();
  const job = await enqueue(userId, "inbox_sync", {}, `inbox:${Date.now()}`);
  kick();
  return { jobId: job.id };
}

export async function overrideClassificationAction(messageId: string, label: string) {
  const { db, userId } = await ctx();
  const [m] = await db.update(schema.messages).set({ classification: label, confidence: 100 }).where(and(eq(schema.messages.id, messageId), eq(schema.messages.userId, userId))).returning();
  if (m?.leadId) {
    const { STATUS_FROM_REPLY } = await import("@/lib/inbox/classify");
    const to = STATUS_FROM_REPLY[label as keyof typeof STATUS_FROM_REPLY];
    if (to) await setStatus(userId, m.leadId, to as LeadStatus, `Reply manually re-classified as ${label}`);
  }
  return {};
}

/* ---------- People ---------- */
export async function addPersonAction(leadId: string, p: { fullName: string; title?: string; profileUrl?: string; notes?: string }) {
  if (!p.fullName?.trim()) return { error: "Name is required" };
  if (p.profileUrl && !/^https?:\/\//.test(p.profileUrl)) return { error: "Profile URL must start with http(s)://" };
  const { userId } = await ctx();
  await upsertPerson(userId, leadId, { ...p, source: "manual", sourceUrl: p.profileUrl });
  revalidatePath(`/leads/${leadId}`);
  return {};
}

export async function pasteProfileAction(text: string, leadId?: string | null) {
  const { userId } = await ctx();
  const p = parsePastedProfile(text);
  if (!p.name) return { error: "Could not find a name in the pasted text" };
  const target = leadId ? { lead: { id: leadId } } : await matchCompany(userId, p.company);
  if (!target) return { error: `Parsed ${p.name}${p.company ? ` (${p.company})` : ""}, but no matching company in your leads. Open the lead and paste there.` };
  await upsertPerson(userId, target.lead.id, { fullName: p.name, headline: p.headline, location: p.location, about: p.about, profileUrl: p.profileUrl, source: "paste" });
  return { leadId: target.lead.id, name: p.name };
}

export async function updatePersonAction(personId: string, patch: { notes?: string; priority?: number }) {
  const { db, userId } = await ctx();
  await db.update(schema.leadPeople).set({ ...patch, updatedAt: new Date() }).where(and(eq(schema.leadPeople.id, personId), eq(schema.leadPeople.userId, userId)));
  return {};
}

export async function deletePersonAction(personId: string) {
  const { db, userId } = await ctx();
  await db.delete(schema.leadPeople).where(and(eq(schema.leadPeople.id, personId), eq(schema.leadPeople.userId, userId)));
  return {};
}

/* ---------- Products ---------- */
const ProductInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120), category: z.string().max(120).optional().default(""),
  shortDesc: z.string().max(500).optional().default(""), longDesc: z.string().max(5000).optional().default(""),
  targetIndustries: z.array(z.string()).default([]), icp: z.string().max(1000).optional().default(""),
  problemsSolved: z.array(z.string()).default([]), benefits: z.array(z.string()).default([]),
  pricing: z.string().max(500).optional().default(""), usps: z.array(z.string()).default([]), competitors: z.array(z.string()).default([]),
  caseStudies: z.string().max(5000).optional().default(""), objections: z.array(z.object({ objection: z.string(), rebuttal: z.string() })).default([]),
  brochureUrl: z.string().max(1000).optional().default(""), imageUrl: z.string().max(1000).optional().default(""), active: z.boolean().default(true),
});

export async function saveProductAction(raw: z.input<typeof ProductInput>) {
  const p = ProductInput.safeParse(raw);
  if (!p.success) return { error: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const { db, userId } = await ctx();
  const { id, ...data } = p.data;
  try {
    if (id) await db.update(schema.products).set({ ...data, updatedAt: new Date() }).where(and(eq(schema.products.id, id), eq(schema.products.userId, userId)));
    else { const [r] = await db.insert(schema.products).values({ userId, ...data }).returning(); revalidatePath("/products"); return { redirect: `/products/${r.id}` }; }
  } catch (e) { return { error: /unique/i.test((e as Error).message) ? "A product with this name already exists" : (e as Error).message }; }
  revalidatePath("/products");
  return {};
}

export async function deleteProductAction(id: string) {
  const { db, userId } = await ctx();
  await db.delete(schema.products).where(and(eq(schema.products.id, id), eq(schema.products.userId, userId)));
  return { redirect: "/products" };
}

export async function autofillProductAction(source: string) {
  const { userId } = await ctx();
  let text = source.trim();
  let from = "text";
  if (/^https?:\/\/\S+$/.test(text)) {
    const r = await politeFetch(text);
    if (!r.ok || !r.html) return { error: `Could not read page: ${r.reason}` };
    const cheerio = await import("cheerio");
    const $ = cheerio.load(r.html);
    $("script,style,nav,footer,noscript").remove();
    text = `${$("title").text()}\n${$("meta[name=description]").attr("content") ?? ""}\n${$("body").text().replace(/\s+/g, " ")}`.slice(0, 12000);
    from = "url";
  }
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 15);
  const res = await generate({
    task: "product_autofill", userId, schema: ProductAutofillSchema,
    fallback: () => ({
      name: text.split(/\n/)[0].slice(0, 80) || "New product", category: "", shortDesc: sentences[0]?.slice(0, 200) ?? "", longDesc: sentences.slice(0, 5).join(" "),
      targetIndustries: [], icp: "", problemsSolved: [...new Set((text.toLowerCase().match(/\b(crm|website|seo|booking|appointment|whatsapp|payments?|billing|inventory|payroll|hr|analytics|reviews|automation|marketing|security|cloud|erp)\b/g) ?? []))].slice(0, 8),
      benefits: sentences.filter((s) => /save|increase|reduce|grow|faster|more|less|improve/i.test(s)).slice(0, 4), pricing: text.match(/(₹|rs\.?|inr)\s?[\d,]+[^.\n]{0,30}/i)?.[0] ?? "",
      usps: [], competitors: [], objections: [],
    }),
    prompt: `Extract a product profile from this ${from === "url" ? "web page" : "brochure/text"}. Only use what is stated; leave fields empty if unknown. Problems solved should be short tags (e.g. "crm", "online booking", "slow website").\n\n${text.slice(0, 10000)}`,
  });
  return { data: res.data, model: res.model };
}

/* ---------- Settings ---------- */
export async function saveSettingsAction(patch: Partial<AppSettings>) {
  const { userId } = await ctx();
  await saveSettings(patch, userId);
  revalidatePath("/", "layout");
  return {};
}

export async function saveProfileAction(p: { displayName?: string; companyName?: string; services?: string; tone?: string; signature?: string; meetingLink?: string; phone?: string; languages?: string[] }) {
  const { db, userId } = await ctx();
  await db.update(schema.profiles).set({ ...p, updatedAt: new Date() }).where(eq(schema.profiles.userId, userId));
  return {};
}

export async function saveApiKeyAction(provider: string, value: string | null) {
  const allowed = ["gemini", "groq", "openrouter", "brave", "cse", "places", "gmail_client_id", "gmail_client_secret"];
  if (!allowed.includes(provider)) return { error: "Unknown provider" };
  const { userId } = await ctx();
  await setApiKey(provider, value?.trim() || null, userId);
  await audit("api_key_updated", "api_key", provider, { cleared: !value }, userId);
  return {};
}

export async function suppressionAction(kind: "email" | "phone" | "domain", value: string, reason: string, remove = false) {
  const { db, userId } = await ctx();
  if (remove) await db.delete(schema.suppressionList).where(and(eq(schema.suppressionList.userId, userId), eq(schema.suppressionList.kind, kind), eq(schema.suppressionList.value, value.toLowerCase())));
  else await suppress(userId, kind, value, reason || "Manual");
  return {};
}

export async function deleteAllDataAction(confirmText: string) {
  if (confirmText !== "DELETE") return { error: "Type DELETE to confirm" };
  const { db, userId } = await ctx();
  for (const t of [schema.leads, schema.searches, schema.products, schema.templates, schema.jobs, schema.suppressionList, schema.notifications, schema.lists, schema.tags, schema.apiUsage, schema.tasks, schema.messages, schema.sourceRecords, schema.auditLog]) {
    await db.delete(t).where(eq((t as typeof schema.leads).userId, userId));
  }
  await audit("delete_all", undefined, undefined, {}, userId);
  return { redirect: "/dashboard" };
}

export async function currentMockMode() {
  const { userId } = await ctx();
  return (await getSettings(userId)).mockMode;
}

export async function renderForLeadAction(input: { templateId: string; leadId: string; productId?: string | null; personId?: string | null }) {
  const { db, userId } = await ctx();
  const { renderTemplate } = await import("@/lib/outreach/render");
  const { getProfile } = await import("@/lib/server/core");
  const [t] = await db.select().from(schema.templates).where(and(eq(schema.templates.id, input.templateId), eq(schema.templates.userId, userId)));
  const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, input.leadId), eq(schema.leads.userId, userId)));
  if (!t || !lead) return { error: "Not found" };
  const people = await db.select().from(schema.leadPeople).where(eq(schema.leadPeople.leadId, lead.id));
  const person = people.find((p) => p.id === input.personId) ?? [...people].sort((a, b) => b.dmScore - a.dmScore)[0];
  const [ins] = await db.select().from(schema.leadInsights).where(and(eq(schema.leadInsights.leadId, lead.id), eq(schema.leadInsights.kind, "analysis")));
  const analysis = ins?.payload as { pains?: { title: string }[]; matches?: { productId: string; productName: string }[] } | undefined;
  const products = await db.select().from(schema.products).where(eq(schema.products.userId, userId));
  const product = products.find((p) => p.id === input.productId) ?? products.find((p) => p.id === analysis?.matches?.[0]?.productId);
  const emails = await db.select().from(schema.leadEmails).where(eq(schema.leadEmails.leadId, lead.id));
  const me = await getProfile(userId);
  const vars = {
    first_name: person?.fullName.split(" ")[0] ?? "there", full_name: person?.fullName, title: person?.title, company: lead.name, category: lead.category, city: lead.city, area: lead.area,
    pain_point: analysis?.pains?.[0]?.title.toLowerCase() ?? "", product: product?.name, product_benefit: product?.benefits[0], my_name: me.displayName, my_company: me.companyName, signature: me.signature ?? me.displayName, meeting_link: me.meetingLink,
  };
  return {
    subject: renderTemplate(t.subject ?? "", vars), body: renderTemplate(t.body, vars),
    to: emails.find((e) => e.kind === "found")?.email ?? person?.guessedEmail ?? emails[0]?.email ?? "",
    toIsGuess: !emails.some((e) => e.kind === "found"), productId: product?.id ?? null, personId: person?.id ?? null,
  };
}

export async function regenerateExtensionTokenAction() {
  const { userId } = await ctx();
  const token = (await import("node:crypto")).randomBytes(24).toString("base64url");
  await setApiKey("extension_token", token, userId);
  return { token };
}

export async function disconnectGmailAction() {
  const { userId } = await ctx();
  await setApiKey("gmail_refresh", null, userId);
  await setApiKey("gmail_scopes", null, userId);
  return {};
}

export async function restoreBackupAction(json: string) {
  const { db, userId } = await ctx();
  let data: Record<string, Record<string, unknown>[]>;
  try { data = JSON.parse(json); } catch { return { error: "Invalid JSON" }; }
  const map: [string, typeof schema.leads | typeof schema.products][] = [["products", schema.products], ["leads", schema.leads], ["lead_phones", schema.leadPhones as never], ["lead_emails", schema.leadEmails as never], ["lead_people", schema.leadPeople as never], ["lead_insights", schema.leadInsights as never], ["templates", schema.templates as never], ["call_logs", schema.callLogs as never], ["outreach_log", schema.outreachLog as never], ["messages", schema.messages as never], ["notes", schema.notes as never], ["tasks", schema.tasks as never], ["status_history", schema.statusHistory as never], ["suppression_list", schema.suppressionList as never], ["source_records", schema.sourceRecords as never]];
  let n = 0;
  const dateKeys = /At$|^sentAt$|^startedAt$|^receivedAt$|^dueAt$|^doneAt$|^collectedAt$/;
  for (const [k, table] of map) {
    for (const row of data[k] ?? []) {
      const r = Object.fromEntries(Object.entries(row).map(([key, v]) => [key, typeof v === "string" && dateKeys.test(key) ? new Date(v) : v]));
      r.userId = userId;
      try { await db.insert(table).values(r as never).onConflictDoNothing(); n++; } catch { /* skip bad rows */ }
    }
  }
  return { restored: n };
}
