import { z } from "zod";

export const EvidenceSchema = z.object({ id: z.string(), fact: z.string(), sourceUrl: z.string().nullable(), provider: z.string(), collectedAt: z.string().nullable() });
export type Evidence = z.infer<typeof EvidenceSchema>;

export const AnalysisSchema = z.object({
  summary: z.string(),
  industry: z.string(),
  sizeEstimate: z.string(),
  digitalMaturity: z.number().min(0).max(100),
  dataQuality: z.enum(["good", "thin", "insufficient"]),
  pains: z.array(z.object({ key: z.string().optional(), title: z.string(), detail: z.string(), confidence: z.number().min(0).max(100), evidenceIds: z.array(z.string()) })),
  signals: z.array(z.object({ title: z.string(), confidence: z.number().min(0).max(100), evidenceIds: z.array(z.string()) })),
  matches: z.array(z.object({
    productId: z.string(), productName: z.string(), fitPct: z.number().min(0).max(100), reasoning: z.string(),
    targetRole: z.string(), targetPersonId: z.string().nullable().default(null),
    objections: z.array(z.object({ objection: z.string(), rebuttal: z.string() })), openingLine: z.string(),
  })),
  whyNow: z.string(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

const Script = z.object({ short: z.string(), long: z.string() });
export const AssetsSchema = z.object({
  productId: z.string().nullable(),
  personId: z.string().nullable(),
  callScripts: z.object({ en: Script, ta: Script, tanglish: Script }),
  voicemail: z.string(),
  gatekeeper: z.array(z.string()),
  emails: z.array(z.object({ variant: z.string(), subject: z.string(), altSubjects: z.array(z.string()), body: z.string() })),
  followUps: z.array(z.object({ day: z.number(), subject: z.string(), body: z.string() })),
  breakup: z.object({ subject: z.string(), body: z.string() }),
  whatsapp: z.string(),
  linkedinNote: z.string().max(300),
  linkedinFollowUp: z.string(),
  objections: z.array(z.object({ objection: z.string(), rebuttal: z.string() })),
});
export type Assets = z.infer<typeof AssetsSchema>;

export const ProductAutofillSchema = z.object({
  name: z.string(), category: z.string(), shortDesc: z.string(), longDesc: z.string(),
  targetIndustries: z.array(z.string()), icp: z.string(), problemsSolved: z.array(z.string()), benefits: z.array(z.string()),
  pricing: z.string(), usps: z.array(z.string()), competitors: z.array(z.string()),
  objections: z.array(z.object({ objection: z.string(), rebuttal: z.string() })),
});

export const ReplyAnalysisSchema = z.object({
  label: z.enum(["interested", "meeting_request", "question", "objection_price", "objection_timing", "objection_competitor", "objection_need", "not_interested", "out_of_office", "unsubscribe", "bounce", "auto_responder"]),
  confidence: z.number().min(0).max(100),
  summary: z.string(),
  drafts: z.array(z.object({ tone: z.string(), body: z.string() })),
});

export const NotesSummarySchema = z.object({ summary: z.string(), nextActions: z.array(z.string()), followUpInDays: z.number().nullable() });

export const PersonAiSchema = z.object({ icebreaker: z.string(), connectionNote: z.string().max(300) });
