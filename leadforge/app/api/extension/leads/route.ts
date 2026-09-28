import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { getApiKey } from "@/lib/server/core";
import { getDb, schema } from "@/lib/db/client";
import { saveScraped } from "@/lib/server/scraper";
import { rateLimit } from "@/lib/rate-limit";

const Lead = z.object({
  name: z.string().min(2).max(200), phone: z.string().max(40).nullish(), address: z.string().max(400).nullish(), website: z.string().max(500).nullish(),
  category: z.string().max(120).nullish(), rating: z.coerce.number().min(0).max(5).nullish(), reviews: z.coerce.number().min(0).nullish(), mapsUrl: z.string().max(1000).nullish(),
});
const Body = z.object({ leads: z.array(Lead).min(1).max(500), pageUrl: z.string().max(2000).optional(), city: z.string().max(80).optional(), addToCallQueue: z.boolean().optional() });

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "content-type, authorization");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}
export async function OPTIONS() { return cors(new NextResponse(null, { status: 204 })); }

/** Businesses the user captured from a page they are viewing (e.g. Google Maps results), on click. */
export async function POST(req: Request) {
  const userId = "owner";
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = await getApiKey("extension_token", userId);
  if (!expected || token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return cors(NextResponse.json({ error: "Invalid token" }, { status: 401 }));
  if (!rateLimit(`extl:${userId}`, 60, 60_000)) return cors(NextResponse.json({ error: "Too many requests" }, { status: 429 }));
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return cors(NextResponse.json({ error: p.error.issues[0].message }, { status: 400 }));
  const db = await getDb();
  const [search] = await db.insert(schema.searches).values({ userId, rawInput: `Extension capture: ${p.data.pageUrl ?? ""}`.slice(0, 2000), inputType: "capture", filters: {} }).returning();
  const r = await saveScraped(userId, p.data.leads.map((l) => ({
    name: l.name, phones: l.phone ? [l.phone] : [], address: l.address, website: l.website, category: l.category, rating: l.rating, reviewsCount: l.reviews, mapsUrl: l.mapsUrl,
    pincode: l.address?.match(/\b6\d{5}\b/)?.[0] ?? null, city: p.data.city ?? null, source: "capture", sourceUrl: l.mapsUrl ?? p.data.pageUrl ?? null,
  })), { addToCallQueue: p.data.addToCallQueue ?? true, autoEnrich: true, searchId: search.id });
  return cors(NextResponse.json(r));
}
