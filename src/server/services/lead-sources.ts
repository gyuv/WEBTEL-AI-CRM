import { prisma } from "@/lib/prisma";
import { leadSourceSchema } from "@/lib/validators";
import { assertAdmin, type Actor } from "@/server/session";

export async function listLeadSources(opts: { activeOnly?: boolean } = {}) {
  return prisma.leadSource.findMany({
    where: opts.activeOnly ? { active: true } : {},
    orderBy: { name: "asc" },
    include: { _count: { select: { leads: true } } },
  });
}

export async function createLeadSource(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const data = leadSourceSchema.parse(raw);
  const dup = await prisma.leadSource.findFirst({ where: { name: { equals: data.name, mode: "insensitive" } } });
  if (dup) throw new Error("A lead source with this name already exists");
  return prisma.leadSource.create({ data });
}

export async function updateLeadSource(actor: Actor, id: string, raw: unknown) {
  assertAdmin(actor);
  const data = leadSourceSchema.parse(raw);
  const dup = await prisma.leadSource.findFirst({ where: { name: { equals: data.name, mode: "insensitive" }, NOT: { id } } });
  if (dup) throw new Error("A lead source with this name already exists");
  return prisma.leadSource.update({ where: { id }, data });
}

export async function setLeadSourceActive(actor: Actor, id: string, active: boolean) {
  assertAdmin(actor);
  return prisma.leadSource.update({ where: { id }, data: { active } });
}

/** Deletes only unused sources; sources with history must be disabled instead. */
export async function deleteLeadSource(actor: Actor, id: string) {
  assertAdmin(actor);
  const used = await prisma.lead.count({ where: { leadSourceId: id } });
  if (used > 0) throw new Error(`This source is used by ${used} lead(s). Disable it instead to preserve history.`);
  await prisma.leadSource.delete({ where: { id } });
}
