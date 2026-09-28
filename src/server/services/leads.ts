import type { LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextHighestRank } from "@/lib/funnel";
import { leadFilterSchema, leadSchema, type LeadFilter } from "@/lib/validators";
import { AuthError, type Actor } from "@/server/session";
import { assertLeadAccess, leadScope } from "./access";

export function buildLeadWhere(actor: Actor, f: Partial<LeadFilter>): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [leadScope(actor)];
  if (f.q) {
    const q = f.q;
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { companyName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { email: { contains: q, mode: "insensitive" } },
        { campaignName: { contains: q, mode: "insensitive" } },
        { leadSourceDetails: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (f.status) and.push({ status: f.status });
  if (f.priority) and.push({ priority: f.priority });
  if (f.city) and.push({ city: { equals: f.city, mode: "insensitive" } });
  if (f.leadSourceId) and.push({ leadSourceId: f.leadSourceId });
  if (f.assignedUserId) and.push({ assignedUserId: f.assignedUserId === "unassigned" ? null : f.assignedUserId });
  if (f.campaign) and.push({ campaignName: { contains: f.campaign, mode: "insensitive" } });
  if (f.productId)
    and.push({
      OR: [
        { interestedProducts: { some: { id: f.productId } } },
        { sales: { some: { productId: f.productId } } },
        { quotations: { some: { items: { some: { productId: f.productId } } } } },
      ],
    });
  if (f.from || f.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (f.from) createdAt.gte = f.from;
    if (f.to) createdAt.lt = new Date(f.to.getTime() + 86400000);
    and.push({ createdAt });
  }
  return { AND: and };
}

export async function listLeads(actor: Actor, raw: Record<string, unknown>) {
  const f = leadFilterSchema.parse(raw);
  const where = buildLeadWhere(actor, f);
  const orderBy = { [f.sort ?? "createdAt"]: f.dir ?? "desc" } as Prisma.LeadOrderByWithRelationInput;
  const [total, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy,
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: { leadSource: true, assignedUser: { select: { id: true, name: true } } },
    }),
  ]);
  return { total, rows, page: f.page, pageSize: f.pageSize, pages: Math.max(1, Math.ceil(total / f.pageSize)) };
}

async function validateRefs(leadSourceId: string, assignedUserId: string | undefined, isNew: boolean, currentSourceId?: string) {
  const src = await prisma.leadSource.findUnique({ where: { id: leadSourceId } });
  if (!src) throw new Error("Lead source does not exist");
  // Disabled sources cannot be chosen for new leads, but existing leads keep their historical source.
  if (!src.active && (isNew || currentSourceId !== leadSourceId)) throw new Error("Lead source is disabled");
  if (assignedUserId) {
    const u = await prisma.user.findUnique({ where: { id: assignedUserId } });
    if (!u || !u.active) throw new Error("Assigned user does not exist");
  }
}

export async function createLead(actor: Actor, raw: unknown) {
  const data = leadSchema.parse(raw);
  // Non-admins may only assign to themselves.
  const assignedUserId = actor.role === "ADMIN" ? data.assignedUserId : actor.id;
  await validateRefs(data.leadSourceId, assignedUserId, true);
  const { interestedProductIds, ...rest } = data;
  return prisma.lead.create({
    data: {
      ...rest,
      assignedUserId: assignedUserId ?? null,
      highestStageRank: nextHighestRank(0, data.status),
      interestedProducts: { connect: interestedProductIds.map((id) => ({ id })) },
      statusHistory: { create: { toStatus: data.status, changedById: actor.id } },
    },
  });
}

export async function updateLead(actor: Actor, id: string, raw: unknown) {
  await assertLeadAccess(actor, id);
  const data = leadSchema.parse(raw);
  const existing = await prisma.lead.findUniqueOrThrow({ where: { id } });
  const assignedUserId = actor.role === "ADMIN" ? data.assignedUserId : existing.assignedUserId ?? actor.id;
  await validateRefs(data.leadSourceId, assignedUserId ?? undefined, false, existing.leadSourceId);
  const { interestedProductIds, ...rest } = data;
  return prisma.lead.update({
    where: { id },
    data: {
      ...rest,
      assignedUserId: assignedUserId ?? null,
      highestStageRank: nextHighestRank(existing.highestStageRank, data.status),
      interestedProducts: { set: interestedProductIds.map((pid) => ({ id: pid })) },
      ...(existing.status !== data.status
        ? { statusHistory: { create: { fromStatus: existing.status, toStatus: data.status, changedById: actor.id } } }
        : {}),
    },
  });
}

