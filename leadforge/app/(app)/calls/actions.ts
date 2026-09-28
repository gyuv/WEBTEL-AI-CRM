"use server";
import { and, eq } from "drizzle-orm";
import { ctx } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { generateAssets } from "@/lib/ai/engine";

export async function generateScriptsIfMissing(leadId: string) {
  const { db, userId } = await ctx();
  const [a] = await db.select({ id: schema.leadInsights.id }).from(schema.leadInsights).where(and(eq(schema.leadInsights.leadId, leadId), eq(schema.leadInsights.kind, "assets")));
  if (a) return false;
  await generateAssets(userId, leadId);
  return true;
}
