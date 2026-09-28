/* eslint-disable no-console */
import { PrismaClient, type LeadStatus, type Priority } from "@prisma/client";
import bcrypt from "bcryptjs";
import { nextHighestRank } from "../src/lib/funnel";
import { calculateQuotation } from "../src/lib/quotation-math";

const prisma = new PrismaClient();

export const DEFAULT_LEAD_SOURCES = [
  "Direct Visit",
  "Cold Call",
  "WhatsApp",
  "Referral",
  "Existing Customer",
  "LinkedIn",
  "Facebook",
  "Instagram",
  "Website",
  "Google Search",
  "Google Ads",
  "Email",
  "Exhibition / Event",
  "Partner / Channel",
  "CA Association / Networking",
  "Employee Referral",
  "Inbound Enquiry",
  "Outbound Prospecting",
  "Other",
];

// DEMO DATA: prices are placeholders for demonstration only. Replace with real price list in Settings → Products.
const PRODUCTS = [
  { productName: "Webtel Cloud VM", category: "Cloud", description: "Hosted virtual machine for running accounting/tax software on the cloud with remote access.", targetCustomer: "CA firms, SMEs running Tally/desktop software for multiple users", keyFeatures: "Remote desktop access; daily backup; multi-user access", benefits: "Access from anywhere; no local server maintenance", pricing: 1500, pricingType: "Per user / month (DEMO)" },
  { productName: "Web-e-GST", category: "Compliance", description: "GST return preparation and filing software.", targetCustomer: "CA firms, tax practitioners, businesses filing GST", keyFeatures: "GSTR preparation; reconciliation; e-invoice", benefits: "Faster, accurate GST compliance", pricing: 12000, pricingType: "Per year (DEMO)" },
  { productName: "Web-e-TDS", category: "Compliance", description: "TDS/TCS return preparation and filing software.", targetCustomer: "CA firms, deductors", keyFeatures: "24Q/26Q/27Q returns; Form 16 generation", benefits: "Simplified TDS compliance", pricing: 9000, pricingType: "Per year (DEMO)" },
  { productName: "Web-e-Income Tax", category: "Compliance", description: "Income tax return preparation software.", targetCustomer: "CA firms, tax practitioners", keyFeatures: "ITR preparation; computation", benefits: "Bulk ITR processing", pricing: 10000, pricingType: "Per year (DEMO)" },
  { productName: "Web-e-XBRL", category: "Compliance", description: "XBRL financial statement conversion software.", targetCustomer: "CA firms, companies filing with MCA", keyFeatures: "XBRL conversion; validation", benefits: "MCA-compliant filings", pricing: 15000, pricingType: "Per year (DEMO)" },
  { productName: "Web-e-Sign", category: "Utility", description: "Digital signing utility for documents.", targetCustomer: "Businesses and professionals signing documents digitally", keyFeatures: "Bulk PDF signing with DSC", benefits: "Paperless workflow", pricing: 3000, pricingType: "Per year (DEMO)" },
  { productName: "Web-e-Connect", category: "Utility", description: "Connectivity/integration utility.", targetCustomer: "Businesses needing data integration", keyFeatures: "Integration utility", benefits: "Reduced manual data entry", pricing: 5000, pricingType: "Per year (DEMO)" },
  { productName: "Office Management", category: "Practice Management", description: "Office and practice management software.", targetCustomer: "CA firms and professional offices", keyFeatures: "Client master; task tracking; billing", benefits: "Better office productivity", pricing: 8000, pricingType: "Per year (DEMO)" },
  { productName: "CA Website", category: "Website", description: "Website for CA firms.", targetCustomer: "CA firms", keyFeatures: "Firm profile website", benefits: "Online presence", pricing: 7000, pricingType: "One time (DEMO)" },
  { productName: "Other", category: "Other", description: "Other products/services — specify in quotation line.", targetCustomer: null, keyFeatures: null, benefits: null, pricing: null, pricingType: null },
];

