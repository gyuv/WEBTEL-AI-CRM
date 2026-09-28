import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/server/session";

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE ai_interactions, sales, quotation_items, quotations, followups, meetings, activities, opportunities, lead_status_history, customers, leads, lead_sources, products, users, settings, message_templates RESTART IDENTITY CASCADE`,
  );
}

export async function makeUser(role: "USER" | "ADMIN" = "USER", email = `${role.toLowerCase()}${Math.random()}@t.test`): Promise<Actor> {
  const u = await prisma.user.create({ data: { name: role, email, role, passwordHash: await bcrypt.hash("Password1!", 4) } });
  return { id: u.id, role: u.role, name: u.name };
}

export async function makeSources(...names: string[]) {
  const out: Record<string, string> = {};
  for (const name of names) out[name] = (await prisma.leadSource.create({ data: { name } })).id;
  return out;
}

export function setSession(a: Actor | null) {
  (globalThis as { __testSession?: unknown }).__testSession = a ? { user: { id: a.id, role: a.role, name: a.name } } : null;
}
