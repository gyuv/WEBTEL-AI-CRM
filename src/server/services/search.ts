import { prisma } from "@/lib/prisma";
import type { Actor } from "@/server/session";
import { childScope, customerScope, leadScope } from "./access";

export interface SearchHit {
  type: "Lead" | "Customer" | "Product" | "Opportunity" | "Quotation" | "Lead Source" | "Campaign";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export async function globalSearch(actor: Actor, raw: string): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 100);
  if (q.length < 2) return [];
  const ci = { contains: q, mode: "insensitive" as const };
  const [leads, customers, products, opps, quotes, sources, campaigns] = await Promise.all([
    prisma.lead.findMany({
      where: { AND: [leadScope(actor), { OR: [{ name: ci }, { companyName: ci }, { phone: { contains: q } }, { email: ci }] }] },
      take: 10,
      include: { leadSource: true },
    }),
    prisma.customer.findMany({
      where: { AND: [customerScope(actor), { OR: [{ customerName: ci }, { companyName: ci }, { phone: { contains: q } }, { email: ci }] }] },
      take: 10,
    }),
    prisma.product.findMany({ where: { OR: [{ productName: ci }, { category: ci }] }, take: 5 }),
    prisma.opportunity.findMany({ where: { AND: [childScope(actor), { OR: [{ opportunityName: ci }, { competitor: ci }] }] }, take: 5 }),
    prisma.quotation.findMany({ where: { AND: [childScope(actor), { quotationNumber: ci }] }, take: 5 }),
    prisma.leadSource.findMany({ where: { name: ci }, take: 5 }),
    prisma.lead.findMany({
      where: { AND: [leadScope(actor), { campaignName: ci }] },
      distinct: ["campaignName"],
      select: { campaignName: true },
      take: 5,
    }),
  ]);
  return [
    ...leads.map((l) => ({ type: "Lead" as const, id: l.id, title: l.name, subtitle: [l.companyName, l.phone, l.leadSource.name].filter(Boolean).join(" · "), href: `/leads/${l.id}` })),
    ...customers.map((c) => ({ type: "Customer" as const, id: c.id, title: c.customerName, subtitle: [c.companyName, c.phone].filter(Boolean).join(" · "), href: `/customers/${c.id}` })),
    ...products.map((p) => ({ type: "Product" as const, id: p.id, title: p.productName, subtitle: p.category ?? undefined, href: `/settings/products` })),
    ...opps.map((o) => ({ type: "Opportunity" as const, id: o.id, title: o.opportunityName, subtitle: o.stage, href: `/opportunities` })),
    ...quotes.map((q2) => ({ type: "Quotation" as const, id: q2.id, title: q2.quotationNumber, subtitle: q2.status, href: `/quotations/${q2.id}` })),
    ...sources.map((s) => ({ type: "Lead Source" as const, id: s.id, title: s.name, subtitle: "View leads from this source", href: `/leads?leadSourceId=${s.id}` })),
    ...campaigns
      .filter((c) => c.campaignName)
      .map((c) => ({ type: "Campaign" as const, id: c.campaignName!, title: c.campaignName!, subtitle: "View leads in this campaign", href: `/leads?campaign=${encodeURIComponent(c.campaignName!)}` })),
  ];
}
