import { notFound } from "next/navigation";
import { requirePageActor } from "@/server/session";
import { getQuotation } from "@/server/services/quotations";
import { quotationProducts } from "@/server/quotation-page-data";
import { QuotationForm } from "@/components/quotation-form";
import { PageHeader } from "@/components/ui";

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;
  const q = await getQuotation(actor, id);
  if (!q) notFound();
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "");
  return (
    <div className="max-w-6xl">
      <PageHeader title={`Edit ${q.quotationNumber}`} />
      <QuotationForm
        products={await quotationProducts()}
        partyLabel={[q.lead?.name ?? q.customer?.customerName, q.lead?.companyName ?? q.customer?.companyName].filter(Boolean).join(" — ")}
        initial={{
          id: q.id,
          leadId: q.leadId ?? undefined,
          customerId: q.customerId ?? undefined,
          quotationDate: d(q.quotationDate),
          validUntil: d(q.validUntil),
          gstPercentage: q.gstPercentage.toString(),
          discountAmount: q.discountAmount.toString(),
          status: q.status,
          termsAndConditions: q.termsAndConditions ?? "",
          notes: q.notes ?? "",
          items: q.items.map((i) => ({ productId: i.productId ?? "", description: i.description, quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString(), discount: i.discount.toString() })),
        }}
      />
    </div>
  );
}
