import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageActor } from "@/server/session";
import { getQuotation } from "@/server/services/quotations";
import { getSetting } from "@/server/services/settings";
import { fmtDate, inr } from "@/lib/format";
import { quotationStatusValues } from "@/lib/validators";
import { ActionForm } from "@/components/action-form";
import { PrintButton } from "@/components/print-button";
import { setQuotationStatusAction } from "@/app/actions/crm";
import { Badge, buttonVariants, Card, Select, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;
  const q = await getQuotation(actor, id);
  if (!q) notFound();
  const company = await getSetting("company");
  const party = q.customer ?? null;
  return (
    <div className="max-w-4xl space-y-4">
      <div className="no-print flex flex-wrap items-end gap-2">
        <Link href={`/quotations/${q.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>Edit</Link>
        <PrintButton />
        <ActionForm action={setQuotationStatusAction.bind(null, q.id)} submitLabel="Update status" resetOnSuccess={false} className="flex items-end gap-2">
          <Select name="status" defaultValue={q.status} className="w-36">{quotationStatusValues.map((s) => <option key={s}>{s}</option>)}</Select>
        </ActionForm>
      </div>
      <Card className="p-8">
        <div className="flex justify-between">
          <div>
            <div className="text-lg font-bold">{company.name}</div>
            <div className="whitespace-pre-wrap text-xs text-muted-foreground">{company.address}</div>
            <div className="text-xs text-muted-foreground">{[company.phone, company.email, company.website].filter(Boolean).join(" · ")}</div>
            {company.gstin && <div className="text-xs">GSTIN: {company.gstin}</div>}
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold">QUOTATION</div>
            <div className="text-sm">{q.quotationNumber}</div>
            <div className="text-xs">Date: {fmtDate(q.quotationDate)}</div>
            <div className="text-xs">Valid until: {fmtDate(q.validUntil)}</div>
            <Badge>{q.status}</Badge>
          </div>
        </div>
        <div className="mt-6 text-sm">
          <div className="text-xs uppercase text-muted-foreground">To</div>
          <div className="font-medium">{party?.customerName ?? q.lead?.name}</div>
          <div>{party?.companyName ?? q.lead?.companyName}</div>
          <div className="text-xs">{party?.address} {party?.city ?? q.lead?.city}</div>
          <div className="text-xs">{party?.phone ?? q.lead?.phone} {party?.email ?? q.lead?.email}</div>
        </div>
        <div className="mt-6">
          <Table>
            <thead><tr><Th>#</Th><Th>Description</Th><Th className="text-right">Qty</Th><Th className="text-right">Unit Price</Th><Th className="text-right">Discount</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {q.items.map((it, i) => (
                <tr key={it.id}><Td>{i + 1}</Td><Td>{it.description}</Td><Td className="text-right">{it.quantity.toString()}</Td><Td className="text-right">{inr(it.unitPrice.toString())}</Td><Td className="text-right">{inr(it.discount.toString())}</Td><Td className="text-right">{inr(it.total.toString())}</Td></tr>
              ))}
            </tbody>
          </Table>
        </div>
        <div className="ml-auto mt-4 w-64 space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{inr(q.subtotal.toString())}</span></div>
          <div className="flex justify-between"><span>Discount</span><span>- {inr(q.discountAmount.toString())}</span></div>
          <div className="flex justify-between"><span>GST @ {q.gstPercentage.toString()}%</span><span>{inr(q.gstAmount.toString())}</span></div>
          <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span>{inr(q.totalAmount.toString())}</span></div>
        </div>
        {q.termsAndConditions && <div className="mt-6 whitespace-pre-wrap text-xs"><b>Terms & Conditions</b><br />{q.termsAndConditions}</div>}
        {q.notes && <div className="mt-3 whitespace-pre-wrap text-xs"><b>Notes</b><br />{q.notes}</div>}
      </Card>
    </div>
  );
}