const day = 86400000;
const ago = (n: number) => new Date(Date.now() - n * day);
const ahead = (n: number) => new Date(Date.now() + n * day);

async function main() {
  console.log("Seeding lead sources…");
  for (const name of DEFAULT_LEAD_SOURCES) {
    await prisma.leadSource.upsert({ where: { name }, create: { name }, update: {} });
  }
  console.log("Seeding products…");
  for (const p of PRODUCTS) await prisma.product.upsert({ where: { productName: p.productName }, create: p, update: {} });

  console.log("Seeding users…");
  const admin = await prisma.user.upsert({
    where: { email: "admin@webtel.demo" },
    create: { name: "Demo Admin", email: "admin@webtel.demo", passwordHash: await bcrypt.hash("Admin@12345", 12), role: "ADMIN" },
    update: {},
  });
  const rm = await prisma.user.upsert({
    where: { email: "rm@webtel.demo" },
    create: { name: "Demo Relationship Manager", email: "rm@webtel.demo", passwordHash: await bcrypt.hash("Sales@12345", 12), role: "USER" },
    update: {},
  });

  await prisma.setting.upsert({ where: { key: "company" }, create: { key: "company", value: { name: "Webtel (DEMO)", address: "DEMO address, Chennai", phone: "", email: "", website: "", gstin: "" } }, update: {} });
  const tplCount = await prisma.messageTemplate.count();
  if (!tplCount) {
    await prisma.messageTemplate.createMany({
      data: [
        { name: "Demo confirmation", channel: "WHATSAPP", body: "Hello {{name}}, confirming our demo on {{date}}. Regards, {{me}}" },
        { name: "Quotation follow-up", channel: "EMAIL", body: "Dear {{name}},\n\nI wanted to check whether you had a chance to review quotation {{quotation}}.\n\nRegards,\n{{me}}" },
      ],
    });
  }

  if (await prisma.lead.count({ where: { isDemo: true } })) {
    console.log("Demo leads already present — skipping demo records.");
    return;
  }

  const src = Object.fromEntries((await prisma.leadSource.findMany()).map((s) => [s.name, s.id]));
  const prod = Object.fromEntries((await prisma.product.findMany()).map((p) => [p.productName, p]));

  type L = { name: string; company: string; city: string; source: string; status: LeadStatus; priority: Priority; value: number; created: number; industry: string; size: string; details?: string; campaign?: string; referral?: string; products: string[]; assign: "admin" | "rm" };
  const leads: L[] = [
    { name: "DEMO DATA - Ravi Kumar", company: "DEMO Sri Balaji Traders", city: "Chennai", source: "Direct Visit", status: "WON", priority: "HIGH", value: 180000, created: 80, industry: "Trading", size: "25", products: ["Webtel Cloud VM"], assign: "rm" },
    { name: "DEMO DATA - Priya S", company: "DEMO PS & Associates (CA)", city: "Coimbatore", source: "Cold Call", status: "CONTACTED", priority: "MEDIUM", value: 25000, created: 20, industry: "CA Firm", size: "8", products: ["Web-e-GST"], assign: "rm" },
    { name: "DEMO DATA - Mohan R", company: "DEMO Mohan Textiles", city: "Tiruppur", source: "Referral", status: "QUOTATION_SENT", priority: "HIGH", value: 240000, created: 35, industry: "Textiles", size: "20", referral: "Mr. Kumar (DEMO)", details: "Referred by Mr. Kumar", products: ["Webtel Cloud VM"], assign: "rm" },
    { name: "DEMO DATA - Anita Desai", company: "DEMO Desai Consulting", city: "Bengaluru", source: "LinkedIn", status: "INTERESTED", priority: "MEDIUM", value: 60000, created: 12, industry: "Consulting", size: "20", campaign: "LinkedIn CA Outreach Sep 2026", products: ["Webtel Cloud VM", "Office Management"], assign: "admin" },
    { name: "DEMO DATA - Suresh Babu", company: "DEMO SB & Co", city: "Madurai", source: "Website", status: "NEW", priority: "LOW", value: 15000, created: 2, industry: "CA Firm", size: "5", products: ["Web-e-TDS"], assign: "rm" },
    { name: "DEMO DATA - Kavitha N", company: "DEMO KN Pharma Distributors", city: "Chennai", source: "Google Ads", status: "NEW", priority: "MEDIUM", value: 90000, created: 5, industry: "Pharma Distribution", size: "30", campaign: "Cloud VM Campaign September 2026", products: ["Webtel Cloud VM"], assign: "rm" },
    { name: "DEMO DATA - Rajesh Iyer", company: "DEMO Iyer & Iyer (CA)", city: "Trichy", source: "WhatsApp", status: "WON", priority: "HIGH", value: 40000, created: 60, industry: "CA Firm", size: "12", products: ["Web-e-GST", "Web-e-TDS"], assign: "rm" },
    { name: "DEMO DATA - Lakshmi V", company: "DEMO Lakshmi Exports", city: "Salem", source: "Existing Customer", status: "WON", priority: "MEDIUM", value: 50000, created: 45, industry: "Exports", size: "15", products: ["Web-e-XBRL"], assign: "admin" },
    { name: "DEMO DATA - Arjun Mehta", company: "DEMO Mehta Group", city: "Chennai", source: "Exhibition / Event", status: "DEMO_SCHEDULED", priority: "HIGH", value: 300000, created: 18, industry: "Manufacturing", size: "60", details: "CA Expo Chennai 2026 (DEMO)", products: ["Webtel Cloud VM", "Web-e-Sign"], assign: "rm" },
    { name: "DEMO DATA - Fathima B", company: "DEMO FB Tax Services", city: "Vellore", source: "Partner / Channel", status: "LOST", priority: "LOW", value: 20000, created: 50, industry: "Tax Practice", size: "4", details: "Partner: DEMO Channel Partner", products: ["Web-e-Income Tax"], assign: "rm" },
  ];

  const leadIds: string[] = [];
  const rankOf = (s: LeadStatus) => (s === "LOST" ? 3 : nextHighestRank(0, s)); // lost lead had reached demo stage
  for (const l of leads) {
    const lead = await prisma.lead.create({
      data: {
        name: l.name,
        companyName: l.company,
        phone: `+91 90000 0${String(leadIds.length).padStart(4, "0")}`,
        email: `demo${leadIds.length + 1}@example.com`,
        city: l.city,
        state: "Tamil Nadu",
        industry: l.industry,
        companySize: l.size,
        leadSourceId: src[l.source],
        leadSourceDetails: l.details,
        campaignName: l.campaign,
        referralName: l.referral,
        assignedUserId: l.assign === "admin" ? admin.id : rm.id,
        status: l.status,
        highestStageRank: rankOf(l.status),
        priority: l.priority,
        estimatedValue: l.value,
        notes: "DEMO DATA — not a real customer.",
        isDemo: true,
        createdAt: ago(l.created),
        interestedProducts: { connect: l.products.map((n) => ({ id: prod[n].id })) },
        statusHistory: { create: { toStatus: l.status, changedById: rm.id, changedAt: ago(l.created) } },
      },
    });
    leadIds.push(lead.id);
  }

  // 5 customers: 3 won leads + 2 others (referral in quotation stage, exhibition) converted as prospects-with-accounts
  const custSpec = [
    { i: 0, users: 25, sw: "Tally Prime", server: "Local server in office", cloud: null, pain: "Server downtime; remote access for branch staff", req: "25-user Cloud VM for Tally" },
    { i: 6, users: 12, sw: "Legacy GST utility", server: null, cloud: null, pain: "Manual GST reconciliation", req: "GST + TDS filing software" },
    { i: 7, users: 15, sw: "Excel", server: null, cloud: null, pain: "XBRL conversion outsourced", req: "In-house XBRL filing" },
    { i: 2, users: 20, sw: "Tally ERP 9", server: "Old desktop server", cloud: "None", pain: "Frequent server crashes", req: "20-user Cloud VM" },
    { i: 8, users: 60, sw: "SAP B1", server: "On-premise", cloud: "AWS (partial)", pain: "Signing large volumes of invoices", req: "Cloud VM + Web-e-Sign" },
  ];
  const customerIds: string[] = [];
  for (const c of custSpec) {
    const l = leads[c.i];
    const cust = await prisma.customer.create({
      data: {
        leadId: leadIds[c.i],
        customerName: l.name,
        companyName: l.company,
        phone: `+91 90000 0${String(c.i).padStart(4, "0")}`,
        email: `demo${c.i + 1}@example.com`,
        address: "DEMO address",
        city: l.city,
        industry: l.industry,
        numberOfUsers: c.users,
        currentSoftware: c.sw,
        currentServer: c.server,
        currentCloudProvider: c.cloud,
        painPoints: c.pain,
        requirements: c.req,
        notes: "DEMO DATA",
        isDemo: true,
      },
    });
    customerIds.push(cust.id);
  }

  // 10 activities
  const acts = [
    { i: 0, t: "MEETING", s: "Requirement discussion", d: 75 },
    { i: 0, t: "DEMO", s: "Cloud VM demo", d: 70 },
    { i: 1, t: "CALL", s: "Intro call", d: 15 },
    { i: 2, t: "DEMO", s: "Cloud VM demo for 20 users", d: 20 },
    { i: 2, t: "EMAIL", s: "Quotation shared", d: 3 },
    { i: 3, t: "CALL", s: "LinkedIn follow-up call", d: 8 },
    { i: 6, t: "WHATSAPP", s: "Product brochure shared", d: 55 },
    { i: 7, t: "SITE_VISIT", s: "Visit to existing customer office", d: 40 },
    { i: 8, t: "MEETING", s: "Met at CA Expo stall", d: 18 },
    { i: 9, t: "CALL", s: "Price discussion — chose competitor", d: 30 },
  ] as const;
  for (const a of acts)
    await prisma.activity.create({ data: { leadId: leadIds[a.i], activityType: a.t, subject: `${a.s} (DEMO)`, description: "DEMO DATA", activityDate: ago(a.d), status: "COMPLETED" } });

  await prisma.meeting.create({
    data: { leadId: leadIds[2], customerId: customerIds[3], meetingDate: ago(20), meetingType: "DEMO", notes: "DEMO DATA: demo went well.", customerRequirements: "20-user Cloud VM", objections: "Price", productsDiscussed: "Webtel Cloud VM", nextSteps: "Send quotation" },
  });

  // 5 opportunities
  const opps = [
    { i: 0, n: "Cloud VM 25 users", amt: 180000, stage: "CLOSED_WON", p: 100, prod: ["Webtel Cloud VM"] },
    { i: 2, n: "Cloud VM 20 users", amt: 240000, stage: "PROPOSAL", p: 60, prod: ["Webtel Cloud VM"], obj: "Price" },
    { i: 3, n: "Cloud VM + Office Mgmt", amt: 60000, stage: "QUALIFICATION", p: 30, prod: ["Webtel Cloud VM", "Office Management"] },
    { i: 8, n: "Enterprise Cloud + e-Sign", amt: 300000, stage: "DEMO", p: 40, prod: ["Webtel Cloud VM", "Web-e-Sign"] },
    { i: 6, n: "GST + TDS bundle", amt: 40000, stage: "CLOSED_WON", p: 100, prod: ["Web-e-GST", "Web-e-TDS"] },
  ] as const;
  for (const o of opps)
    await prisma.opportunity.create({
      data: {
        leadId: leadIds[o.i],
        opportunityName: `${o.n} (DEMO)`,
        estimatedAmount: o.amt,
        probability: o.p,
        stage: o.stage,
        expectedCloseDate: ahead(30),
        objections: "obj" in o ? o.obj : null,
        nextAction: "DEMO DATA",
        products: { connect: o.prod.map((n) => ({ id: prod[n].id })) },
      },
    });

  // 5 quotations
  const quotes = [
    { i: 0, c: 0, items: [{ p: "Webtel Cloud VM", q: 25, price: 1500 * 12 / 3 }], status: "ACCEPTED", d: 72 },
    { i: 2, c: 3, items: [{ p: "Webtel Cloud VM", q: 20, price: 12000 }], status: "SENT", d: 3 },
    { i: 6, c: 1, items: [{ p: "Web-e-GST", q: 1, price: 12000 }, { p: "Web-e-TDS", q: 1, price: 9000 }], status: "ACCEPTED", d: 58 },
    { i: 7, c: 2, items: [{ p: "Web-e-XBRL", q: 1, price: 15000 }], status: "ACCEPTED", d: 42 },
    { i: 9, c: null, items: [{ p: "Web-e-Income Tax", q: 1, price: 10000 }], status: "REJECTED", d: 35 },
  ] as const;
  let n = 1;
  for (const q of quotes) {
    const t = calculateQuotation(q.items.map((i) => ({ quantity: i.q, unitPrice: i.price })), 18, 0);
    const date = ago(q.d);
    const fy = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    await prisma.quotation.create({
      data: {
        leadId: leadIds[q.i],
        customerId: q.c === null ? null : customerIds[q.c],
        quotationNumber: `WT/Q/${fy}-${String((fy + 1) % 100).padStart(2, "0")}/${String(n++).padStart(4, "0")}`,
        quotationDate: date,
        validUntil: new Date(date.getTime() + 30 * day),
        subtotal: t.subtotal,
        discountAmount: 0,
        gstPercentage: 18,
        gstAmount: t.gstAmount,
        totalAmount: t.totalAmount,
        status: q.status,
        notes: "DEMO DATA",
        items: { create: q.items.map((i, k) => ({ productId: prod[i.p].id, description: i.p, quantity: i.q, unitPrice: i.price, total: t.lines[k].total })) },
      },
    });
  }

  // 10 follow-ups
  const fus = [
    { i: 1, d: 0, m: "Call to explain Web-e-GST features" },
    { i: 2, d: 0, m: "Follow up on quotation" },
    { i: 3, d: 2, m: "Schedule demo" },
    { i: 4, d: -1, m: "First contact call" },
    { i: 5, d: 1, m: "Call Google Ads lead" },
    { i: 8, d: 3, m: "Confirm demo attendees" },
    { i: 0, d: 30, m: "Renewal check-in" },
    { i: 6, d: 15, m: "Ask for referral" },
    { i: 7, d: -3, m: "Payment follow-up", done: true },
    { i: 9, d: 90, m: "Re-engage lost lead" },
  ];
  for (const f of fus)
    await prisma.followup.create({
      data: {
        leadId: leadIds[f.i],
        followupDate: f.d >= 0 ? ahead(f.d) : ago(-f.d),
        followupType: "CALL",
        reminderTime: "10:30",
        message: `${f.m} (DEMO)`,
        status: f.done ? "COMPLETED" : "PENDING",
        completedAt: f.done ? ago(2) : null,
      },
    });

  // 5 sales
  const sales = [
    { i: 0, c: 0, p: "Webtel Cloud VM", amt: 150000, d: 65, st: "PAID" },
    { i: 0, c: 0, p: "Webtel Cloud VM", amt: 30000, d: 10, st: "PAID" },
    { i: 6, c: 1, p: "Web-e-GST", amt: 14160, d: 50, st: "PAID" },
    { i: 6, c: 1, p: "Web-e-TDS", amt: 10620, d: 50, st: "PARTIAL" },
    { i: 7, c: 2, p: "Web-e-XBRL", amt: 17700, d: 38, st: "PENDING" },
  ] as const;
  for (const s of sales)
    await prisma.sale.create({ data: { leadId: leadIds[s.i], customerId: customerIds[s.c], productId: prod[s.p].id, amount: s.amt, saleDate: ago(s.d), paymentStatus: s.st, notes: "DEMO DATA" } });

  console.log("Seed complete. Login: admin@webtel.demo / Admin@12345  or  rm@webtel.demo / Sales@12345");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
