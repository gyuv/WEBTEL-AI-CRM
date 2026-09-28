"use client";

import { useMemo, useState, useTransition } from "react";
import { saveQuotationAction } from "@/app/actions/crm";
import { calculateQuotation } from "@/lib/quotation-math";
import { inr } from "@/lib/format";
import { quotationStatusValues } from "@/lib/validators";
import { Button, Card, Field, Input, Select, Table, Td, Textarea, Th } from "@/components/ui";

interface Item { productId: string; description: string; quantity: string; unitPrice: string; discount: string }
export interface QuotationFormValues {
  id?: string;
  leadId?: string;
  customerId?: string;
  quotationDate: string;
  validUntil: string;
  gstPercentage: string;
  discountAmount: string;
  status: string;
  termsAndConditions: string;
  notes: string;
  items: Item[];
}

export function QuotationForm({ initial, products, partyLabel }: { initial: QuotationFormValues; products: { id: string; productName: string; pricing: number | null; description: string | null }[]; partyLabel: string }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof QuotationFormValues>(k: K, val: QuotationFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const setItem = (i: number, patch: Partial<Item>) => setV((p) => ({ ...p, items: p.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));

  const totals = useMemo(() => {
    try {
      return calculateQuotation(
        v.items.map((i) => ({ quantity: Number(i.quantity) || 0.0001, unitPrice: Number(i.unitPrice) || 0, discount: Number(i.discount) || 0 })),
        Number(v.gstPercentage) || 0,
        Number(v.discountAmount) || 0,
      );
    } catch (e) {
      return e instanceof Error ? e.message : "Invalid";
    }
  }, [v]);

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await saveQuotationAction(v.id ?? null, {
        ...v,
        items: v.items.map((i) => ({ ...i, productId: i.productId || undefined })),
      });
      if (!res.ok) setError(res.error);
      else if (res.redirect) window.location.href = res.redirect;
    });

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-4 md:grid-cols-5">
        <Field label="For"><div className="pt-2 text-sm font-medium">{partyLabel}</div></Field>
        <Field label="Quotation Date"><Input type="date" value={v.quotationDate} onChange={(e) => set("quotationDate", e.target.value)} /></Field>
        <Field label="Valid Until"><Input type="date" value={v.validUntil} onChange={(e) => set("validUntil", e.target.value)} /></Field>
        <Field label="GST %"><Input inputMode="decimal" value={v.gstPercentage} onChange={(e) => set("gstPercentage", e.target.value)} /></Field>
        <Field label="Status"><Select value={v.status} onChange={(e) => set("status", e.target.value)}>{quotationStatusValues.map((s) => <option key={s}>{s}</option>)}</Select></Field>
      </Card>
      <Card>
        <Table>
          <thead><tr><Th className="w-48">Product</Th><Th>Description</Th><Th className="w-20">Qty</Th><Th className="w-32">Unit Price ₹</Th><Th className="w-28">Discount ₹</Th><Th className="w-32 text-right">Line Total</Th><Th /></tr></thead>
          <tbody>
            {v.items.map((it, i) => (
              <tr key={i}>
                <Td>
                  <Select
                    value={it.productId}
                    onChange={(e) => {
                      const p = products.find((x) => x.id === e.target.value);
                      // Price is copied from the product database; the user may edit it manually.
                      setItem(i, { productId: e.target.value, description: p?.productName ?? it.description, unitPrice: p?.pricing != null ? String(p.pricing) : it.unitPrice });
                    }}
                  >
                    <option value="">Custom item</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.productName}</option>)}
                  </Select>
                </Td>
                <Td><Input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} /></Td>
                <Td><Input inputMode="decimal" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} /></Td>
                <Td><Input inputMode="decimal" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} /></Td>
                <Td><Input inputMode="decimal" value={it.discount} onChange={(e) => setItem(i, { discount: e.target.value })} /></Td>
                <Td className="text-right tabular-nums">{typeof totals === "string" ? "—" : inr(totals.lines[i]?.total)}</Td>
                <Td><Button variant="ghost" size="sm" disabled={v.items.length === 1} onClick={() => set("items", v.items.filter((_, j) => j !== i))}>✕</Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="flex flex-wrap items-start justify-between gap-4 p-4">
          <Button variant="outline" size="sm" onClick={() => set("items", [...v.items, { productId: "", description: "", quantity: "1", unitPrice: "", discount: "0" }])}>+ Add item</Button>
          <div className="w-72 space-y-1 text-sm">
            {typeof totals === "string" ? (
              <p className="text-destructive">{totals}</p>
            ) : (
              <>
                <div className="flex justify-between"><span>Subtotal</span><span>{inr(totals.subtotal)}</span></div>
                <div className="flex items-center justify-between gap-2"><span>Overall discount ₹</span><Input className="h-7 w-28 text-right" value={v.discountAmount} onChange={(e) => set("discountAmount", e.target.value)} /></div>
                <div className="flex justify-between"><span>Taxable value</span><span>{inr(totals.taxable)}</span></div>
                <div className="flex justify-between"><span>GST @ {totals.gstPercentage}%</span><span>{inr(totals.gstAmount)}</span></div>
                <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>Total</span><span>{inr(totals.totalAmount)}</span></div>
              </>
            )}
          </div>
        </div>
      </Card>
      <Card className="grid gap-3 p-4 md:grid-cols-2">
        <Field label="Terms & Conditions"><Textarea rows={4} value={v.termsAndConditions} onChange={(e) => set("termsAndConditions", e.target.value)} /></Field>
        <Field label="Notes"><Textarea rows={4} value={v.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </Card>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={submit} disabled={pending || typeof totals === "string"}>{pending ? "Saving…" : v.id ? "Update Quotation" : "Create Quotation"}</Button>
    </div>
  );
}
