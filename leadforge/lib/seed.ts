import { eq } from "drizzle-orm";
import * as schema from "./db/schema";
import { mockCompanies } from "./mock/data";
import { normalizeCompanyName, domainFromUrl } from "./utils";
import { normalizePhone } from "./leadgen/phones";
import { OPT_OUT_LINE } from "./outreach/spam";
import type { PgDatabase } from "drizzle-orm/pg-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export const SAMPLE_PRODUCTS = [
  {
    name: "SmartCRM Lite", category: "CRM software", shortDesc: "Simple cloud CRM with WhatsApp and call follow-up reminders for SMBs.",
    longDesc: "Capture every enquiry from website, WhatsApp and phone into one place, assign follow-ups, and see your sales pipeline on mobile.",
    targetIndustries: ["Manufacturing", "Real estate", "Education", "Garment", "Logistics", "IT"],
    icp: "10-200 employee businesses with a sales team of 2+ who track leads in Excel/WhatsApp.",
    problemsSolved: ["crm", "lead management", "follow-up", "sales tracking", "hiring_sales"],
    benefits: ["never miss a follow-up", "see pipeline on your phone", "cut lead leakage by up to 30%"],
    pricing: "₹799/user/month", usps: ["Tamil & English UI", "WhatsApp integration", "Setup in 1 day"], competitors: ["Zoho CRM", "LeadSquared", "Excel"],
    caseStudies: "A Tirupur knitwear exporter moved 3 sales reps off Excel and closed 18% more buyer enquiries in 90 days.",
    objections: [
      { objection: "We use Excel, it works.", rebuttal: "Excel works until a follow-up is missed. SmartCRM imports your sheet in minutes and reminds your team automatically." },
      { objection: "My staff won't use software.", rebuttal: "It's mobile-first and in Tamil. We train your team on-site for free." },
    ],
  },
  {
    name: "WebBoost Website Revamp", category: "Website design", shortDesc: "Fast, mobile-first website with SSL, SEO basics and enquiry forms.",
    longDesc: "We rebuild outdated sites into fast, secure, mobile-friendly websites with enquiry/booking forms, WhatsApp button and Google Analytics.",
    targetIndustries: ["Dental clinic", "Clinic", "Hospital", "Restaurant", "Education", "Retail", "Salon / spa"],
    icp: "Local businesses with no site, or a slow/outdated one.",
    problemsSolved: ["website", "ssl", "mobile", "speed", "outdated", "seo", "no_website", "analytics"],
    benefits: ["look trustworthy online", "get more enquiries from Google", "load in under 2 seconds"],
    pricing: "From ₹24,999 one-time", usps: ["Live in 10 days", "Free 1-year hosting", "Tamil + English content"], competitors: ["Freelancers", "Wix DIY"],
    caseStudies: "An Anna Nagar dental clinic doubled online appointment requests within 2 months of relaunch.",
    objections: [{ objection: "We get customers by word of mouth.", rebuttal: "Great — and those referrals Google you first. A modern site converts that trust into bookings." }],
  },
  {
    name: "BookEasy Appointments", category: "Booking & WhatsApp automation", shortDesc: "Online booking + WhatsApp reminders + review requests.",
    longDesc: "Patients/customers book 24x7, get automatic WhatsApp reminders, and receive a Google review request after the visit.",
    targetIndustries: ["Dental clinic", "Clinic", "Salon / spa", "Gym / fitness", "Hospital"],
    icp: "Appointment-based businesses with 20+ bookings a day.",
    problemsSolved: ["booking", "appointment", "whatsapp", "chat", "reviews", "reputation", "no_booking", "low_rating", "few_reviews"],
    benefits: ["reduce no-shows by 40%", "collect more 5-star reviews", "free up front-desk time"],
    pricing: "₹1,499/month", usps: ["WhatsApp Business API included", "Works with Practo"], competitors: ["Practo Ray", "Manual register"],
    caseStudies: "A Velachery clinic cut no-shows from 22% to 9% in six weeks.",
    objections: [{ objection: "Patients prefer calling.", rebuttal: "They still can — BookEasy just adds reminders and bookings after hours, when 30% of enquiries arrive." }],
  },
  {
    name: "GrowthAds Local SEO & Ads", category: "Digital marketing", shortDesc: "Google Business Profile, local SEO and performance ads for Chennai businesses.",
    longDesc: "Monthly local SEO, Google Business Profile management, review generation and Meta/Google ads with transparent reporting.",
    targetIndustries: ["all"], icp: "Businesses that depend on local walk-ins or calls.",
    problemsSolved: ["seo", "visibility", "social media", "marketing", "analytics", "reviews", "google business", "weak_seo", "no_social"],
    benefits: ["rank in the local 3-pack", "more calls from Google Maps", "clear monthly ROI report"],
    pricing: "₹9,999/month", usps: ["No lock-in", "Weekly WhatsApp reports"], competitors: ["Local agencies"],
    caseStudies: null, objections: [],
  },
];

