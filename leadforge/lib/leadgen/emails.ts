import { normalizePersonName } from "../utils";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const JUNK = /\.(png|jpe?g|gif|svg|webp)$|example\.|sentry|wixpress|@2x|domain\.com|email\.com|yourname/i;

export function extractEmails(text: string): string[] {
  const set = new Set<string>();
  const decoded = text.replace(/\s*\[at\]\s*|\s*\(at\)\s*/gi, "@").replace(/\s*\[dot\]\s*|\s*\(dot\)\s*/gi, ".");
  for (const m of decoded.match(EMAIL_RE) ?? []) {
    const e = m.toLowerCase().replace(/^mailto:/, "");
    if (!JUNK.test(e)) set.add(e);
  }
  return [...set];
}

export interface EmailGuess { email: string; confidence: number; pattern: string }

/** Pattern guesses. These are GUESSES and must always be labelled as such in the UI. */
export function guessEmails(fullName: string | null, domain: string, knownEmails: string[] = []): EmailGuess[] {
  const out: EmailGuess[] = [];
  const known = knownEmails.filter((e) => e.endsWith("@" + domain)).map((e) => e.split("@")[0]);
  const parts = fullName ? normalizePersonName(fullName).split(" ").filter(Boolean) : [];
  const [f, l] = [parts[0], parts.length > 1 ? parts[parts.length - 1] : undefined];
  const inferred = inferPattern(known);
  if (f) {
    const cands: [string, string, number][] = [
      ["first", f, 40],
      ["first.last", l ? `${f}.${l}` : "", 35],
      ["firstlast", l ? `${f}${l}` : "", 25],
      ["flast", l ? `${f[0]}${l}` : "", 20],
      ["first_l", l ? `${f}${l[0]}` : "", 15],
    ];
    for (const [pattern, local, base] of cands) {
      if (!local) continue;
      out.push({ email: `${local}@${domain}`, pattern, confidence: inferred === pattern ? 75 : base });
    }
  } else {
    for (const [local, c] of [["info", 45], ["sales", 35], ["contact", 30], ["enquiry", 20], ["admin", 15]] as const) {
      if (!known.includes(local)) out.push({ email: `${local}@${domain}`, pattern: "role", confidence: c });
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

export function inferPattern(localParts: string[]): string | null {
  for (const lp of localParts) {
    if (/^[a-z]+\.[a-z]+$/.test(lp)) return "first.last";
    if (/^[a-z]+_[a-z]$/.test(lp)) return "first_l";
  }
  return null;
}

export async function hasMx(domain: string): Promise<boolean | null> {
  try {
    const dns = await import("node:dns/promises");
    const mx = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ]);
    return mx.length > 0;
  } catch (e) {
    const code = (e as { code?: string }).code;
    return code === "ENOTFOUND" || code === "ENODATA" ? false : null;
  }
}
