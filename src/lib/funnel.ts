import type { LeadStatus } from "@prisma/client";

/** Ordered funnel stages. LOST / FOLLOW_UP are not funnel stages. */
export const STAGE_RANK: Record<LeadStatus, number | null> = {
  NEW: 0,
  CONTACTED: 1,
  INTERESTED: 2,
  DEMO_SCHEDULED: 3,
  DEMO_COMPLETED: 4,
  QUOTATION_SENT: 5,
  NEGOTIATION: 6,
  WON: 7,
  LOST: null,
  FOLLOW_UP: 1, // a follow-up implies the lead has at least been contacted
};

export const RANK = {
  CONTACTED: 1,
  INTERESTED: 2,
  DEMO: 3,
  DEMO_COMPLETED: 4,
  QUOTATION: 5,
  NEGOTIATION: 6,
  WON: 7,
} as const;

export const OPEN_STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "DEMO_SCHEDULED",
  "DEMO_COMPLETED",
  "QUOTATION_SENT",
  "NEGOTIATION",
  "FOLLOW_UP",
];

/** Returns the new highest stage rank after moving to `status`. Never decreases. */
export function nextHighestRank(current: number, status: LeadStatus): number {
  const r = STAGE_RANK[status];
  return r === null ? current : Math.max(current, r);
}

export function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
