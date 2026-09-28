import { describe, expect, it } from "vitest";
import { checkEmail, OPT_OUT_LINE } from "@/lib/outreach/spam";
import { renderTemplate, templateVariables, toCsv, mailtoLink } from "@/lib/outreach/render";
import { classifyReplyRules, STATUS_FROM_REPLY } from "@/lib/inbox/classify";
import { classifyTitle, suggestNextRole } from "@/lib/people/roles";
import { linkedinDeepLinks, parseLinkedinSearchResult } from "@/lib/people/deeplinks";

describe("email checks", () => {
  it("flags spam words and missing opt-out", () => {
    const c = checkEmail("FREE offer!!!", "Act now to get a guaranteed deal. Click here.");
    expect(c.spamHits).toEqual(expect.arrayContaining(["free", "guaranteed", "act now", "click here"]));
    expect(c.hasOptOut).toBe(false);
    expect(c.score).toBeLessThan(50);
  });
  it("passes a clean email", () => {
    const body = `Hi Priya,\n\nI noticed your booking page doesn't work on mobile. We fixed this for three clinics in Anna Nagar last quarter, and they now take bookings after hours without extra staff.\n\nWorth a 10-minute call on Thursday?\n\nThanks,\nRavi\n\n${OPT_OUT_LINE}`;
    const c = checkEmail("Quick idea for Smile Dental", body);
    expect(c.spamHits).toEqual([]);
    expect(c.hasOptOut).toBe(true);
    expect(c.score).toBeGreaterThanOrEqual(90);
  });
});

describe("templates", () => {
  it("renders variables and marks missing ones", () => {
    expect(renderTemplate("Hi {{first_name}} at {{ company }} {{pain_point}}", { first_name: "Priya", company: "Acme" })).toBe("Hi Priya at Acme [pain_point]");
    expect(templateVariables("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
  });
  it("escapes CSV and guards formula injection", () => {
    expect(toCsv([{ a: 'x,"y"', b: "=HYPERLINK()" }])).toBe('a,b\n"x,""y""",\'=HYPERLINK()');
  });
  it("encodes mailto", () => expect(mailtoLink("a@b.in", "Hi there", "L1\nL2")).toBe("mailto:a%40b.in?subject=Hi%20there&body=L1%0AL2"));
});

describe("reply classification", () => {
  const cases: [string, string, string][] = [
    ["Re: idea", "Sounds good, please share the pricing and brochure.", "interested"],
    ["Re: idea", "Can we schedule a call tomorrow at 11?", "meeting_request"],
    ["Re: idea", "Please remove me from your list.", "unsubscribe"],
    ["Undeliverable: idea", "Delivery Status Notification (Failure) address not found", "bounce"],
    ["Automatic reply", "I am out of office until Monday.", "out_of_office"],
    ["Re: idea", "Not interested, thanks.", "not_interested"],
    ["Re: idea", "We already use Zoho for this.", "objection_competitor"],
    ["Re: idea", "This is too expensive for us.", "objection_price"],
    ["Re: idea", "Maybe next quarter, busy right now.", "objection_timing"],
  ];
  it.each(cases)("%s / %s → %s", (s, b, label) => expect(classifyReplyRules(s, b).label).toBe(label));
  it("maps to pipeline status", () => {
    expect(STATUS_FROM_REPLY.meeting_request).toBe("meeting_booked");
    expect(STATUS_FROM_REPLY.unsubscribe).toBe("unsubscribed");
    expect(STATUS_FROM_REPLY.bounce).toBeNull();
  });
});

describe("people", () => {
  it("classifies titles into decision-maker scores", () => {
    expect(classifyTitle("Founder & Managing Director")).toMatchObject({ roleGroup: "founder", seniority: "owner" });
    expect(classifyTitle("Purchase Manager").roleGroup).toBe("purchase");
    expect(classifyTitle("Founder").dmScore).toBeGreaterThan(classifyTitle("Sales Executive").dmScore);
  });
  it("suggests the next role to find", () => expect(suggestNextRole(["founder", "director"])).toBe("purchase"));
  it("parses public search snippets only for /in/ URLs", () => {
    expect(parseLinkedinSearchResult("Priya Raman - Founder - Smile Dental | LinkedIn", "Chennai, Tamil Nadu", "https://in.linkedin.com/in/priya-raman-123?trk=x")).toEqual({ name: "Priya Raman", headline: "Founder - Smile Dental", location: "Chennai, Tamil Nadu", profileUrl: "https://in.linkedin.com/in/priya-raman-123" });
    expect(parseLinkedinSearchResult("Smile Dental | LinkedIn", "", "https://www.linkedin.com/company/smile")).toBeNull();
  });
  it("builds deep links that open in the user's browser", () => {
    const l = linkedinDeepLinks("Smile Dental", "Chennai");
    expect(l.find((x) => x.label === "Founders")?.url).toContain("linkedin.com/search/results/people");
    expect(l.some((x) => x.kind === "google" && decodeURIComponent(x.url).includes('site:linkedin.com/in "Smile Dental"'))).toBe(true);
  });
});
