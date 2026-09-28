import { describe, expect, it } from "vitest";
import { normalizePhone, extractPhones, waLink } from "@/lib/leadgen/phones";
import { extractEmails, guessEmails, inferPattern } from "@/lib/leadgen/emails";
import { findDuplicate, nameSimilarity, dedupeBatch } from "@/lib/leadgen/dedupe";
import { detectInputType, parseQueryIntent, parseInput, nameFromMapsUrl } from "@/lib/leadgen/intent";
import { scoreLead } from "@/lib/leadgen/scoring";
import { detectTech, auditHtml, digitalMaturity } from "@/lib/leadgen/techstack";
import { normalizeCompanyName, domainFromUrl } from "@/lib/utils";

describe("phones", () => {
  it("normalizes Indian mobiles to E.164", () => {
    expect(normalizePhone("98400 12345")).toMatchObject({ e164: "+919840012345", kind: "mobile" });
    expect(normalizePhone("+91-98400-12345")?.e164).toBe("+919840012345");
    expect(normalizePhone("09840012345")?.e164).toBe("+919840012345");
  });
  it("classifies Chennai landlines", () => {
    expect(normalizePhone("044 2434 5678")).toMatchObject({ e164: "+914424345678", kind: "landline" });
  });
  it("rejects junk", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
  it("extracts and dedupes phones from text", () => {
    const p = extractPhones("Call +91 98400 12345 or 9840012345, office 044-24345678");
    expect(p.map((x) => x.e164).sort()).toEqual(["+914424345678", "+919840012345"]);
  });
  it("builds wa.me links", () => expect(waLink("+919840012345", "hi")).toBe("https://wa.me/919840012345?text=hi"));
});

describe("emails", () => {
  it("extracts and filters junk", () => {
    expect(extractEmails("mail info@acme.in, sales [at] acme [dot] in, logo@2x.png sentry@sentry.io")).toEqual(["info@acme.in", "sales@acme.in"]);
  });
  it("guesses person patterns, never at 100%", () => {
    const g = guessEmails("Dr. Priya Raman", "acme.in");
    expect(g[0].email).toBe("priya@acme.in");
    expect(g.map((x) => x.email)).toContain("priya.raman@acme.in");
    expect(g.every((x) => x.confidence < 100)).toBe(true);
  });
  it("uses a known pattern to boost confidence", () => {
    expect(inferPattern(["ravi.kumar"])).toBe("first.last");
    const g = guessEmails("Priya Raman", "acme.in", ["ravi.kumar@acme.in"]);
    expect(g[0]).toMatchObject({ email: "priya.raman@acme.in", confidence: 75 });
  });
  it("guesses role inboxes without a name", () => {
    expect(guessEmails(null, "acme.in", ["info@acme.in"]).map((x) => x.email)).not.toContain("info@acme.in");
  });
});

describe("dedupe", () => {
  const existing = [
    { id: "1", name: "Sri Balaji Dental Care Pvt Ltd", domain: "balajidental.in", phones: ["+919840012345"], city: "Chennai" },
    { id: "2", name: "Murugan Textiles", domain: null, phones: [], city: "Tirupur" },
  ];
  it("matches by domain", () => expect(findDuplicate({ name: "X", domain: "balajidental.in" }, existing)?.match.id).toBe("1"));
  it("matches by phone", () => expect(findDuplicate({ name: "X", phones: ["+919840012345"] }, existing)?.reason).toBe("same phone"));
  it("matches fuzzy names in the same city", () => expect(findDuplicate({ name: "Sri Balaji Dental Care", city: "Chennai" }, existing)?.match.id).toBe("1"));
  it("does not match across cities", () => expect(findDuplicate({ name: "Murugan Textiles", city: "Chennai" }, existing)).toBeNull());
  it("does not match different businesses", () => expect(findDuplicate({ name: "Kaveri Hospital", city: "Chennai" }, existing)).toBeNull());
  it("normalizes suffixes", () => {
    expect(normalizeCompanyName("ACME Technologies Pvt. Ltd.")).toBe("acme");
    expect(nameSimilarity("Acme Pvt Ltd", "ACME Private Limited")).toBe(1);
  });
  it("dedupes batches", () => expect(dedupeBatch([{ name: "A1 Traders", domain: "a1.in" }, { name: "A One Traders", domain: "a1.in" }])).toHaveLength(1));
});

describe("input parsing", () => {
  it("detects input types", () => {
    expect(detectInputType("dental clinics in Anna Nagar")).toBe("query");
    expect(detectInputType("acme.in\nhttps://www.foo.com/about")).toBe("urls");
    expect(detectInputType("Acme Pvt Ltd\nFoo Industries")).toBe("names");
    expect(detectInputType("https://www.google.com/maps/place/Foo+Bar/@13,80")).toBe("maps");
    expect(detectInputType("name,phone\nAcme,9840012345\nFoo,9840012346")).toBe("csv");
  });
  it("parses natural-language intent", () => {
    const i = parseQueryIntent("dental clinics in Anna Nagar");
    expect(i).toMatchObject({ category: "Dental clinic", area: "Anna Nagar", location: "Chennai" });
    expect(i.osmTags).toContainEqual({ key: "amenity", value: "dentist" });
    const g = parseQueryIntent("small garment exporters in Tirupur");
    expect(g).toMatchObject({ category: "Garment manufacturer/exporter", location: "Tirupur", sizeHint: "small" });
  });
  it("falls back to default city", () => expect(parseInput("CA firms").intent?.location).toBe("Chennai"));
  it("reads place names from maps links", () => expect(nameFromMapsUrl("https://www.google.com/maps/place/Sri+Dental+Care/@13.08,80.2")).toBe("Sri Dental Care"));
  it("extracts domains", () => {
    expect(domainFromUrl("https://www.Acme.in/about")).toBe("acme.in");
    expect(domainFromUrl("not a url")).toBeNull();
  });
});

describe("scoring", () => {
  it("rewards reachability, pains and signals", () => {
    const hi = scoreLead({ hasWebsite: true, phones: [{ kind: "mobile" }], emails: [{ kind: "found", confidence: 95 }], people: [{ dmScore: 90 }], painCount: 3, productMatchTop: 80, signals: ["Hiring: sales"], categoryMatchesIcp: true, digitalMaturity: 30 });
    const lo = scoreLead({ hasWebsite: false, phones: [], emails: [], people: [], painCount: 0, signals: [], categoryMatchesIcp: false, digitalMaturity: 10 });
    expect(hi.score).toBeGreaterThan(75);
    expect(lo.score).toBeLessThan(40);
    expect(hi.explanation.length).toBeGreaterThan(3);
    expect(hi.whyNow).toContain("Hiring");
  });
  it("caps reach for do-not-call", () => {
    expect(scoreLead({ hasWebsite: true, phones: [{ kind: "mobile" }], emails: [], people: [{ dmScore: 90 }], painCount: 0, signals: [], categoryMatchesIcp: false, digitalMaturity: 50, doNotCall: true }).reach).toBeLessThanOrEqual(20);
  });
});

describe("tech detection", () => {
  const html = `<html><head><title>Acme | Home</title><meta name="viewport" content="width=device-width"><script src="/wp-content/x.js"></script><script src="https://www.googletagmanager.com/gtag/js"></script></head><body><h1>Hi</h1><form>Book appointment</form><a href="https://wa.me/919840012345">wa</a> © 2019 Acme</body></html>`;
  it("detects stack", () => expect(detectTech(html)).toEqual(expect.arrayContaining(["WordPress", "Google Analytics", "WhatsApp widget"])));
  it("audits basics", () => {
    const a = auditHtml(html, "https://acme.in", 900);
    expect(a).toMatchObject({ ssl: true, mobileViewport: true, h1: true, hasBookingOrForm: true, hasWhatsappWidget: true, copyrightYear: 2019, metaDescription: false });
    expect(digitalMaturity(detectTech(html), a, true)).toBeGreaterThan(50);
    expect(digitalMaturity([], null, false)).toBe(10);
  });
});
