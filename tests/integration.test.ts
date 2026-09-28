import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { verifyCredentials } from "@/server/credentials";
import { resetRateLimits } from "@/lib/rate-limit";
import { convertLeadToCustomer, createLead, deleteLead, listLeads, setLeadStatus } from "@/server/services/leads";
import { createLeadSource, deleteLeadSource, setLeadSourceActive } from "@/server/services/lead-sources";
import { createActivity, createFollowup, createSale, listFollowups } from "@/server/services/crm";
import { createQuotation } from "@/server/services/quotations";
import { dashboardSummary, sourceFunnel, sourcePerformance } from "@/server/services/analytics";
import { answerAnalyticsQuestion, runAssist } from "@/server/ai/assistant";
import { POST as assistRoute } from "@/app/api/ai/assist/route";
import { POST as analyticsRoute } from "@/app/api/ai/analytics/route";
import { makeSources, makeUser, resetDb, setSession } from "./helpers";

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  setSession(null);
});

describe("authentication", () => {
  it("verifies hashed passwords and rejects wrong / disabled users", async () => {
    await makeUser("USER", "a@t.test");
    expect(await verifyCredentials("a@t.test", "Password1!")).toMatchObject({ email: "a@t.test", role: "USER" });
    expect(await verifyCredentials("a@t.test", "wrong")).toBeNull();
    await prisma.user.update({ where: { email: "a@t.test" }, data: { active: false } });
    expect(await verifyCredentials("a@t.test", "Password1!")).toBeNull();
    const u = await prisma.user.findUniqueOrThrow({ where: { email: "a@t.test" } });
    expect(u.passwordHash).not.toContain("Password1!");
  });
});

describe("lead sources", () => {
  it("admin can create; users cannot; duplicates rejected", async () => {
    const admin = await makeUser("ADMIN");
    const user = await makeUser("USER");
    await createLeadSource(admin, { name: "Podcast" });
    await expect(createLeadSource(admin, { name: "podcast" })).rejects.toThrow(/already exists/);
    await expect(createLeadSource(user, { name: "X" })).rejects.toThrow(/Admin/);
  });
  it("used sources cannot be deleted, only disabled; disabled sources blocked for new leads", async () => {
    const admin = await makeUser("ADMIN");
    const s = await makeSources("Referral");
    await createLead(admin, { name: "L1", leadSourceId: s.Referral, referralName: "Mr. Kumar" });
    await expect(deleteLeadSource(admin, s.Referral)).rejects.toThrow(/Disable/);
    await setLeadSourceActive(admin, s.Referral, false);
    await expect(createLead(admin, { name: "L2", leadSourceId: s.Referral })).rejects.toThrow(/disabled/);
  });
});

describe("leads", () => {
  it("creates lead with source-specific details and filters by source & campaign", async () => {
    const admin = await makeUser("ADMIN");
    const s = await makeSources("Referral", "Google Ads");
    const l = await createLead(admin, { name: "Ref", leadSourceId: s.Referral, referralName: "Mr. Kumar", leadSourceDetails: "Referred by Mr. Kumar" });
    expect(l.referralName).toBe("Mr. Kumar");
    await createLead(admin, { name: "Ads", leadSourceId: s["Google Ads"], campaignName: "Cloud VM Campaign September 2026" });
    expect((await listLeads(admin, { leadSourceId: s.Referral })).rows.map((r) => r.name)).toEqual(["Ref"]);
    expect((await listLeads(admin, { campaign: "cloud vm" })).rows.map((r) => r.name)).toEqual(["Ads"]);
    expect((await listLeads(admin, {})).total).toBe(2);
  });
  it("USER only sees own/unassigned leads", async () => {
    const admin = await makeUser("ADMIN");
    const u1 = await makeUser("USER");
    const u2 = await makeUser("USER");
    const s = await makeSources("Website");
    await createLead(admin, { name: "for u2", leadSourceId: s.Website, assignedUserId: u2.id });
    const mine = await createLead(u1, { name: "mine", leadSourceId: s.Website, assignedUserId: u2.id });
    expect(mine.assignedUserId).toBe(u1.id); // users cannot assign to others
    expect((await listLeads(u1, {})).rows.map((r) => r.name)).toEqual(["mine"]);
    const other = await prisma.lead.findFirstOrThrow({ where: { name: "for u2" } });
    await expect(setLeadStatus(u1, other.id, "WON")).rejects.toThrow(/access denied/);
  });
});