export async function setLeadStatus(actor: Actor, id: string, status: LeadStatus) {
  await assertLeadAccess(actor, id);
  const existing = await prisma.lead.findUniqueOrThrow({ where: { id } });
  if (existing.status === status) return existing;
  return prisma.lead.update({
    where: { id },
    data: {
      status,
      highestStageRank: nextHighestRank(existing.highestStageRank, status),
      statusHistory: { create: { fromStatus: existing.status, toStatus: status, changedById: actor.id } },
    },
  });
}

/** Raise the funnel rank without regressing current status (e.g. when a quotation is sent). */
export async function bumpLeadStage(leadId: string, status: LeadStatus, actorId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  const newRank = nextHighestRank(lead.highestStageRank, status);
  const statusRank = nextHighestRank(0, lead.status);
  const shouldMoveStatus = lead.status !== "WON" && lead.status !== "LOST" && statusRank < nextHighestRank(0, status);
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      highestStageRank: newRank,
      ...(shouldMoveStatus
        ? { status, statusHistory: { create: { fromStatus: lead.status, toStatus: status, changedById: actorId } } }
        : {}),
    },
  });
}

export async function assignLead(actor: Actor, id: string, userId: string | null) {
  if (actor.role !== "ADMIN") throw new AuthError(403, "Only admins can reassign leads");
  if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new Error("User not found");
  }
  return prisma.lead.update({ where: { id }, data: { assignedUserId: userId } });
}

export async function deleteLead(actor: Actor, id: string) {
  await assertLeadAccess(actor, id);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id }, include: { customer: true, _count: { select: { sales: true } } } });
  if (lead.customer || lead._count.sales > 0)
    throw new Error("This lead has a customer or sales linked. Mark it as LOST instead to preserve sales history.");
  await prisma.lead.delete({ where: { id } });
}

/**
 * Converts a lead into a customer. The customer keeps a link to the lead, so the
 * original lead source, campaign, referral details and creation date are preserved.
 */
export async function convertLeadToCustomer(actor: Actor, leadId: string, extra: { address?: string; numberOfUsers?: number; requirements?: string } = {}) {
  await assertLeadAccess(actor, leadId);
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId }, include: { customer: true } });
    if (lead.customer) return lead.customer;
    const customer = await tx.customer.create({
      data: {
        leadId: lead.id,
        customerName: lead.name,
        companyName: lead.companyName,
        phone: lead.phone,
        email: lead.email,
        city: lead.city,
        industry: lead.industry,
        address: extra.address,
        numberOfUsers: extra.numberOfUsers,
        requirements: extra.requirements,
        notes: lead.notes,
        isDemo: lead.isDemo,
      },
    });
    if (lead.status !== "WON") {
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          status: "WON",
          highestStageRank: nextHighestRank(lead.highestStageRank, "WON"),
          statusHistory: { create: { fromStatus: lead.status, toStatus: "WON", changedById: actor.id } },
        },
      });
    }
    // Attach existing records to the new customer so history stays together.
    await tx.sale.updateMany({ where: { leadId: lead.id, customerId: null }, data: { customerId: customer.id } });
    await tx.quotation.updateMany({ where: { leadId: lead.id, customerId: null }, data: { customerId: customer.id } });
    return customer;
  });
}

export async function getLeadDetail(actor: Actor, id: string) {
  return prisma.lead.findFirst({
    where: { id, ...leadScope(actor) },
    include: {
      leadSource: true,
      assignedUser: { select: { id: true, name: true } },
      customer: true,
      interestedProducts: true,
      activities: { orderBy: { activityDate: "desc" } },
      meetings: { orderBy: { meetingDate: "desc" } },
      followups: { orderBy: { followupDate: "asc" } },
      opportunities: { include: { products: true }, orderBy: { createdAt: "desc" } },
      quotations: { orderBy: { quotationDate: "desc" } },
      sales: { include: { product: true }, orderBy: { saleDate: "desc" } },
      statusHistory: { orderBy: { changedAt: "desc" }, include: { changedBy: { select: { name: true } } } },
      aiInteractions: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
}
