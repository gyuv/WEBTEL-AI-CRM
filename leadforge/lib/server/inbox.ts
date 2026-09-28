import "server-only";
import { and, eq, desc, lt, inArray, isNull, or } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { generate } from "../llm";
import { ReplyAnalysisSchema } from "../ai/schemas";
import { classifyReplyRules, NO_REPLY_CLASSES, STATUS_FROM_REPLY, type ReplyClass } from "../inbox/classify";
import { getApiKey, getSettings, setApiKey, trackUsage, notify, getProfile } from "./core";
import { setStatus, suppress } from "./leads";
import { loadProducts } from "../ai/engine";
import type { LeadStatus } from "../db/schema";
import { firstName } from "../utils";

export interface IncomingReply { leadId?: string | null; from?: string | null; subject?: string; body: string; threadId?: string | null; inReplyTo?: string | null; providerMessageId?: string | null; source: "gmail" | "paste"; receivedAt?: Date }

export async function matchLead(userId: string, r: IncomingReply): Promise<string | null> {
  if (r.leadId) return r.leadId;
  const db = await getDb();
  if (r.threadId) {
    const [o] = await db.select({ leadId: schema.outreachLog.leadId }).from(schema.outreachLog).where(and(eq(schema.outreachLog.userId, userId), eq(schema.outreachLog.threadId, r.threadId)));
    if (o) return o.leadId;
  }
  const email = r.from?.match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase();
  if (email) {
    const [e] = await db.select({ leadId: schema.leadEmails.leadId }).from(schema.leadEmails).where(and(eq(schema.leadEmails.userId, userId), eq(schema.leadEmails.email, email)));
    if (e) return e.leadId;
    const [o] = await db.select({ leadId: schema.outreachLog.leadId }).from(schema.outreachLog).where(and(eq(schema.outreachLog.userId, userId), eq(schema.outreachLog.toAddress, email)));
    if (o) return o.leadId;
    const domain = email.split("@")[1];
    if (!/gmail|yahoo|outlook|hotmail|rediff/.test(domain)) {
      const [l] = await db.select({ id: schema.leads.id }).from(schema.leads).where(and(eq(schema.leads.userId, userId), eq(schema.leads.domain, domain)));
      if (l) return l.id;
    }
  }
  return null;
}

export async function analyzeReply(userId: string, leadId: string | null, subject: string, body: string) {
  const rules = classifyReplyRules(subject, body);
  const db = await getDb();
  const lead = leadId ? (await db.select().from(schema.leads).where(eq(schema.leads.id, leadId)))[0] : null;
  const history = leadId ? await db.select().from(schema.outreachLog).where(eq(schema.outreachLog.leadId, leadId)).orderBy(desc(schema.outreachLog.sentAt)).limit(3) : [];
  const products = await loadProducts(userId);
  const me = await getProfile(userId);
  const product = products.find((p) => history.some((h) => h.productId === p.id)) ?? products[0];
  const name = firstName(body.match(/(?:regards|thanks|thank you|cheers),?\s*\n\s*([A-Z][a-z]+)/i)?.[1] ?? "");
  const hi = name ? `Hi ${name}` : "Hi";
  const sig = me.signature ?? me.displayName ?? "";
  const objection = product?.objections.find((o) => rules.label.startsWith("objection") && body.toLowerCase().includes(o.objection.toLowerCase().split(" ")[1] ?? "~"))?.rebuttal ?? product?.objections[0]?.rebuttal;
  const drafts = NO_REPLY_CLASSES.includes(rules.label) ? [] : rules.label === "not_interested" ? [
    { tone: "Graceful close", body: `${hi},\n\nThanks for letting me know — I appreciate the reply. I'll close this on my side. If things change, I'm a message away.\n\n${sig}` },
  ] : rules.label === "out_of_office" ? [] : [
    { tone: "Warm & direct", body: `${hi},\n\nThanks for getting back! ${rules.label === "meeting_request" ? `Happy to meet — ${me.meetingLink ? `here's my calendar: ${me.meetingLink}` : "does Thursday 11am or Friday 4pm work?"}` : rules.label.startsWith("objection") ? objection ?? "That's a fair point — could I share how similar businesses handled it?" : `Here are the details on ${product?.name ?? "what we discussed"}: ${product?.shortDesc ?? ""}`}\n\n${sig}` },
    { tone: "Short", body: `${hi}, thanks! ${rules.label === "meeting_request" ? "Sending an invite now — what number should I call?" : "Would a quick 10-minute call be easier to answer this?"}\n\n${sig}` },
    { tone: "Value-add", body: `${hi},\n\nGreat question. ${product?.caseStudies ? `A quick example: ${product.caseStudies}` : `${product?.name ?? "Our solution"} helps ${product?.benefits.join(", ") ?? ""}.`}\n\nShall I walk you through it?\n\n${sig}` },
  ];
  const res = await generate({
    task: "reply", userId, schema: ReplyAnalysisSchema, fallback: () => ({ ...rules, drafts }),
    prompt: `Classify this reply to my cold outreach and draft 2-3 reply options (never draft for unsubscribe/bounce/auto_responder). Lead: ${lead?.name ?? "unknown"}. Prior emails: ${history.map((h) => h.subject).join(" | ") || "none"}. Product: ${product?.name ?? ""} — ${product?.shortDesc ?? ""}. Rebuttals: ${product?.objections.map((o) => o.objection + " => " + o.rebuttal).join(" / ")}. My signature: ${sig}\n\nREPLY SUBJECT: ${subject}\nREPLY BODY:\n${body.slice(0, 3000)}\n\nJSON keys: label, confidence, summary, drafts[{tone, body}].`,
  });
  const data = res.data;
  if (NO_REPLY_CLASSES.includes(data.label)) data.drafts = [];
  return { ...data, model: res.model };
}