describe("conversion, quotations, sales and analytics", () => {
  it("converts lead to customer preserving source history", async () => {
    const admin = await makeUser("ADMIN");
    const s = await makeSources("Exhibition / Event");
    const lead = await createLead(admin, { name: "Expo", leadSourceId: s["Exhibition / Event"], leadSourceDetails: "CA Expo Chennai 2026" });
    const c = await convertLeadToCustomer(admin, lead.id, { numberOfUsers: 20 });
    const back = await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, include: { lead: { include: { leadSource: true } } } });
    expect(back.lead?.leadSource.name).toBe("Exhibition / Event");
    expect(back.lead?.leadSourceDetails).toBe("CA Expo Chennai 2026");
    expect(back.lead?.createdAt).toEqual(lead.createdAt);
    expect(back.lead?.status).toBe("WON");
    await expect(deleteLead(admin, lead.id)).rejects.toThrow();
  });

  it("quotation stores GST totals and moves the funnel", async () => {
    const admin = await makeUser("ADMIN");
    const s = await makeSources("Referral");
    const lead = await createLead(admin, { name: "Q", leadSourceId: s.Referral });
    const q = await createQuotation(admin, { leadId: lead.id, gstPercentage: 18, status: "SENT", items: [{ description: "Cloud VM", quantity: 1, unitPrice: 10000 }] });
    expect(Number(q.subtotal)).toBe(10000);
    expect(Number(q.gstAmount)).toBe(1800);
    expect(Number(q.totalAmount)).toBe(11800);
    expect(q.quotationNumber).toMatch(/\/0001$/);
    const q2 = await createQuotation(admin, { leadId: lead.id, items: [{ description: "x", quantity: 1, unitPrice: 1 }] });
    expect(q2.quotationNumber).toMatch(/\/0002$/);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("QUOTATION_SENT");
  });

  it("computes source-wise funnel, sales, pipeline and conversion from the database", async () => {
    const admin = await makeUser("ADMIN");
    const s = await makeSources("Referral", "LinkedIn", "Direct Visit");
    const r1 = await createLead(admin, { name: "r1", leadSourceId: s.Referral, estimatedValue: 100000 });
    const r2 = await createLead(admin, { name: "r2", leadSourceId: s.Referral, estimatedValue: 50000 });
    await createLead(admin, { name: "li", leadSourceId: s.LinkedIn, estimatedValue: 70000 });
    await setLeadStatus(admin, r1.id, "DEMO_SCHEDULED");
    await createQuotation(admin, { leadId: r1.id, status: "SENT", items: [{ description: "x", quantity: 1, unitPrice: 1000 }] });
    await setLeadStatus(admin, r2.id, "DEMO_COMPLETED");
    await setLeadStatus(admin, r2.id, "LOST"); // lost after demo: still counted in demo stage
    const c = await convertLeadToCustomer(admin, r1.id);
    await createSale(admin, { customerId: c.id, amount: 250000 }); // source attributed via customer → lead

    const rows = await sourcePerformance(admin);
    const ref = rows.find((r) => r.name === "Referral")!;
    expect(ref).toMatchObject({ totalLeads: 2, demosScheduled: 2, quotationsSent: 1, won: 1, lost: 1, totalSales: 250000, conversionRate: 50, averageDealValue: 250000, pipelineValue: 0 });
    const li = rows.find((r) => r.name === "LinkedIn")!;
    expect(li).toMatchObject({ totalLeads: 1, won: 0, totalSales: 0, pipelineValue: 70000 });
    expect(rows.find((r) => r.name === "Direct Visit")!.totalLeads).toBe(0);

    const f = await sourceFunnel(admin, { leadSourceId: s.Referral });
    expect(f.leadToDemo).toBe(100);
    expect(f.quotationToWon).toBe(100);

    const d = await dashboardSummary(admin, {});
    expect(d).toMatchObject({ totalLeads: 3, won: 1, lost: 1, totalSales: 250000, pipelineValue: 70000 });
  });

  it("filters follow-ups by bucket", async () => {
    const admin = await makeUser("ADMIN");
    const s = await makeSources("Cold Call");
    const lead = await createLead(admin, { name: "f", leadSourceId: s["Cold Call"] });
    const today = new Date();
    today.setHours(12);
    await createFollowup(admin, { leadId: lead.id, followupDate: today });
    await createFollowup(admin, { leadId: lead.id, followupDate: new Date(Date.now() - 3 * 86400000) });
    await createFollowup(admin, { leadId: lead.id, followupDate: new Date(Date.now() + 5 * 86400000) });
    await createActivity(admin, { leadId: lead.id, activityType: "CALL", subject: "c", nextFollowupDate: new Date(Date.now() + 6 * 86400000) });
    expect((await listFollowups(admin, "today")).length).toBe(1);
    expect((await listFollowups(admin, "overdue")).length).toBe(1);
    expect((await listFollowups(admin, "upcoming")).length).toBe(2);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("CONTACTED");
  });
});

