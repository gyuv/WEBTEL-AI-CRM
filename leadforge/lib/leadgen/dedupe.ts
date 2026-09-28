import { distance } from "fastest-levenshtein";
import { normalizeCompanyName } from "../utils";

export interface DedupeCandidate { id?: string; name: string; domain?: string | null; phones?: string[]; city?: string | null }

export function nameSimilarity(a: string, b: string): number {
  const x = normalizeCompanyName(a), y = normalizeCompanyName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const d = distance(x, y);
  const lev = 1 - d / Math.max(x.length, y.length);
  const ta = new Set(x.split(" ")), tb = new Set(y.split(" "));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const jac = inter / new Set([...ta, ...tb]).size;
  return Math.max(lev, jac);
}

/** Returns the matching existing record (domain, then phone, then fuzzy name in same city) or null. */
export function findDuplicate<T extends DedupeCandidate>(c: DedupeCandidate, existing: T[]): { match: T; reason: string } | null {
  if (c.domain) {
    const m = existing.find((e) => e.domain && e.domain === c.domain);
    if (m) return { match: m, reason: "same domain" };
  }
  if (c.phones?.length) {
    const set = new Set(c.phones);
    const m = existing.find((e) => e.phones?.some((p) => set.has(p)));
    if (m) return { match: m, reason: "same phone" };
  }
  let best: T | null = null, bestScore = 0;
  for (const e of existing) {
    if (c.city && e.city && c.city.toLowerCase() !== e.city.toLowerCase()) continue;
    const s = nameSimilarity(c.name, e.name);
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return best && bestScore >= 0.88 ? { match: best, reason: `similar name (${Math.round(bestScore * 100)}%)` } : null;
}

export function dedupeBatch<T extends DedupeCandidate>(items: T[]): T[] {
  const out: T[] = [];
  for (const it of items) if (!findDuplicate(it, out)) out.push(it);
  return out;
}