export async function ingestReply(userId: string, r: IncomingReply) {
  const db = await getDb();
  const leadId = await matchLead(userId, r);
  const a = await analyzeReply(userId, leadId, r.subject ?? "", r.body);
  const [msg] = await db.insert(schema.messages).values({
    userId, leadId, direction: "in", fromAddress: r.from, subject: r.subject, body: r.body, threadId: r.threadId, providerMessageId: r.providerMessageId,
    classification: a.label, confidence: a.confidence, summary: a.summary, source: r.source, receivedAt: r.receivedAt ?? new Date(),
  }).onConflictDoNothing().returning();
  if (!msg) return { duplicate: true };
  const email = r.from?.match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase();
  if (a.label === "unsubscribe" && email) await suppress(userId, "email", email, "Unsubscribe reply");
  if (a.label === "bounce" && email) await suppress(userId, "email", email, "Bounced");
  let statusChanged = false;
  if (leadId) {
    const to = STATUS_FROM_REPLY[a.label as ReplyClass] as LeadStatus | null;
    if (to) statusChanged = await setStatus(userId, leadId, to, `Reply classified as ${a.label} (${a.confidence}%): ${a.summary}`, "ai");
    await db.update(schema.tasks).set({ doneAt: new Date() }).where(and(eq(schema.tasks.leadId, leadId), eq(schema.tasks.origin, "auto"), isNull(schema.tasks.doneAt)));
    if (["interested", "meeting_request"].includes(a.label)) {
      await db.insert(schema.tasks).values({ userId, leadId, kind: "email", title: `Reply to ${a.label.replace("_", " ")}`, dueAt: new Date(), origin: "reply" });
    }
    await notify(`New reply: ${a.label.replace(/_/g, " ")}`, a.summary, leadId, "reply", userId);
  }
  return { messageId: msg.id, leadId, analysis: a, statusChanged };
}

/* ---------------- Gmail (optional, read-only by default) ---------------- */
export const GMAIL_SCOPES = { readonly: "https://www.googleapis.com/auth/gmail.readonly", compose: "https://www.googleapis.com/auth/gmail.compose" };

export async function gmailAccessToken(userId: string) {
  const refresh = await getApiKey("gmail_refresh", userId);
  const cid = await getApiKey("gmail_client_id", userId);
  const secret = await getApiKey("gmail_client_secret", userId);
  if (!refresh || !cid || !secret) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cid, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  if (!r.ok) return null;
  return ((await r.json()) as { access_token: string }).access_token;
}

export async function saveGmailRefresh(userId: string, token: string, scopes: string) {
  await setApiKey("gmail_refresh", token, userId);
  await setApiKey("gmail_scopes", scopes, userId);
}

function b64(s: string) { return Buffer.from(s, "base64url").toString("utf8"); }

