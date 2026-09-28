import "server-only";
import { and, eq, gte, sql, desc, isNull, lte, inArray, not } from "drizzle-orm";
import { getDb, schema } from "../db/client";

const DAY = 86400000;
function rows<T>(r: unknown): T[] { return ((r as { rows?: T[] }).rows ?? (r as T[])); }

export async function dashboardStats(userId: string, days = 30) {
  const db = await getDb();
  const since = new Date(Date.now() - days * DAY);
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  type Agg = Record<"leads" | "enriched" | "new_leads" | "calls" | "calls_today" | "connects" | "emails" | "emails_today" | "replied_leads" | "emailed_leads" | "meetings" | "pipeline_value" | "won", number>;
  const [agg] = rows<Agg>(await db.execute(sql`
    select
      (select count(*)::int from leads where user_id = ${userId}) as leads,
      (select count(*)::int from leads where user_id = ${userId} and enrich_status = 'done') as enriched,
      (select count(*)::int from leads where user_id = ${userId} and created_at >= ${since}) as new_leads,
      (select count(*)::int from call_logs where user_id = ${userId} and started_at >= ${since}) as calls,
      (select count(*)::int from call_logs where user_id = ${userId} and started_at >= ${startToday}) as calls_today,
      (select count(*)::int from call_logs where user_id = ${userId} and started_at >= ${since} and outcome not in ('not_reachable','wrong_number','busy_callback')) as connects,
      (select count(*)::int from outreach_log where user_id = ${userId} and sent_at >= ${since} and channel = 'email') as emails,
      (select count(*)::int from outreach_log where user_id = ${userId} and sent_at >= ${startToday} and channel = 'email') as emails_today,
      (select count(distinct lead_id)::int from messages where user_id = ${userId} and received_at >= ${since} and direction = 'in' and classification not in ('bounce','auto_responder','out_of_office')) as replied_leads,
      (select count(distinct lead_id)::int from outreach_log where user_id = ${userId} and sent_at >= ${since}) as emailed_leads,
      (select count(*)::int from leads where user_id = ${userId} and status = 'meeting_booked') as meetings,
      (select coalesce(sum(deal_value),0)::int from leads where user_id = ${userId} and status in ('interested','meeting_booked','proposal')) as pipeline_value,
      (select count(*)::int from leads where user_id = ${userId} and status = 'won') as won
  `));
  const funnelRows = rows<{ status: string; n: number }>(await db.execute(sql`select status, count(*)::int n from leads where user_id = ${userId} group by status`));
  const f = Object.fromEntries(funnelRows.map((r) => [r.status, r.n]));
  const order = ["new", "researched", "contacted", "replied", "interested", "meeting_booked", "proposal", "won"];
  const funnel = order.map((s, i) => ({ name: s.replace("_", " "), value: order.slice(i).reduce((a, x) => a + (f[x] ?? 0), 0) }));
  const trend = rows<{ day: string; calls: number; emails: number; replies: number }>(await db.execute(sql`
    with d as (select generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') as day)
    select to_char(d.day, 'DD Mon') as day,
      (select count(*)::int from call_logs c where c.user_id = ${userId} and date_trunc('day', c.started_at) = d.day) as calls,
      (select count(*)::int from outreach_log o where o.user_id = ${userId} and date_trunc('day', o.sent_at) = d.day) as emails,
      (select count(*)::int from messages m where m.user_id = ${userId} and date_trunc('day', m.received_at) = d.day and m.direction = 'in') as replies
    from d order by d.day`));
  const streakRows = rows<{ day: string }>(await db.execute(sql`select distinct to_char(date_trunc('day', started_at), 'YYYY-MM-DD') as day from call_logs where user_id = ${userId} order by day desc limit 60`));
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    if (streakRows.some((r) => r.day === d)) streak++; else if (i > 0) break;
  }
  return { ...agg, funnel, trend, streak, connectRate: agg.calls ? Math.round((agg.connects / agg.calls) * 100) : 0, replyRate: agg.emailed_leads ? Math.round((agg.replied_leads / agg.emailed_leads) * 100) : 0, enrichedPct: agg.leads ? Math.round((agg.enriched / agg.leads) * 100) : 0 };
}

