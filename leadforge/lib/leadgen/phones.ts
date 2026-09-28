import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export interface NormalizedPhone { e164: string; kind: "mobile" | "landline" | "tollfree" | "unknown"; national: string }

export function normalizePhone(raw: string, defaultCountry: "IN" = "IN"): NormalizedPhone | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.replace(/\D/g, "").length < 8) return null;
  const p = parsePhoneNumberFromString(cleaned.startsWith("00") ? "+" + cleaned.slice(2) : cleaned, defaultCountry);
  if (!p || !p.isPossible()) return null;
  const t = p.getType();
  let kind: NormalizedPhone["kind"] = "unknown";
  if (t === "MOBILE") kind = "mobile";
  else if (t === "FIXED_LINE") kind = "landline";
  else if (t === "TOLL_FREE") kind = "tollfree";
  else if (t === "FIXED_LINE_OR_MOBILE") kind = /^[6-9]/.test(p.nationalNumber) && p.country === "IN" ? "mobile" : "landline";
  else if (p.country === "IN" && p.nationalNumber.length === 10) kind = /^[6-9]/.test(p.nationalNumber) ? "mobile" : "landline";
  return { e164: p.number, kind, national: p.formatNational() };
}

export function extractPhones(text: string): NormalizedPhone[] {
  const re = /(?:\+91[\s-]?|0091[\s-]?|\b0)?(?:\d[\s-]?){9,11}\d?/g;
  const out = new Map<string, NormalizedPhone>();
  for (const m of text.match(re) ?? []) {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) continue;
    if (/^(19|20)\d{2}/.test(digits) && digits.length === 10 && !/^[6-9]/.test(digits)) continue; // likely a date/year sequence
    const n = normalizePhone(m);
    if (n) out.set(n.e164, n);
  }
  return [...out.values()];
}

export function waLink(e164: string, text?: string) {
  return `https://wa.me/${e164.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