export async function syncGmail(userId: string) {
  const token = await gmailAccessToken(userId);
  if (!token) return { skipped: "Gmail not connected" };
  const db = await getDb();
  const doms = await db.selectDistinct({ domain: schema.leads.domain }).from(schema.leads).where(and(eq(schema.leads.userId, userId), inArray(schema.leads.status, ["contacted", "replied", "interested", "meeting_booked", "proposal"])));
  const sent = await db.selectDistinct({ to: schema.outreachLog.toAddress }).from(schema.outreachLog).where(eq(schema.outreachLog.userId, userId));
  const froms = [...new Set([...doms.map((d) => d.domain).filter(Boolean), ...sent.map((s) => s.to).filter(Boolean)])].slice(0, 40);
  const q = `newer_than:3d -from:me ${froms.length ? `{${froms.map((f) => `from:${f}`).join(" ")}}` : ""} OR subject:(undeliverable OR "delivery status")`;
  const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(q)}`, { headers: { authorization: `Bearer ${token}` } });
  await trackUsage("gmail", 1, 0, userId);
  if (!list.ok) throw new Error(`Gmail list ${list.status}`);
  const ids = ((await list.json()) as { messages?: { id: string }[] }).messages ?? [];
  let ingested = 0;
  for (const { id } of ids) {
    const [exists] = await db.select({ id: schema.messages.id }).from(schema.messages).where(and(eq(schema.messages.userId, userId), eq(schema.messages.providerMessageId, id)));
    if (exists) continue;
    const m = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { authorization: `Bearer ${token}` } });
    await trackUsage("gmail", 1, 0, userId);
    if (!m.ok) continue;
    const j = (await m.json()) as { id: string; threadId: string; internalDate: string; payload: GPart & { headers: { name: string; value: string }[] } };
    const h = (n: string) => j.payload.headers.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    const body = extractText(j.payload);
    await ingestReply(userId, { from: h("from"), subject: h("subject"), body, threadId: j.threadId, inReplyTo: h("in-reply-to"), providerMessageId: j.id, source: "gmail", receivedAt: new Date(Number(j.internalDate)) });
    ingested++;
  }
  return { ingested };
}
interface GPart { mimeType?: string; body?: { data?: string }; parts?: GPart[] }
function extractText(p: GPart): string {
  if (p.mimeType === "text/plain" && p.body?.data) return b64(p.body.data);
  for (const c of p.parts ?? []) { const t = extractText(c); if (t) return t; }
  if (p.body?.data) return b64(p.body.data).replace(/<[^>]+>/g, " ");
  return "";
}

export async function createGmailDraft(userId: string, to: string, subject: string, body: string) {
  const scopes = (await getApiKey("gmail_scopes", userId)) ?? "";
  if (!scopes.includes("compose")) throw new Error("Gmail compose scope not granted. Reconnect Gmail with 'Allow drafts'.");
  const token = await gmailAccessToken(userId);
  if (!token) throw new Error("Gmail not connected");
  const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`).toString("base64url");
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ message: { raw } }),
  });
  await trackUsage("gmail", 1, 0, userId);
  if (!r.ok) throw new Error(`Gmail draft failed: ${r.status}`);
  return (await r.json()) as { id: string; message: { threadId: string } };
}

/** Cold detection + auto follow-up tasks. Run from cron. */
export async function detectCold(userId: string) {
  const db = await getDb();
  const s = await getSettings(userId);
  const cutoff = new Date(Date.now() - s.coldAfterDays * 86400000);
  const cold = await db.select().from(schema.leads).where(and(eq(schema.leads.userId, userId), inArray(schema.leads.status, ["contacted", "replied", "interested"]), lt(schema.leads.lastContactedAt, cutoff), or(isNull(schema.leads.nextFollowUpAt), lt(schema.leads.nextFollowUpAt, new Date()))));
  for (const l of cold) {
    await db.insert(schema.tasks).values({ userId, leadId: l.id, kind: "follow_up", title: `Re-engage ${l.name} (silent ${s.coldAfterDays}+ days): share a case study or new offer`, dueAt: new Date(), origin: "cold" });
    await db.update(schema.leads).set({ nextFollowUpAt: new Date(Date.now() + 7 * 86400000) }).where(eq(schema.leads.id, l.id));
  }
  if (cold.length) await notify(`${cold.length} lead(s) went cold`, "Re-engagement tasks added to Today's Focus.", undefined, "cold", userId);
  return { cold: cold.length };
}
