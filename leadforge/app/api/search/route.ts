import { NextResponse } from "next/server";
import { and, eq, ilike, or } from "drizzle-orm";
import { ctx } from "@/lib/server/core";
import { schema } from "@/lib/db/client";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const { db, userId } = await ctx();
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = await db.select({ id: schema.leads.id, name: schema.leads.name, city: schema.leads.city }).from(schema.leads)
    .where(and(eq(schema.leads.userId, userId), or(ilike(schema.leads.name, like), ilike(schema.leads.domain, like), ilike(schema.leads.area, like)))).limit(8);
  return NextResponse.json(rows);
}
