import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { getApiKey } from "@/lib/server/core";
import { savePerson } from "@/lib/server/people-import";
import { rateLimit } from "@/lib/rate-limit";

const Person = z.object({
  name: z.string().min(2).max(120), headline: z.string().max(300).nullish(), company: z.string().max(200).nullish(), location: z.string().max(200).nullish(),
  profileUrl: z.string().url().max(500).nullish(), about: z.string().max(3000).nullish(), activity: z.string().max(2000).nullish(), title: z.string().max(200).nullish(),
});
const Body = z.object({ people: z.array(Person).min(1).max(50), pageUrl: z.string().max(1000).optional() });

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "content-type, authorization");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}

export async function OPTIONS() { return cors(new NextResponse(null, { status: 204 })); }

/** Receives people the USER captured on a page they were viewing (user-initiated, visible data only). */
export async function POST(req: Request) {
  const userId = "owner";
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = await getApiKey("extension_token", userId);
  if (!expected || token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return cors(NextResponse.json({ error: "Invalid token. Copy it from LeadForge → Settings → Extension." }, { status: 401 }));
  if (!rateLimit(`ext:${userId}`, 60, 60_000)) return cors(NextResponse.json({ error: "Too many requests" }, { status: 429 }));
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return cors(NextResponse.json({ error: p.error.issues[0].message }, { status: 400 }));
  const results = [];
  for (const person of p.data.people) results.push({ name: person.name, ...(await savePerson(userId, person, "extension")) });
  return cors(NextResponse.json({ saved: results.filter((r) => r.ok).length, results }));
}