export async function ensureSeed(db: AnyDb, userId = "owner") {
  const [p] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId));
  if (p) return false;
  await db.insert(schema.profiles).values({
    userId, displayName: "Your Name", companyName: "Your Company", phone: "+91 98400 00000",
    signature: "Your Name\nYour Company, Chennai\n+91 98400 00000", meetingLink: "", settings: {},
  }).onConflictDoNothing();
  for (const pr of SAMPLE_PRODUCTS) await db.insert(schema.products).values({ userId, ...pr }).onConflictDoNothing();
  await db.insert(schema.templates).values([
    { userId, name: "Cold intro — pain first", channel: "email", subject: "Quick idea for {{company}}", body: `Hi {{first_name}},\n\nI noticed {{pain_point}} at {{company}}. We help businesses like yours fix this with {{product}}.\n\nWorth a 10-minute call this week?\n\n{{signature}}\n\n${OPT_OUT_LINE}` },
    { userId, name: "Follow-up day 3", channel: "email", subject: "Re: Quick idea for {{company}}", body: `Hi {{first_name}},\n\nBumping this up in case it got buried. Happy to share a 2-minute video of {{product}} instead.\n\n{{signature}}\n\n${OPT_OUT_LINE}` },
    { userId, name: "WhatsApp intro", channel: "whatsapp", subject: null, body: "Hi {{first_name}}, {{my_name}} from {{my_company}}. We help {{category}} businesses with {{product}}. Can I share a 1-min video? (Reply STOP to opt out)" },
  ]);
  // Demo leads so the app is useful immediately (clearly marked as mock data).
  const sets: [string, string, string | undefined][] = [["Dental clinic", "Chennai", "Anna Nagar"], ["Garment manufacturer/exporter", "Tirupur", undefined], ["Education", "Chennai", undefined]];
  for (const [cat, city, area] of sets) {
    for (const c of mockCompanies(cat, city, area, 5, "seed")) {
      const [lead] = await db.insert(schema.leads).values({
        userId, name: c.name, normalizedName: normalizeCompanyName(c.name), domain: domainFromUrl(c.website), website: c.website ?? null,
        address: c.address, area: c.area, city: c.city, pincode: c.pincode, lat: c.lat, lng: c.lng, category: c.category, rating: c.rating,
        reviewsCount: c.reviews, yearEst: c.yearEst, sizeEstimate: c.size, primarySource: "mock", dealValue: 25000 + (c.reviews % 8) * 15000,
      }).onConflictDoNothing().returning({ id: schema.leads.id });
      if (!lead) continue;
      for (const ph of [c.phone, c.phone2].filter(Boolean) as string[]) {
        const n = normalizePhone(ph);
        if (n) await db.insert(schema.leadPhones).values({ userId, leadId: lead.id, e164: n.e164, kind: n.kind, source: "mock" }).onConflictDoNothing();
      }
      if (c.email) await db.insert(schema.leadEmails).values({ userId, leadId: lead.id, email: c.email, kind: "found", confidence: 60, sourceUrl: c.website }).onConflictDoNothing();
      await db.insert(schema.sourceRecords).values({ userId, entityType: "lead", entityId: lead.id, field: "name", value: c.name, provider: "mock", confidence: 50, snippet: "Mock demo data" });
      await db.insert(schema.statusHistory).values({ userId, leadId: lead.id, toStatus: "new", reason: "Demo seed", actor: "system" });
      await db.insert(schema.jobs).values({ userId, type: "enrich", payload: { leadId: lead.id }, idempotencyKey: `enrich:${lead.id}` }).onConflictDoNothing();
    }
  }
  return true;
}