describe("AI", () => {
  it("AI endpoints reject unauthenticated requests", async () => {
    const res = await assistRoute(new Request("http://x/api/ai/assist", { method: "POST", body: JSON.stringify({ type: "ANALYZE_LEAD", leadId: "x" }) }));
    expect(res.status).toBe(401);
    const res2 = await analyticsRoute(new Request("http://x/api/ai/analytics", { method: "POST", body: JSON.stringify({ question: "Which source?" }) }));
    expect(res2.status).toBe(401);
  });
  it("AI endpoint denies access to another user's lead and logs allowed usage", async () => {
    const admin = await makeUser("ADMIN");
    const u1 = await makeUser("USER");
    const s = await makeSources("LinkedIn");
    const lead = await createLead(admin, { name: "hidden", leadSourceId: s.LinkedIn, assignedUserId: admin.id });
    setSession(u1);
    const res = await assistRoute(new Request("http://x", { method: "POST", body: JSON.stringify({ type: "NEXT_ACTION", leadId: lead.id }) }));
    expect(res.status).toBe(403);
    const ok = await runAssist(admin, { type: "NEXT_ACTION", leadId: lead.id });
    expect(ok.json).toMatchObject({ channel: "CALL" });
    expect(await prisma.aiInteraction.count({ where: { userId: admin.id } })).toBe(1);
  });
  it("analytics assistant answers from live data via controlled tools", async () => {
    const admin = await makeUser("ADMIN");
    const s = await makeSources("Referral", "LinkedIn", "Google Ads", "Exhibition / Event");
    await createLead(admin, { name: "a", leadSourceId: s.LinkedIn });
    await createLead(admin, { name: "b", leadSourceId: s.LinkedIn });
    const r = await createLead(admin, { name: "c", leadSourceId: s.Referral });
    await createLead(admin, { name: "g", leadSourceId: s["Google Ads"] });
    await createLead(admin, { name: "e", leadSourceId: s["Exhibition / Event"], status: "INTERESTED" });
    await createSale(admin, { leadId: r.id, amount: 5000 });

    const a1 = await answerAnalyticsQuestion(admin, { question: "Which lead source generated the most leads this month?" });
    expect(a1.tool).toBe("rank_sources");
    expect(a1.answer).toContain("LinkedIn");
    const a2 = await answerAnalyticsQuestion(admin, { question: "How many leads came from LinkedIn?" });
    expect(a2.data).toMatchObject({ count: 2 });
    const a3 = await answerAnalyticsQuestion(admin, { question: "Which source generated the highest sales value?" });
    expect(a3.answer).toContain("Referral");
    const a4 = await answerAnalyticsQuestion(admin, { question: "Show all leads from Google Ads that have not been contacted." });
    expect(a4.data).toMatchObject({ count: 1 });
    const a5 = await answerAnalyticsQuestion(admin, { question: "How many leads from exhibitions are still open?" });
    expect(a5.data).toMatchObject({ count: 1 });
    const a6 = await answerAnalyticsQuestion(admin, { question: "How many leads came from referrals?" });
    expect(a6.data).toMatchObject({ count: 1 });
  });
});
