import { prisma } from "@/lib/prisma";
import {
  activitySchema,
  customerSchema,
  followupSchema,
  meetingSchema,
  opportunitySchema,
  saleSchema,
  productSchema,
} from "@/lib/validators";
import { assertAdmin, type Actor } from "@/server/session";
import { assertCustomerAccess, assertLeadAccess, assertParentAccess, childScope, customerScope } from "./access";
import { bumpLeadStage } from "./leads";

// ---------- Customers ----------
export async function createCustomer(actor: Actor, raw: unknown) {
  const data = customerSchema.parse(raw);
  if (data.leadId) {
    await assertLeadAccess(actor, data.leadId);
    const existing = await prisma.customer.findUnique({ where: { leadId: data.leadId } });
    if (existing) throw new Error("This lead is already linked to a customer");
  }
  return prisma.customer.create({ data });
}

export async function updateCustomer(actor: Actor, id: string, raw: unknown) {
  await assertCustomerAccess(actor, id);
  const { leadId: _ignored, ...data } = customerSchema.parse(raw); // lead link (source history) is immutable
  void _ignored;
  return prisma.customer.update({ where: { id }, data });
}

export async function deleteCustomer(actor: Actor, id: string) {
  assertAdmin(actor);
  const sales = await prisma.sale.count({ where: { customerId: id } });
  if (sales) throw new Error("Customer has sales records and cannot be deleted");
  await prisma.customer.delete({ where: { id } });
}

export async function listCustomers(actor: Actor, q?: string) {
  return prisma.customer.findMany({
    where: {
      AND: [
        customerScope(actor),
        q
          ? {
              OR: [
                { customerName: { contains: q, mode: "insensitive" } },
                { companyName: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    include: { lead: { include: { leadSource: true } }, _count: { select: { sales: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

// ---------- Activities ----------
export async function createActivity(actor: Actor, raw: unknown) {
  const data = activitySchema.parse(raw);
  await assertParentAccess(actor, data);
  const activity = await prisma.activity.create({ data });
  if (data.nextFollowupDate) {
    await prisma.followup.create({
      data: {
        leadId: data.leadId,
        customerId: data.customerId,
        followupDate: data.nextFollowupDate,
        followupType: "FOLLOW_UP",
        message: `Follow-up after: ${data.subject}`,
      },
    });
  }
  if (data.leadId && data.status === "COMPLETED" && data.activityType !== "NOTE") {
    await bumpLeadStage(data.leadId, data.activityType === "DEMO" ? "DEMO_COMPLETED" : "CONTACTED", actor.id);
  }
  return activity;
}

// ---------- Meetings ----------
export async function createMeeting(actor: Actor, raw: unknown) {
  const data = meetingSchema.parse(raw);
  await assertParentAccess(actor, data);
  const m = await prisma.meeting.create({ data });
  if (data.followupDate) {
    await prisma.followup.create({
      data: { leadId: data.leadId, customerId: data.customerId, followupDate: data.followupDate, followupType: "FOLLOW_UP", message: data.nextSteps ?? "Meeting follow-up" },
    });
  }
  if (data.leadId) {
    const isDemo = data.meetingType.toUpperCase() === "DEMO";
    const inFuture = data.meetingDate > new Date();
    await bumpLeadStage(data.leadId, isDemo ? (inFuture ? "DEMO_SCHEDULED" : "DEMO_COMPLETED") : "CONTACTED", actor.id);
  }
  return m;
}

// ---------- Follow-ups ----------
export async function createFollowup(actor: Actor, raw: unknown) {
  const data = followupSchema.parse(raw);
  await assertParentAccess(actor, data);
  return prisma.followup.create({ data });
}

export async function setFollowupStatus(actor: Actor, id: string, status: "PENDING" | "COMPLETED" | "CANCELLED") {
  const f = await prisma.followup.findFirst({ where: { id, ...childScope(actor) } });
  if (!f) throw new Error("Follow-up not found");
  return prisma.followup.update({
    where: { id },
    data: { status, completedAt: status === "COMPLETED" ? new Date() : null },
  });
}

export type FollowupBucket = "overdue" | "today" | "upcoming" | "completed" | "all";

export function followupBucketWhere(bucket: FollowupBucket, now = new Date()) {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  switch (bucket) {
    case "overdue":
      return { status: "PENDING" as const, followupDate: { lt: dayStart } };
    case "today":
      return { status: "PENDING" as const, followupDate: { gte: dayStart, lt: dayEnd } };
    case "upcoming":
      return { status: "PENDING" as const, followupDate: { gte: dayEnd } };
    case "completed":
      return { status: "COMPLETED" as const };
    default:
      return {};
  }
}

export async function listFollowups(actor: Actor, bucket: FollowupBucket = "all") {
  return prisma.followup.findMany({
    where: { AND: [childScope(actor), followupBucketWhere(bucket)] },
    include: { lead: { select: { id: true, name: true, companyName: true, phone: true } }, customer: { select: { id: true, customerName: true, companyName: true } } },
    orderBy: { followupDate: bucket === "completed" ? "desc" : "asc" },
    take: 300,
  });
}

// ---------- Opportunities ----------
export async function createOpportunity(actor: Actor, raw: unknown) {
  const { productIds, ...data } = opportunitySchema.parse(raw);
  await assertParentAccess(actor, data);
  return prisma.opportunity.create({ data: { ...data, products: { connect: productIds.map((id) => ({ id })) } } });
}

export async function updateOpportunity(actor: Actor, id: string, raw: unknown) {
  const existing = await prisma.opportunity.findFirst({ where: { id, ...childScope(actor) } });
  if (!existing) throw new Error("Opportunity not found");
  const { productIds, ...data } = opportunitySchema.parse(raw);
  await assertParentAccess(actor, data);
  return prisma.opportunity.update({ where: { id }, data: { ...data, products: { set: productIds.map((pid) => ({ id: pid })) } } });
}

export async function setOpportunityStage(actor: Actor, id: string, stage: (typeof import("@/lib/validators").opportunityStageValues)[number]) {
  const existing = await prisma.opportunity.findFirst({ where: { id, ...childScope(actor) } });
  if (!existing) throw new Error("Opportunity not found");
  const probability = stage === "CLOSED_WON" ? 100 : stage === "CLOSED_LOST" ? 0 : existing.probability;
  return prisma.opportunity.update({ where: { id }, data: { stage, probability } });
}

// ---------- Sales ----------
export async function createSale(actor: Actor, raw: unknown) {
  const data = saleSchema.parse(raw);
  await assertParentAccess(actor, data);
  let leadId = data.leadId;
  let customerId = data.customerId;
  // Keep the lead link so source-wise revenue analysis works for customer sales.
  if (customerId && !leadId) {
    const c = await prisma.customer.findUnique({ where: { id: customerId } });
    leadId = c?.leadId ?? undefined;
  }
  if (leadId && !customerId) {
    const c = await prisma.customer.findUnique({ where: { leadId } });
    customerId = c?.id;
  }
  if (data.productId) {
    const p = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!p) throw new Error("Product not found");
  }
  const sale = await prisma.sale.create({ data: { ...data, leadId, customerId } });
  if (leadId) await bumpLeadStage(leadId, "WON", actor.id);
  return sale;
}

// ---------- Products ----------
export async function createProduct(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  return prisma.product.create({ data: productSchema.parse(raw) });
}

export async function updateProduct(actor: Actor, id: string, raw: unknown) {
  assertAdmin(actor);
  return prisma.product.update({ where: { id }, data: productSchema.parse(raw) });
}
