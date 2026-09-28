export interface QuoteLineInput {
  quantity: number;
  unitPrice: number;
  discount?: number; // absolute amount per line
}

export interface QuoteTotals {
  lines: { total: number }[];
  subtotal: number;
  discountAmount: number;
  taxable: number;
  gstPercentage: number;
  gstAmount: number;
  totalAmount: number;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Deterministic quotation calculation. Prices come only from the caller
 * (database product price or manual user entry) — nothing here alters them.
 */
export function calculateQuotation(
  items: QuoteLineInput[],
  gstPercentage: number,
  overallDiscount = 0,
): QuoteTotals {
  if (gstPercentage < 0 || gstPercentage > 100) throw new Error("Invalid GST percentage");
  const lines = items.map((i) => {
    if (i.quantity <= 0) throw new Error("Quantity must be positive");
    if (i.unitPrice < 0) throw new Error("Unit price cannot be negative");
    const gross = i.quantity * i.unitPrice;
    const d = i.discount ?? 0;
    if (d < 0 || d > gross) throw new Error("Invalid line discount");
    return { total: round2(gross - d) };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  if (overallDiscount < 0 || overallDiscount > subtotal) throw new Error("Invalid discount");
  const taxable = round2(subtotal - overallDiscount);
  const gstAmount = round2((taxable * gstPercentage) / 100);
  return {
    lines,
    subtotal,
    discountAmount: round2(overallDiscount),
    taxable,
    gstPercentage,
    gstAmount,
    totalAmount: round2(taxable + gstAmount),
  };
}
