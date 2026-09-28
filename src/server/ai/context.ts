import { prisma } from "@/lib/prisma";
import type { Actor } from "@/server/session";
import { customerScope, leadScope } from "@/server/services/access";

const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : null);
const trim = (s: string | null | undefined, n = 600) => (s ? (s.length > n ? s.slice(0, n) + "…" : s) : null);

export interface CrmContext {
  subject: "lead" | "customer";
  leadId: string | null;
  customerId: string | null;
  data: Record<string, unknown>;
  missing: string[];
  daysSinceLastContact: number | null;
}

/**
 * Builds the structured fact sheet given to the AI. Only database values are included;
 * absent values are listed in `missing` so the model can call them out instead of guessing.
 */
export async function buildCrmContext(actor: Actor, ref: { leadId?: string; customerId?: string }): Promise<CrmContext | null> {
  let leadId = ref.leadId ?? null;
  let customerId = ref.customerId ?? null;

  if (customerId && !leadId) {
    const c = await prisma.customer.findFirst({ where: { id: customerId, ...customerScope(actor) } });
    if (!c) return null;
    leadId = c.leadId;
  }
  const lead = leadId
    ? await prisma.lead.findFirst({
        where: { id: leadId, ...leadScope(actor) },
        include: {
          leadSource: true,
          interestedProducts: { select: { productName: true } },
          customer: true,
        },
      })
    : null;
  if (leadId && !lead) return null;
  customerId = customerId ?? lead?.customer?.id ?? null;
  const customer = customerId ? await prisma.customer.findUnique({ where: { id: customerId } }) : null;

  const parentWhere = { OR: [...(leadId ? [{ leadId }] : []), ...(customerId ? [{ customerId }] : [])] };
  const [activities, meetings, opportunities, quotations, followups, sales] = await Promise.all([
    prisma.activity.findMany({ where: parentWhere, orderBy: { activityDate: "desc" }, take: 10 }),
    prisma.meeting.findMany({ where: parentWhere, orderBy: { meetingDate: "desc" }, take: 5 }),
    prisma.opportunity.findMany({ where: parentWhere, include: { products: { select: { productName: true } } }, take: 5 }),
    prisma.quotation.findMany({ where: parentWhere, include: { items: true }, orderBy: { quotationDate: "desc" }, take: 3 }),
    prisma.followup.findMany({ where: { ...parentWhere, status: "PENDING" }, orderBy: { followupDate: "asc" }, take: 5 }),
    prisma.sale.findMany({ where: parentWhere, include: { product: { select: { productName: true } } }, take: 10 }),
  ]);

  const data: Record<string, unknown> = {
    lead: lead
      ? {
          name: lead.name,
          companyName: lead.companyName,
          city: lead.city,
          state: lead.state,
          industry: lead.industry,
          companySize: lead.companySize,
          leadSource: lead.leadSource.name,
          leadSourceDetails: lead.leadSourceDetails,
          campaignName: lead.campaignName,
          referralName: lead.referralName,
          currentStage: lead.status,
          priority: lead.priority,
          estimatedValueINR: Number(lead.estimatedValue),
          productsOfInterest: lead.interestedProducts.map((p) => p.productName),
          notes: trim(lead.notes),
          leadCreatedOn: d(lead.createdAt),
        }
      : null,
    customer: customer
      ? {
          customerName: customer.customerName,
          companyName: customer.companyName,
          city: customer.city,
          industry: customer.industry,
          numberOfUsers: customer.numberOfUsers,
          currentSoftware: customer.currentSoftware,
          currentServer: customer.currentServer,
          currentCloudProvider: customer.currentCloudProvider,
          painPoints: trim(customer.painPoints),
          requirements: trim(customer.requirements),
          notes: trim(customer.notes),
        }
      : null,
    activities: activities.map((a) => ({ date: d(a.activityDate), type: a.activityType, subject: a.subject, description: trim(a.description, 300), status: a.status })),
    meetings: meetings.map((m) => ({
      date: d(m.meetingDate),
      type: m.meetingType,
      requirements: trim(m.customerRequirements, 300),
      objections: trim(m.objections, 300),
      productsDiscussed: m.productsDiscussed,
      nextSteps: trim(m.nextSteps, 300),
      notes: trim(m.notes, 400),
    })),
    opportunities: opportunities.map((o) => ({
      name: o.opportunityName,
      stage: o.stage,
      amountINR: Number(o.estimatedAmount),
      probability: o.probability,
      competitor: o.competitor,
      objections: o.objections,
      nextAction: o.nextAction,
      products: o.products.map((p) => p.productName),
    })),
    quotations: quotations.map((q) => ({
      number: q.quotationNumber,
      date: d(q.quotationDate),
      status: q.status,
      totalINR: Number(q.totalAmount),
      items: q.items.map((i) => ({ description: i.description, qty: Number(i.quantity), unitPriceINR: Number(i.unitPrice) })),
    })),
    pendingFollowups: followups.map((f) => ({ date: d(f.followupDate), type: f.followupType, message: f.message })),
    sales: sales.map((s) => ({ date: d(s.saleDate), product: s.product?.productName ?? null, amountINR: Number(s.amount), paymentStatus: s.paymentStatus })),
  };

  const missing: string[] = [];
  const check = (label: string, v: unknown) => {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) missing.push(label);
  };
  const L = lead;
  check("company name", L?.companyName ?? customer?.companyName);
  check("phone", L?.phone ?? customer?.phone);
  check("email", L?.email ?? customer?.email);
  check("industry", L?.industry ?? customer?.industry);
  check("company size / number of users", L?.companySize ?? customer?.numberOfUsers);
  check("current software / server / cloud provider", customer?.currentSoftware ?? customer?.currentServer ?? customer?.currentCloudProvider);
  check("stated requirements", customer?.requirements ?? meetings.find((m) => m.customerRequirements)?.customerRequirements);
  check("budget / estimated value", L && Number(L.estimatedValue) > 0 ? L.estimatedValue : null);
  check("products of interest", L?.interestedProducts);
  check("previous activities", activities);

  const last = activities.find((a) => a.status === "COMPLETED")?.activityDate;
  const daysSinceLastContact = last ? Math.floor((Date.now() - last.getTime()) / 86400000) : null;
  data.daysSinceLastContact = daysSinceLastContact;

  return { subject: customer && !lead ? "customer" : "lead", leadId, customerId, data, missing, daysSinceLastContact };
}

export async function productCatalog() {
  const products = await prisma.product.findMany({ where: { active: true }, orderBy: { productName: "asc" } });
  return products.map((p) => ({
    id: p.id,
    productName: p.productName,
    category: p.category,
    description: p.description,
    targetCustomer: p.targetCustomer,
    keyFeatures: p.keyFeatures,
    benefits: p.benefits,
    pricing: p.pricing != null ? `${Number(p.pricing)} INR (${p.pricingType ?? "pricing type not specified"})` : "Not in database",
  }));
}
