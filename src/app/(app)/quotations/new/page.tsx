import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { customerScope, leadScope } from "@/server/services/access";
import { getSetting } from "@/server/services/settings";
import { quotationProducts } from "@/server/quotation-page-data";
import { QuotationForm } from "@/components/quotation-form";
import { PageHeader } from "@/components/ui";

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ leadId?: string; customerId?: string }> }) {
  const actor = await requirePageActor();
  const { leadId, customerId } = await searchParams;
  const lead = leadId ? await prisma.lead.findFirst({ where: { id: leadId, ...leadScope(actor) } }) : null;
  const customer = customerId ? await prisma.customer.findFirst({ where: { id: customerId, ...customerScope(actor) } }) : null;
  if (!lead && !customer) notFound();
  const [qs, gst, products] = await Promise.all([getSetting("quotation"), getSetting("gst"), quotationProducts()]);
  const today = new Date();
  return (
    <div className="max-w-6xl">
      <PageHeader title="New Quotation" description="Prices come from the product database or your manual entry. AI never changes quotation prices." />
      <QuotationForm
        products={products}
        partyLabel={[lead?.name ?? customer?.customerName, lead?.companyName ?? customer?.companyName].filter(Boolean).join(" — ")}
        initial={{
          leadId: lead?.id,
          customerId: customer?.id,
          quotationDate: today.toISOString().slice(0, 10),
          validUntil: new Date(today.getTime() + qs.validityDays * 86400000).toISOString().slice(0, 10),
          gstPercentage: String(gst.defaultPercentage),
          discountAmount: "0",
          status: "DRAFT",
          termsAndConditions: qs.terms,
          notes: "",
          items: [{ productId: "", description: "", quantity: "1", unitPrice: "", discount: "0" }],
        }}
      />
    </div>
  );
}
