import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { currentUserId } from "../auth";
import { DEFAULT_SETTINGS, type AppSettings } from "../settings-types";
import { decrypt, encrypt } from "../crypto";

export { currentUserId };

export async function ctx() {
  const [db, userId] = await Promise.all([getDb(), currentUserId()]);
  return { db, userId };
}

function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== "object" || Array.isArray(over)) return (over as T) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) ? merge(b, v) : v;
  }
  return out as T;
}

export async function getProfile(userId?: string) {
  const db = await getDb();
  const uid = userId ?? (await currentUserId());
  let [p] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, uid));
  if (!p) {
    [p] = await db.insert(schema.profiles).values({ userId: uid, settings: {} }).onConflictDoNothing().returning();
    if (!p) [p] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, uid));
  }
  return p;
}

export async function getSettings(userId?: string): Promise<AppSettings> {
  const p = await getProfile(userId);
  const s = merge(DEFAULT_SETTINGS, p.settings ?? {});
  if (process.env.MOCK_MODE === "true") s.mockMode = true;
  return s;
}

export async function saveSettings(patch: Partial<AppSettings>, userId?: string) {
  const db = await getDb();
  const p = await getProfile(userId);
  const next = merge(merge(DEFAULT_SETTINGS, p.settings ?? {}), patch);
  await db.update(schema.profiles).set({ settings: next as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(schema.profiles.userId, p.userId));
  return next;
}

const ENV_KEYS: Record<string, string> = {
  gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", openrouter: "OPENROUTER_API_KEY",
  brave: "BRAVE_API_KEY", cse: "GOOGLE_CSE_KEY", places: "GOOGLE_PLACES_KEY",
  gmail_client_id: "GOOGLE_CLIENT_ID", gmail_client_secret: "GOOGLE_CLIENT_SECRET",
};

/** API keys: env var wins; otherwise the encrypted value stored in api_keys. Server-only. */
export async function getApiKey(provider: string, userId?: string): Promise<string | null> {
  const env = ENV_KEYS[provider] && process.env[ENV_KEYS[provider]];
  if (env) return env;
  const db = await getDb();
  const uid = userId ?? (await currentUserId());
  const [row] = await db.select().from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.userId, uid), eq(schema.apiKeys.provider, provider)));
  if (!row) return null;
  try { return decrypt(row.ciphertext); } catch { return null; }
}

export async function setApiKey(provider: string, value: string | null, userId?: string) {
  const db = await getDb();
  const uid = userId ?? (await currentUserId());
  if (!value) {
    await db.delete(schema.apiKeys).where(and(eq(schema.apiKeys.userId, uid), eq(schema.apiKeys.provider, provider)));
    return;
  }
  await db.insert(schema.apiKeys).values({ userId: uid, provider, ciphertext: encrypt(value), last4: value.slice(-4) })
    .onConflictDoUpdate({
      target: [schema.apiKeys.userId, schema.apiKeys.provider],
      set: { ciphertext: encrypt(value), last4: value.slice(-4) },
    });
}

export async function keyStatus(userId?: string) {
  const db = await getDb();
  const uid = userId ?? (await currentUserId());
  const rows = await db.select({ provider: schema.apiKeys.provider, last4: schema.apiKeys.last4 })
    .from(schema.apiKeys).where(eq(schema.apiKeys.userId, uid));
  const out: Record<string, { set: boolean; source: "env" | "db" | null; last4?: string | null }> = {};
  for (const [p, env] of Object.entries(ENV_KEYS)) {
    const r = rows.find((x) => x.provider === p);
    out[p] = process.env[env] ? { set: true, source: "env" } : r ? { set: true, source: "db", last4: r.last4 } : { set: false, source: null };
  }
  return out;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function trackUsage(provider: string, calls = 1, tokens = 0, userId?: string) {
  const db = await getDb();
  const uid = userId ?? "owner";
  await db.insert(schema.apiUsage).values({ userId: uid, provider, day: today(), calls, tokens })
    .onConflictDoUpdate({
      target: [schema.apiUsage.userId, schema.apiUsage.provider, schema.apiUsage.day],
      set: { calls: sql`${schema.apiUsage.calls} + ${calls}`, tokens: sql`${schema.apiUsage.tokens} + ${tokens}` },
    });
}

export async function usageToday(provider: string, userId = "owner") {
  const db = await getDb();
  const [r] = await db.select().from(schema.apiUsage).where(and(
    eq(schema.apiUsage.userId, userId), eq(schema.apiUsage.provider, provider), eq(schema.apiUsage.day, today()),
  ));
  return r?.calls ?? 0;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const [r] = await db.select().from(schema.cache).where(eq(schema.cache.key, key));
  if (!r) return null;
  if (r.expiresAt && r.expiresAt.getTime() < Date.now()) return null;
  return r.value as T;
}

export async function cacheSet(namespace: string, key: string, value: unknown, ttlSeconds?: number) {
  const db = await getDb();
  const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;
  await db.insert(schema.cache).values({ key, namespace, value: value as object, expiresAt })
    .onConflictDoUpdate({ target: schema.cache.key, set: { value: value as object, expiresAt, createdAt: new Date() } });
}

export async function audit(action: string, entity?: string, entityId?: string, detail?: Record<string, unknown>, userId = "owner") {
  const db = await getDb();
  await db.insert(schema.auditLog).values({ userId, action, entity, entityId, detail });
}

export async function notify(title: string, body?: string, leadId?: string, kind = "info", userId = "owner") {
  const db = await getDb();
  await db.insert(schema.notifications).values({ userId, kind, title, body, leadId });
}