export async function todaysFocus(userId: string) {
  const db = await getDb();
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const tasks = await db.select({ t: schema.tasks, lead: { id: schema.leads.id, name: schema.leads.name, score: schema.leads.score } })
    .from(schema.tasks).leftJoin(schema.leads, eq(schema.tasks.leadId, schema.leads.id))
    .where(and(eq(schema.tasks.userId, userId), isNull(schema.tasks.doneAt), lte(schema.tasks.dueAt, endToday))).orderBy(schema.tasks.dueAt).limit(25);
  const callFirst = await db.select().from(schema.leads).where(and(eq(schema.leads.userId, userId), inArray(schema.leads.status, ["researched", "new", "interested"]), eq(schema.leads.doNotCall, false), isNull(schema.leads.lastContactedAt)))
    .orderBy(desc(schema.leads.score)).limit(6);
  const replies = await db.select({ m: schema.messages, lead: { id: schema.leads.id, name: schema.leads.name } }).from(schema.messages).leftJoin(schema.leads, eq(schema.messages.leadId, schema.leads.id))
    .where(and(eq(schema.messages.userId, userId), gte(schema.messages.receivedAt, new Date(Date.now() - 3 * DAY)), not(inArray(schema.messages.classification, ["bounce", "auto_responder"])))).orderBy(desc(schema.messages.receivedAt)).limit(6);
  const hot = await db.select({ h: schema.statusHistory, lead: { id: schema.leads.id, name: schema.leads.name } }).from(schema.statusHistory).innerJoin(schema.leads, eq(schema.statusHistory.leadId, schema.leads.id))
    .where(and(eq(schema.statusHistory.userId, userId), gte(schema.statusHistory.createdAt, new Date(Date.now() - 3 * DAY)), inArray(schema.statusHistory.toStatus, ["interested", "meeting_booked", "proposal", "won", "replied"]))).orderBy(desc(schema.statusHistory.createdAt)).limit(6);
  return { tasks, callFirst, replies, hot };
}

export async function productPerformance(userId: string) {
  return rows<{ id: string; name: string; pitched: number; replies: number; meetings: number; wins: number; top_industry: string | null }>(await (await getDb()).execute(sql`
    select p.id, p.name,
      (select count(distinct o.lead_id)::int from outreach_log o where o.product_id = p.id) as pitched,
      (select count(distinct m.lead_id)::int from messages m join outreach_log o on o.lead_id = m.lead_id and o.product_id = p.id where m.direction = 'in' and m.classification not in ('bounce','auto_responder','out_of_office')) as replies,
      (select count(distinct l.id)::int from leads l join outreach_log o on o.lead_id = l.id and o.product_id = p.id where l.status in ('meeting_booked','proposal','won')) as meetings,
      (select count(distinct l.id)::int from leads l join outreach_log o on o.lead_id = l.id and o.product_id = p.id where l.status = 'won') as wins,
      (select l.category from leads l join lead_insights i on i.lead_id = l.id and i.kind = 'analysis' where i.payload->'matches'->0->>'productId' = p.id::text and l.category is not null group by l.category order by count(*) desc limit 1) as top_industry
    from products p where p.user_id = ${userId} order by p.name`));
}

/** Aggregate pain points across leads and flag ones no active product covers. */
export async function gapFinder(userId: string) {
  const db = await getDb();
  const pains = rows<{ title: string; key: string | null; n: number }>(await db.execute(sql`
    select p->>'title' as title, p->>'key' as key, count(*)::int as n
    from lead_insights i, jsonb_array_elements(i.payload->'pains') p
    where i.user_id = ${userId} and i.kind = 'analysis' group by 1, 2 order by n desc limit 30`));
  const products = await db.select().from(schema.products).where(and(eq(schema.products.userId, userId), eq(schema.products.active, true)));
  const { productCoversPain } = await import("../ai/pains");
  return pains.map((p) => {
    const covering = products.filter((pr) => productCoversPain(pr.problemsSolved, p.key ?? p.title.toLowerCase()));
    return { ...p, covered: covering.length > 0, products: covering.map((c) => c.name) };
  });
}

export async function bestTimeToCall(userId: string) {
  return rows<{ hour: number; calls: number; connects: number }>(await (await getDb()).execute(sql`
    select extract(hour from started_at at time zone 'Asia/Kolkata')::int as hour, count(*)::int as calls,
      count(*) filter (where outcome not in ('not_reachable','wrong_number','busy_callback'))::int as connects
    from call_logs where user_id = ${userId} group by 1 order by 1`));
}

export async function breakdowns(userId: string) {
  const db = await getDb();
  const byCategory = rows<{ category: string; leads: number; won: number; interested: number }>(await db.execute(sql`
    select coalesce(category,'Unknown') as category, count(*)::int leads, count(*) filter (where status='won')::int won,
      count(*) filter (where status in ('interested','meeting_booked','proposal','won'))::int interested
    from leads where user_id = ${userId} group by 1 order by interested desc, leads desc limit 10`));
  const byTemplate = rows<{ variant: string; sent: number; replied: number }>(await db.execute(sql`
    select coalesce(o.variant, 'manual') as variant, count(*)::int sent,
      count(distinct m.lead_id)::int replied
    from outreach_log o left join messages m on m.lead_id = o.lead_id and m.direction='in' and m.received_at > o.sent_at
    where o.user_id = ${userId} and o.channel='email' group by 1 order by sent desc limit 10`));
  const outcomes = rows<{ outcome: string; n: number }>(await db.execute(sql`select outcome, count(*)::int n from call_logs where user_id = ${userId} group by 1 order by n desc`));
  return { byCategory, byTemplate, outcomes };
}
