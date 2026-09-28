import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError, type Actor } from "@/server/session";

/**
 * Row-level access: ADMIN sees everything; USER sees leads assigned to them
 * plus unassigned leads, and records hanging off those leads.
 */
export function leadScope(actor: Actor): Prisma.LeadWhereInput {
  if (actor.role === "ADMIN") return {};
  return { OR: [{ assignedUserId: actor.id }, { assignedUserId: null }] };
}

export function customerScope(actor: Actor): Prisma.CustomerWhereInput {
  if (actor.role === "ADMIN") return {};
  return { OR: [{ leadId: null }, { lead: leadScope(actor) }] };
}

/** Scope for records with optional leadId/customerId (activities, quotations, sales, ...). */
export function childScope(actor: Actor) {
  if (actor.role === "ADMIN") return {};
  return {
    OR: [{ lead: leadScope(actor) }, { leadId: null, customer: customerScope(actor) }],
  };
}

export async function assertLeadAccess(actor: Actor, leadId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, ...leadScope(actor) }, select: { id: true } });
  if (!lead) throw new AuthError(403, "Lead not found or access denied");
}

export async function assertCustomerAccess(actor: Actor, customerId: string) {
  const c = await prisma.customer.findFirst({ where: { id: customerId, ...customerScope(actor) }, select: { id: true } });
  if (!c) throw new AuthError(403, "Customer not found or access denied");
}

export async function assertParentAccess(actor: Actor, ref: { leadId?: string | null; customerId?: string | null }) {
  if (ref.leadId) await assertLeadAccess(actor, ref.leadId);
  if (ref.customerId) await assertCustomerAccess(actor, ref.customerId);
}
