import { clamp } from "../utils";

export interface ScoreInput {
  hasWebsite: boolean;
  phones: { kind: string }[];
  emails: { kind: string; confidence: number }[];
  people: { dmScore: number }[];
  painCount: number;
  productMatchTop?: number; // 0-100
  signals: string[];
  rating?: number | null;
  reviewsCount?: number | null;
  categoryMatchesIcp: boolean;
  digitalMaturity: number;
  doNotCall?: boolean;
}

export interface ScoreResult { score: number; fit: number; intent: number; reach: number; explanation: string[]; whyNow: string }

export function scoreLead(i: ScoreInput): ScoreResult {
  const exp: string[] = [];
  let fit = 30;
  if (i.categoryMatchesIcp) { fit += 30; exp.push("Industry matches a product's target industries (+30 fit)"); }
  if (i.productMatchTop) { fit += Math.round(i.productMatchTop * 0.3); exp.push(`Best product match ${i.productMatchTop}%`); }
  if (i.digitalMaturity < 50) { fit += 10; exp.push("Low digital maturity = room to help (+10 fit)"); }
  let intent = 20 + Math.min(40, i.painCount * 10) + Math.min(40, i.signals.length * 15);
  if (i.painCount) exp.push(`${i.painCount} evidence-backed pain point(s)`);
  if (i.signals.length) exp.push(`Buying signals: ${i.signals.join(", ")}`);
  if ((i.reviewsCount ?? 0) > 50) intent += 5;
  let reach = 0;
  const mobiles = i.phones.filter((p) => p.kind === "mobile").length;
  if (mobiles) { reach += 35; exp.push("Mobile number available"); } else if (i.phones.length) { reach += 20; exp.push("Landline available"); }
  if (i.emails.some((e) => e.kind === "found")) { reach += 25; exp.push("Email found on website"); } else if (i.emails.length) reach += 10;
  const dms = i.people.filter((p) => p.dmScore >= 70).length;
  if (dms) { reach += 30; exp.push(`${dms} decision-maker(s) identified`); } else if (i.people.length) reach += 15;
  if (i.hasWebsite) reach += 10;
  if (i.doNotCall) { reach = Math.min(reach, 20); exp.push("On do-not-call list"); }
  fit = clamp(fit); intent = clamp(intent); reach = clamp(reach);
  const score = clamp(fit * 0.4 + intent * 0.35 + reach * 0.25);
  const whyNow = i.signals.length ? `Recent signal: ${i.signals[0]}.` : i.painCount ? "Clear, fixable pain points visible today." : "No strong timing signal yet — nurture.";
  return { score, fit, intent, reach, explanation: exp, whyNow };
}
