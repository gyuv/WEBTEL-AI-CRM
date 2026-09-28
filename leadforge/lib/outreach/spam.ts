export const SPAM_WORDS = [
  "free", "guarantee", "guaranteed", "100%", "act now", "urgent", "limited time", "risk-free", "no obligation", "winner",
  "cash", "earn money", "double your", "click here", "buy now", "order now", "cheap", "lowest price", "best price", "offer expires",
  "congratulations", "dear friend", "increase sales", "incredible deal", "miracle", "once in a lifetime", "special promotion",
  "unsecured", "credit", "$$$", "₹₹", "!!!", "amazing", "exclusive deal", "call now", "apply now", "hurry",
];

export interface EmailCheck { words: number; spamHits: string[]; tooLong: boolean; tooShort: boolean; hasOptOut: boolean; subjectLen: number; linkCount: number; score: number; tips: string[] }

export function checkEmail(subject: string, body: string): EmailCheck {
  const text = `${subject}\n${body}`.toLowerCase();
  const spamHits = SPAM_WORDS.filter((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\$]/g, "\\$&")}([^a-z]|$)`, "i").test(text));
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const linkCount = (body.match(/https?:\/\//g) ?? []).length;
  const hasOptOut = /unsubscribe|opt[ -]?out|not interested.*reply|reply ["']?stop/i.test(body);
  const tips: string[] = [];
  if (words > 150) tips.push("Keep cold emails under ~120 words.");
  if (words < 40) tips.push("Very short; add one line of relevant context.");
  if (subject.length > 60) tips.push("Subject over 60 characters may be cut off on mobile.");
  if (spamHits.length) tips.push(`Replace spam-trigger words: ${spamHits.join(", ")}`);
  if (linkCount > 1) tips.push("Use at most one link in a first-touch email.");
  if (!hasOptOut) tips.push("Add an opt-out line (e.g. 'Reply STOP and I won't email again').");
  if (/[A-Z]{5,}/.test(subject + body)) tips.push("Avoid ALL-CAPS words.");
  const score = Math.max(0, 100 - spamHits.length * 12 - (words > 150 ? 15 : 0) - (linkCount > 1 ? 10 : 0) - (hasOptOut ? 0 : 15) - (subject.length > 60 ? 5 : 0));
  return { words, spamHits, tooLong: words > 150, tooShort: words < 40, hasOptOut, subjectLen: subject.length, linkCount, score, tips };
}

export const OPT_OUT_LINE = "If this isn't relevant, just reply \"STOP\" and I won't email you again.";
