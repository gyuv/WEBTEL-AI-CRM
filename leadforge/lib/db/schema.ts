import {
  pgTable, text, integer, real, boolean, timestamp, jsonb, uuid, uniqueIndex, index, doublePrecision,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => uuid("id").primaryKey().defaultRandom();
const userId = () => text("user_id").notNull().default("owner");
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const LEAD_STATUSES = [
  "new", "researched", "contacted", "replied", "interested", "meeting_booked", "proposal", "won", "lost", "unsubscribed",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const CALL_OUTCOMES = [
  "not_reachable", "busy_callback", "gatekeeper", "interested", "send_details", "meeting_booked", "not_interested", "wrong_number", "dnd",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name"),
  companyName: text("company_name"),
  services: text("services"),
  tone: text("tone").default("friendly-professional"),
  languages: jsonb("languages").$type<string[]>().default(["English", "Tamil"]),
  signature: text("signature"),
  meetingLink: text("meeting_link"),
  phone: text("phone"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
  updatedAt: updated(),
});

export const apiKeys = pgTable("api_keys", {
  id: id(), userId: userId(),
  provider: text("provider").notNull(),
  ciphertext: text("ciphertext").notNull(),
  last4: text("last4"),
  createdAt: created(),
}, (t) => [uniqueIndex("api_keys_user_provider").on(t.userId, t.provider)]);

export const products = pgTable("products", {
  id: id(), userId: userId(),
  name: text("name").notNull(),
  category: text("category"),
  shortDesc: text("short_desc"),
  longDesc: text("long_desc"),
  targetIndustries: jsonb("target_industries").$type<string[]>().notNull().default([]),
  icp: text("icp"),
  problemsSolved: jsonb("problems_solved").$type<string[]>().notNull().default([]),
  benefits: jsonb("benefits").$type<string[]>().notNull().default([]),
  pricing: text("pricing"),
  usps: jsonb("usps").$type<string[]>().notNull().default([]),
  competitors: jsonb("competitors").$type<string[]>().notNull().default([]),
  caseStudies: text("case_studies"),
  objections: jsonb("objections").$type<{ objection: string; rebuttal: string }[]>().notNull().default([]),
  brochureUrl: text("brochure_url"),
  imageUrl: text("image_url"),
  active: boolean("active").notNull().default(true),
  createdAt: created(), updatedAt: updated(),
}, (t) => [uniqueIndex("products_user_name").on(t.userId, t.name)]);

export const searches = pgTable("searches", {
  id: id(), userId: userId(),
  rawInput: text("raw_input").notNull(),
  inputType: text("input_type").notNull(),
  intent: jsonb("intent").$type<Record<string, unknown>>(),
  filters: jsonb("filters").$type<Record<string, unknown>>(),
  resultCount: integer("result_count").default(0),
  createdAt: created(),
}, (t) => [index("searches_user_created").on(t.userId, t.createdAt)]);

export const leads = pgTable("leads", {
  id: id(), userId: userId(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  domain: text("domain"),
  website: text("website"),
  address: text("address"),
  area: text("area"),
  city: text("city"),
  pincode: text("pincode"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  category: text("category"),
  rating: real("rating"),
  reviewsCount: integer("reviews_count"),
  mapsUrl: text("maps_url"),
  socials: jsonb("socials").$type<Record<string, string>>().notNull().default({}),
  whatsapp: text("whatsapp"),
  gstin: text("gstin"),
  cin: text("cin"),
  yearEst: integer("year_est"),
  sizeEstimate: text("size_estimate"),
  status: text("status").$type<LeadStatus>().notNull().default("new"),
  score: integer("score").notNull().default(0),
  fitScore: integer("fit_score").notNull().default(0),
  intentScore: integer("intent_score").notNull().default(0),
  reachScore: integer("reach_score").notNull().default(0),
  starred: boolean("starred").notNull().default(false),
  dealValue: integer("deal_value").default(0),
  enrichStatus: text("enrich_status").notNull().default("pending"),
  dndChecked: boolean("dnd_checked").notNull().default(false),
  doNotCall: boolean("do_not_call").notNull().default(false),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  lastEnrichedAt: timestamp("last_enriched_at", { withTimezone: true }),
  primarySource: text("primary_source"),
  searchId: uuid("search_id"),
  createdAt: created(), updatedAt: updated(),
}, (t) => [
  uniqueIndex("leads_user_domain").on(t.userId, t.domain).where(sql`${t.domain} is not null`),
  index("leads_user_status").on(t.userId, t.status),
  index("leads_user_score").on(t.userId, t.score),
  index("leads_user_norm").on(t.userId, t.normalizedName),
]);

export const leadPhones = pgTable("lead_phones", {
  id: id(), userId: userId(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  personId: uuid("person_id"),
  e164: text("e164").notNull(),
  kind: text("kind").notNull().default("unknown"),
  source: text("source"),
  dndChecked: boolean("dnd_checked").notNull().default(false),
  createdAt: created(),
}, (t) => [uniqueIndex("lead_phones_lead_e164").on(t.leadId, t.e164)]);

export const leadEmails = pgTable("lead_emails", {
  id: id(), userId: userId(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  personId: uuid("person_id"),
  email: text("email").notNull(),
  kind: text("kind").notNull().default("found"),
  confidence: integer("confidence").notNull().default(100),
  mxOk: boolean("mx_ok"),
  sourceUrl: text("source_url"),
  createdAt: created(),
}, (t) => [uniqueIndex("lead_emails_lead_email").on(t.leadId, t.email)]);

export const leadPeople = pgTable("lead_people", {
  id: id(), userId: userId(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  title: text("title"),
  seniority: text("seniority"),
  roleGroup: text("role_group"),
  dmScore: integer("dm_score").notNull().default(0),
  profileUrl: text("profile_url"),
  location: text("location"),
  headline: text("headline"),
  about: text("about"),
  activity: text("activity"),
  source: text("source").notNull(),
  sourceUrl: text("source_url"),
  guessedEmail: text("guessed_email"),
  priority: integer("priority").notNull().default(0),
  icebreaker: text("icebreaker"),
  connectionNote: text("connection_note"),
  notes: text("notes"),
  createdAt: created(), updatedAt: updated(),
}, (t) => [
  uniqueIndex("lead_people_lead_name").on(t.leadId, t.normalizedName),
  index("lead_people_lead").on(t.leadId),
]);

export const leadEnrichment = pgTable("lead_enrichment", {
  leadId: uuid("lead_id").primaryKey().references(() => leads.id, { onDelete: "cascade" }),
  userId: userId(),
  techStack: jsonb("tech_stack").$type<string[]>().notNull().default([]),
  audit: jsonb("audit").$type<Record<string, unknown>>().notNull().default({}),
  pages: jsonb("pages").$type<{ url: string; status: string; note?: string }[]>().notNull().default([]),
  textSample: text("text_sample"),
  updatedAt: updated(),
});

export const leadInsights = pgTable("lead_insights", {
  id: id(), userId: userId(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  model: text("model"),
  createdAt: created(),
}, (t) => [uniqueIndex("lead_insights_lead_kind").on(t.leadId, t.kind)]);

export const sourceRecords = pgTable("source_records", {
  id: id(), userId: userId(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  field: text("field").notNull(),
  value: text("value"),
  sourceUrl: text("source_url"),
  snippet: text("snippet"),
  method: text("method").notNull().default("found"),
  confidence: integer("confidence").notNull().default(80),
  provider: text("provider"),
  collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("source_records_entity").on(t.entityType, t.entityId)]);

export const lists = pgTable("lists", {
  id: id(), userId: userId(), name: text("name").notNull(), createdAt: created(),
}, (t) => [uniqueIndex("lists_user_name").on(t.userId, t.name)]);

export const listLeads = pgTable("list_leads", {
  listId: uuid("list_id").notNull().references(() => lists.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("list_leads_pk").on(t.listId, t.leadId)]);

export const tags = pgTable("tags", {
  id: id(), userId: userId(), name: text("name").notNull(), color: text("color"),
}, (t) => [uniqueIndex("tags_user_name").on(t.userId, t.name)]);

export const leadTags = pgTable("lead_tags", {
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("lead_tags_pk").on(t.tagId, t.leadId)]);

export const templates = pgTable("templates", {
  id: id(), userId: userId(),
  name: text("name").notNull(),
  channel: text("channel").notNull().default("email"),
  subject: text("subject"),
  body: text("body").notNull(),
  createdAt: created(), updatedAt: updated(),
});

export const outreachLog = pgTable("outreach_log", {
  id: id(), userId: userId(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  personId: uuid("person_id"),
  productId: uuid("product_id"),
  templateId: uuid("template_id"),
  channel: text("channel").notNull(),
  toAddress: text("to_address"),
  subject: text("subject"),
  body: text("body"),
  variant: text("variant"),
  threadId: text("thread_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("outreach_lead").on(t.leadId), index("outreach_thread").on(t.threadId)]);

export const messages = pgTable("messages", {
  id: id(), userId: userId(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  direction: text("direction").notNull().default("in"),
  fromAddress: text("from_address"),
  subject: text("subject"),
  body: text("body").notNull(),
  threadId: text("thread_id"),
  providerMessageId: text("provider_message_id"),
  classification: text("classification"),
  confidence: integer("confidence"),
  summary: text("summary"),
  source: text("source").notNull().default("paste"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("messages_provider_id").on(t.userId, t.providerMessageId).where(sql`${t.providerMessageId} is not null`),
  index("messages_lead").on(t.leadId),
]);

export const callLogs = pgTable("call_logs", {
  id: id(), userId: userId(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  personId: uuid("person_id"),
  phone: text("phone"),
  outcome: text("outcome").$type<CallOutcome>().notNull(),
  durationS: integer("duration_s").default(0),
  notes: text("notes"),
  aiSummary: text("ai_summary"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("call_logs_lead").on(t.leadId), index("call_logs_user_time").on(t.userId, t.startedAt)]);

export const tasks = pgTable("tasks", {
  id: id(), userId: userId(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("follow_up"),
  title: text("title").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  doneAt: timestamp("done_at", { withTimezone: true }),
  origin: text("origin").notNull().default("manual"),
  createdAt: created(),
}, (t) => [index("tasks_user_due").on(t.userId, t.dueAt)]);

export const notes = pgTable("notes", {
  id: id(), userId: userId(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: created(),
});

export const statusHistory = pgTable("status_history", {
  id: id(), userId: userId(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  reason: text("reason"),
  actor: text("actor").notNull().default("user"),
  createdAt: created(),
}, (t) => [index("status_history_lead").on(t.leadId)]);

export const suppressionList = pgTable("suppression_list", {
  id: id(), userId: userId(),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
  reason: text("reason"),
  createdAt: created(),
}, (t) => [uniqueIndex("suppression_unique").on(t.userId, t.kind, t.value)]);

export const jobs = pgTable("jobs", {
  id: id(), userId: userId(),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
  error: text("error"),
  progress: integer("progress").notNull().default(0),
  progressMsg: text("progress_msg"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  idempotencyKey: text("idempotency_key"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: created(), updatedAt: updated(),
}, (t) => [
  uniqueIndex("jobs_idem").on(t.userId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
  index("jobs_status_run").on(t.status, t.runAfter),
]);

export const apiUsage = pgTable("api_usage", {
  id: id(), userId: userId(),
  provider: text("provider").notNull(),
  day: text("day").notNull(),
  calls: integer("calls").notNull().default(0),
  tokens: integer("tokens").notNull().default(0),
}, (t) => [uniqueIndex("api_usage_unique").on(t.userId, t.provider, t.day)]);

export const cache = pgTable("cache", {
  key: text("key").primaryKey(),
  namespace: text("namespace").notNull(),
  value: jsonb("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: created(),
});

export const auditLog = pgTable("audit_log", {
  id: id(), userId: userId(),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  createdAt: created(),
}, (t) => [index("audit_user_created").on(t.userId, t.createdAt)]);

export const notifications = pgTable("notifications", {
  id: id(), userId: userId(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  leadId: uuid("lead_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: created(),
});
