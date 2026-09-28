import { describe, expect, it } from "vitest";
import { calculateQuotation } from "@/lib/quotation-math";
import { nextHighestRank, pct } from "@/lib/funnel";
import { resolveRange } from "@/lib/date-range";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { sourceDetailFieldFor } from "@/lib/source-fields";
import { toCsv, type ReportRow } from "@/server/services/reports";
import { filterRecommendations } from "@/server/ai/assistant";
import { financialYear } from "@/server/services/quotations";
import { leadSchema } from "@/lib/validators";

describe("quotation & GST calculation", () => {
  it("Subtotal ₹10,000 @18% → GST ₹1,800, total ₹11,800", () => {
    const t = calculateQuotation([{ quantity: 1, unitPrice: 10000 }], 18);
    expect(t.subtotal).toBe(10000);
    expect(t.gstAmount).toBe(1800);
    expect(t.totalAmount).toBe(11800);
  });
  it("applies line and overall discounts before GST", () => {
    const t = calculateQuotation([{ quantity: 2, unitPrice: 5000, discount: 1000 }, { quantity: 3, unitPrice: 1000 }], 18, 2000);
    expect(t.lines.map((l) => l.total)).toEqual([9000, 3000]);
    expect(t.subtotal).toBe(12000);
    expect(t.taxable).toBe(10000);
    expect(t.gstAmount).toBe(1800);
    expect(t.totalAmount).toBe(11800);
  });
  it("rounds to paise", () => {
    expect(calculateQuotation([{ quantity: 3, unitPrice: 333.33 }], 18).gstAmount).toBe(180);
  });
  it("rejects invalid inputs", () => {
    expect(() => calculateQuotation([{ quantity: 0, unitPrice: 1 }], 18)).toThrow();
    expect(() => calculateQuotation([{ quantity: 1, unitPrice: 100 }], 18, 200)).toThrow();
    expect(() => calculateQuotation([{ quantity: 1, unitPrice: 100 }], 120)).toThrow();
  });
  it("uses Indian financial year for numbering", () => {
    expect(financialYear(new Date(2026, 2, 31))).toBe("2025-26");
    expect(financialYear(new Date(2026, 3, 1))).toBe("2026-27");
  });
});

describe("funnel helpers", () => {
  it("never lowers highest stage and ignores LOST", () => {
    expect(nextHighestRank(5, "LOST")).toBe(5);
    expect(nextHighestRank(5, "CONTACTED")).toBe(5);
    expect(nextHighestRank(1, "WON")).toBe(7);
  });
  it("pct handles zero", () => {
    expect(pct(1, 0)).toBe(0);
    expect(pct(1, 3)).toBe(33.3);
  });
});

describe("date ranges", () => {
  const now = new Date(2026, 8, 17, 15);
  it("month and last month", () => {
    expect(resolveRange("month", undefined, undefined, now)).toEqual({ from: new Date(2026, 8, 1), to: new Date(2026, 9, 1) });
    expect(resolveRange("last_month", undefined, undefined, now).from).toEqual(new Date(2026, 7, 1));
  });
  it("custom range is inclusive of end date", () => {
    const r = resolveRange("custom", "2026-09-01", "2026-09-10");
    expect(r.to!.getTime() - new Date("2026-09-10").getTime()).toBe(86400000);
  });
});

describe("misc", () => {
  it("rate limiter blocks after limit", () => {
    resetRateLimits();
    expect(rateLimit("k", 2, 60000, 0)).toBe(true);
    expect(rateLimit("k", 2, 60000, 1)).toBe(true);
    expect(rateLimit("k", 2, 60000, 2)).toBe(false);
    expect(rateLimit("k", 2, 60000, 70000)).toBe(true);
  });
  it("source-specific fields", () => {
    expect(sourceDetailFieldFor("Referral")?.field).toBe("referralName");
    expect(sourceDetailFieldFor("Google Ads")?.field).toBe("campaignName");
    expect(sourceDetailFieldFor("Exhibition / Event")?.label).toBe("Event Name");
    expect(sourceDetailFieldFor("Employee Referral")?.label).toBe("Employee Name");
    expect(sourceDetailFieldFor("Partner / Channel")?.label).toBe("Partner Name");
    expect(sourceDetailFieldFor("Direct Visit")).toBeNull();
  });
  it("CSV escapes and blocks formula injection", () => {
    const csv = toCsv([{ "Lead Name": '=HYPERLINK("x")', Company: "A, B" } as unknown as ReportRow]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"A, B"');
  });
  it("AI recommendations limited to catalog products", () => {
    const r = filterRecommendations({ recommendations: [{ productName: "web-e-gst" }, { productName: "Magic CRM" }] }, ["Web-e-GST"]);
    expect(r.recommendations.map((x) => x.productName)).toEqual(["Web-e-GST"]);
    expect(r.note).toMatch(/removed/);
  });
  it("lead schema requires a lead source", () => {
    expect(leadSchema.safeParse({ name: "X" }).success).toBe(false);
    expect(leadSchema.parse({ name: "X", leadSourceId: "s", email: "", estimatedValue: "" }).email).toBeUndefined();
  });
});
