import { describe, expect, it } from "vitest";
import { ruleAnalysis, ruleAssets, type LeadCtx, type ProductCtx } from "@/lib/ai/rules";
import { AnalysisSchema, AssetsSchema } from "@/lib/ai/schemas";

const ctx: LeadCtx = {
  lead: { id: "l1", name: "Smile Dental", category: "Dental clinic", city: "Chennai", area: "Anna Nagar", website: "http://smile.in", rating: 3.5, reviewsCount: 40, yearEst: 2015, sizeEstimate: "11-50", socials: {}, whatsapp: null },
  tech: [], audit: { ssl: false, mobileViewport: false, responseMs: 4200, copyrightYear: 2018, hasBookingOrForm: false, hasChat: false, metaDescription: false, h1: true, hiringSignals: ["Hiring: telecaller"] },
  people: [{ id: "p1", fullName: "Priya Raman", title: "Founder", roleGroup: "founder", dmScore: 95, headline: null }],
  evidence: [
    { id: "listing-1", fact: "Listed", sourceUrl: "https://osm.org/1", provider: "osm", collectedAt: null },
    { id: "rating-1", fact: "Rating 3.5", sourceUrl: null, provider: "osm", collectedAt: null },
    { id: "site-1", fact: "audit", sourceUrl: "http://smile.in", provider: "website", collectedAt: null },
    { id: "tech-1", fact: "none", sourceUrl: "http://smile.in", provider: "website", collectedAt: null },
    { id: "hiring-1", fact: "Hiring: telecaller", sourceUrl: "http://smile.in/careers", provider: "website", collectedAt: null },
  ],
};
const products: ProductCtx[] = [
  { id: "a", name: "BookEasy", category: "Booking", shortDesc: "Online booking", targetIndustries: ["Dental clinic"], problemsSolved: ["booking", "reviews"], benefits: ["fewer no-shows"], usps: [], pricing: "₹1,499", objections: [], caseStudies: null },
  { id: "b", name: "WebBoost", category: "Website", shortDesc: "Websites", targetIndustries: ["Retail"], problemsSolved: ["website", "ssl", "mobile"], benefits: ["faster site"], usps: [], pricing: null, objections: [], caseStudies: null },
  { id: "c", name: "PayrollPro", category: "HR", shortDesc: "Payroll", targetIndustries: ["Manufacturing"], problemsSolved: ["payroll"], benefits: [], usps: [], pricing: null, objections: [], caseStudies: null },
];

describe("rule-based analysis", () => {
  const a = ruleAnalysis(ctx, products);
  it("produces schema-valid output", () => expect(AnalysisSchema.safeParse(a).success).toBe(true));
  it("only cites real evidence ids", () => {
    const ids = new Set(ctx.evidence.map((e) => e.id));
    for (const p of a.pains) { expect(p.evidenceIds.length).toBeGreaterThan(0); p.evidenceIds.forEach((id) => expect(ids.has(id)).toBe(true)); }
  });
  it("finds the evidenced pains", () => {
    const keys = a.pains.map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(["no_ssl", "not_mobile", "slow_site", "outdated_site", "no_booking", "low_rating", "hiring_sales"]));
  });
  it("ranks relevant products first and payroll last", () => {
    expect(a.matches[0].productId).toMatch(/a|b/);
    expect(a.matches.at(-1)?.productId).toBe("c");
    expect(a.matches[0].targetPersonId).toBe("p1");
  });
  it("says insufficient data when evidence is thin", () => {
    const thin = ruleAnalysis({ ...ctx, lead: { ...ctx.lead, website: null, rating: null, reviewsCount: null }, audit: null, evidence: [ctx.evidence[0]], people: [] }, products);
    expect(thin.dataQuality).toBe("insufficient");
  });
});

describe("rule-based assets", () => {
  const a = ruleAnalysis(ctx, products);
  const s = ruleAssets(ctx, a, products[0], "p1", { displayName: "Ravi", companyName: "Acme", signature: "Ravi\nAcme", meetingLink: "", phone: "+91 98400 00000" });
  it("is schema-valid with three languages", () => {
    expect(AssetsSchema.safeParse(s).success).toBe(true);
    expect(s.callScripts.ta.short).toMatch(/[஀-௿]/); // Tamil script
    expect(s.callScripts.tanglish.short).toMatch(/Vanakkam/);
  });
  it("has 3 email variants, each with an opt-out line", () => {
    expect(s.emails).toHaveLength(3);
    s.emails.forEach((e) => expect(e.body).toMatch(/STOP/));
  });
  it("keeps LinkedIn notes under 300 chars and personalises", () => {
    expect(s.linkedinNote.length).toBeLessThanOrEqual(300);
    expect(s.emails[0].body).toContain("Hi Priya");
    expect(s.followUps.map((f) => f.day)).toEqual([3, 7, 14]);
  });
  it("leads with a pain the chosen product solves", () => expect(s.callScripts.en.short.toLowerCase()).toMatch(/booking|rating/));
});
