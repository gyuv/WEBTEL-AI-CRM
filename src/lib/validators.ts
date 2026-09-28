import { z } from "zod";

/** Converts "" / null to undefined so optional fields from HTML forms validate cleanly. */
const blank = (v: unknown) => (v === "" || v === null ? undefined : v);
const optStr = (max = 500) => z.preprocess(blank, z.string().trim().max(max).optional());
const optEmail = z.preprocess(blank, z.string().trim().toLowerCase().email().max(200).optional());
const optDate = z.preprocess(blank, z.coerce.date().optional());
const money = z.preprocess((v) => (v === "" || v == null ? 0 : v), z.coerce.number().min(0).max(1e12));
const optMoney = z.preprocess(blank, z.coerce.number().min(0).max(1e12).optional());
const optId = z.preprocess(blank, z.string().min(1).max(50).optional());

export const leadStatusValues = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "DEMO_SCHEDULED",
  "DEMO_COMPLETED",
  "QUOTATION_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
  "FOLLOW_UP",
] as const;
export const priorityValues = ["HIGH", "MEDIUM", "LOW"] as const;
export const activityTypeValues = ["CALL", "WHATSAPP", "EMAIL", "MEETING", "DEMO", "FOLLOW_UP", "SITE_VISIT", "NOTE"] as const;
export const opportunityStageValues = [
  "PROSPECTING",
  "QUALIFICATION",
  "DEMO",
  "PROPOSAL",
  "NEGOTIATION",
  "CLOSED_WON",
  "CLOSED_LOST",
] as const;
export const quotationStatusValues = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const;
export const paymentStatusValues = ["PENDING", "PARTIAL", "PAID"] as const;

export const leadSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  companyName: optStr(200),
  phone: z.preprocess(blank, z.string().trim().regex(/^[+0-9 ()-]{6,20}$/, "Invalid phone").optional()),
  email: optEmail,
  city: optStr(100),
  state: optStr(100),
  industry: optStr(100),
  companySize: optStr(50),
  leadSourceId: z.string().min(1, "Lead source is required"),
  leadSourceDetails: optStr(500),
  campaignName: optStr(200),
  referralName: optStr(200),
  assignedUserId: optId,
  status: z.enum(leadStatusValues).default("NEW"),
  priority: z.enum(priorityValues).default("MEDIUM"),
  estimatedValue: money,
  notes: optStr(5000),
  interestedProductIds: z.array(z.string()).max(50).default([]),
});
export type LeadInput = z.infer<typeof leadSchema>;

export const leadSourceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: optStr(500),
  active: z.boolean().default(true),
});

export const customerSchema = z.object({
  leadId: optId,
  customerName: z.string().trim().min(1).max(200),
  companyName: optStr(200),
  phone: optStr(30),
  email: optEmail,
  address: optStr(500),
  city: optStr(100),
  industry: optStr(100),
  numberOfUsers: z.preprocess(blank, z.coerce.number().int().min(0).max(1e6).optional()),
  currentSoftware: optStr(200),
  currentServer: optStr(200),
  currentCloudProvider: optStr(200),
  painPoints: optStr(3000),
  requirements: optStr(3000),
  notes: optStr(5000),
});

const parentRef = {
  leadId: optId,
  customerId: optId,
};
const requireParent = (v: { leadId?: string; customerId?: string }) => !!(v.leadId || v.customerId);
const parentMsg = { message: "A lead or customer is required" };

export const activitySchema = z
  .object({
    ...parentRef,
    activityType: z.enum(activityTypeValues),
    subject: z.string().trim().min(1).max(200),
    description: optStr(5000),
    activityDate: z.preprocess(blank, z.coerce.date().default(() => new Date())),
    nextFollowupDate: optDate,
    status: z.enum(["PLANNED", "COMPLETED", "CANCELLED"]).default("COMPLETED"),
  })
  .refine(requireParent, parentMsg);

export const meetingSchema = z
  .object({
    ...parentRef,
    meetingDate: z.coerce.date(),
    meetingType: z.string().trim().min(1).max(50),
    notes: optStr(5000),
    customerRequirements: optStr(3000),
    objections: optStr(3000),
    productsDiscussed: optStr(1000),
    nextSteps: optStr(2000),
    followupDate: optDate,
  })
  .refine(requireParent, parentMsg);

export const followupSchema = z
  .object({
    ...parentRef,
    followupDate: z.coerce.date(),
    followupType: z.enum(activityTypeValues).default("CALL"),
    reminderTime: z.preprocess(blank, z.string().regex(/^\d{2}:\d{2}$/).optional()),
    message: optStr(2000),
  })
  .refine(requireParent, parentMsg);

export const opportunitySchema = z
  .object({
    ...parentRef,
    opportunityName: z.string().trim().min(1).max(200),
    estimatedAmount: money,
    probability: z.coerce.number().int().min(0).max(100).default(10),
    expectedCloseDate: optDate,
    stage: z.enum(opportunityStageValues).default("PROSPECTING"),
    competitor: optStr(200),
    objections: optStr(2000),
    nextAction: optStr(1000),
    notes: optStr(5000),
    productIds: z.array(z.string()).max(50).default([]),
  })
  .refine(requireParent, parentMsg);

export const productSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  category: optStr(100),
  description: optStr(3000),
  targetCustomer: optStr(1000),
  keyFeatures: optStr(3000),
  benefits: optStr(3000),
  pricing: optMoney,
  pricingType: optStr(100),
  active: z.boolean().default(true),
});

export const quotationItemSchema = z.object({
  productId: optId,
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive().max(1e6),
  unitPrice: z.coerce.number().min(0).max(1e12),
  discount: money,
});

export const quotationSchema = z
  .object({
    ...parentRef,
    quotationDate: z.preprocess(blank, z.coerce.date().default(() => new Date())),
    validUntil: optDate,
    gstPercentage: z.coerce.number().min(0).max(100).default(18),
    discountAmount: money,
    status: z.enum(quotationStatusValues).default("DRAFT"),
    termsAndConditions: optStr(5000),
    notes: optStr(3000),
    items: z.array(quotationItemSchema).min(1, "Add at least one item").max(100),
  })
  .refine(requireParent, parentMsg);
export type QuotationInput = z.infer<typeof quotationSchema>;

export const saleSchema = z
  .object({
    ...parentRef,
    productId: optId,
    amount: z.coerce.number().positive().max(1e12),
    saleDate: z.preprocess(blank, z.coerce.date().default(() => new Date())),
    paymentStatus: z.enum(paymentStatusValues).default("PENDING"),
    notes: optStr(2000),
  })
  .refine(requireParent, parentMsg);

export const userCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  role: z.enum(["USER", "ADMIN"]).default("USER"),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export const leadFilterSchema = z.object({
  q: optStr(100),
  status: z.preprocess(blank, z.enum(leadStatusValues).optional()),
  priority: z.preprocess(blank, z.enum(priorityValues).optional()),
  city: optStr(100),
  leadSourceId: optId,
  assignedUserId: optId,
  campaign: optStr(200),
  productId: optId,
  from: optDate,
  to: optDate,
  sort: z.preprocess(blank, z.enum(["createdAt", "name", "estimatedValue", "status", "priority", "updatedAt"]).optional()),
  dir: z.preprocess(blank, z.enum(["asc", "desc"]).optional()),
  page: z.preprocess(blank, z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess(blank, z.coerce.number().int().min(5).max(100).default(20)),
});
export type LeadFilter = z.infer<typeof leadFilterSchema>;
