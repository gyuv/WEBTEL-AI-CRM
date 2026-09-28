export type RoleGroup = "founder" | "director" | "hr" | "purchase" | "it" | "sales" | "marketing" | "operations" | "finance" | "other";
export type Seniority = "owner" | "c-level" | "director" | "head" | "manager" | "staff";

const GROUPS: [RoleGroup, RegExp][] = [
  ["founder", /founder|owner|proprietor|partner|promoter/i],
  ["director", /\bmd\b|managing director|director|\bceo\b|chief executive|chairman|president|principal|\bcoo\b/i],
  ["hr", /\bhr\b|human resource|talent|recruit|people ops/i],
  ["purchase", /purchase|procurement|sourcing|buyer|supply chain|vendor/i],
  ["it", /\bit\b|\bcto\b|\bcio\b|technology|systems|software|erp|infrastructure/i],
  ["marketing", /marketing|brand|digital|growth|\bcmo\b/i],
  ["sales", /sales|business development|\bbd\b|account manager|export/i],
  ["finance", /finance|\bcfo\b|accounts|controller/i],
  ["operations", /operations|plant|production|factory|admin|facility|logistics/i],
];

export function classifyTitle(title?: string | null): { roleGroup: RoleGroup; seniority: Seniority; dmScore: number } {
  const t = title ?? "";
  const roleGroup = GROUPS.find(([, re]) => re.test(t))?.[0] ?? "other";
  let seniority: Seniority = "staff";
  if (/founder|owner|proprietor|promoter/i.test(t)) seniority = "owner";
  else if (/\bc[etofim]o\b|chief|managing director|\bmd\b|chairman|president/i.test(t)) seniority = "c-level";
  else if (/director|\bvp\b|vice president|partner|principal/i.test(t)) seniority = "director";
  else if (/head|lead|\bgm\b|general manager/i.test(t)) seniority = "head";
  else if (/manager|incharge|in-charge|supervisor/i.test(t)) seniority = "manager";
  const base = { owner: 95, "c-level": 90, director: 80, head: 65, manager: 50, staff: 20 }[seniority];
  const bonus = ["founder", "director", "purchase", "it"].includes(roleGroup) ? 5 : 0;
  return { roleGroup, seniority, dmScore: Math.min(100, base + bonus) };
}

export const ROLE_SEARCH_GROUPS: { key: string; label: string; keywords: string }[] = [
  { key: "founders", label: "Founders", keywords: "founder OR owner OR proprietor" },
  { key: "directors", label: "Directors", keywords: "director OR CEO OR MD" },
  { key: "hr", label: "HR", keywords: "HR OR \"human resources\"" },
  { key: "purchase", label: "Purchase", keywords: "purchase OR procurement" },
  { key: "it", label: "IT", keywords: "IT OR CTO OR technology" },
  { key: "sales", label: "Sales", keywords: "sales OR \"business development\"" },
  { key: "marketing", label: "Marketing", keywords: "marketing" },
  { key: "operations", label: "Operations", keywords: "operations OR plant OR admin" },
];

export function suggestNextRole(groups: string[]): string {
  const order = ["founder", "director", "purchase", "it", "operations", "hr", "marketing", "sales"];
  const have = new Set(groups);
  return order.find((g) => !have.has(g)) ?? "operations";
}
