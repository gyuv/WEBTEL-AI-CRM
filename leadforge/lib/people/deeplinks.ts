import { ROLE_SEARCH_GROUPS } from "./roles";

export interface DeepLink { key: string; label: string; url: string; kind: "linkedin" | "google" }

/** Links that open in the user's OWN browser session. LeadForge never fetches these pages. */
export function linkedinDeepLinks(company: string, city?: string | null, linkedinCompanyUrl?: string | null): DeepLink[] {
  const q = (kw: string) => encodeURIComponent(`${kw} "${company}"`);
  const links: DeepLink[] = ROLE_SEARCH_GROUPS.map((g) => ({
    key: `li-${g.key}`, label: g.label, kind: "linkedin" as const,
    url: `https://www.linkedin.com/search/results/people/?keywords=${q(g.keywords.replace(/"/g, ""))}&origin=GLOBAL_SEARCH_HEADER`,
  }));
  links.push({
    key: "li-all", label: "All employees", kind: "linkedin",
    url: linkedinCompanyUrl
      ? `${linkedinCompanyUrl.replace(/\/$/, "")}/people/`
      : `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"${company}"`)}`,
  });
  links.push({
    key: "li-company", label: "Company page", kind: "linkedin",
    url: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company)}`,
  });
  for (const g of ROLE_SEARCH_GROUPS.slice(0, 4)) {
    links.push({
      key: `xr-${g.key}`, label: `X-ray: ${g.label}`, kind: "google",
      url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${company}" ${city ?? ""} (${g.keywords})`)}`,
    });
  }
  return links;
}

export function xrayQueries(company: string, city?: string | null): string[] {
  return ROLE_SEARCH_GROUPS.slice(0, 6).map((g) => `site:linkedin.com/in "${company}" ${city ?? ""} ${g.keywords}`.trim());
}

/** Parses a public search-result title/snippet like "Priya R - Founder - Acme Dental | LinkedIn". */
export function parseLinkedinSearchResult(title: string, snippet: string, url: string) {
  if (!/linkedin\.com\/in\//i.test(url)) return null;
  const clean = title.replace(/\s*[|–-]\s*LinkedIn\s*$/i, "").trim();
  const parts = clean.split(/\s+[-–|]\s+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const name = parts[0];
  if (!/^[\p{L} .'-]{3,60}$/u.test(name)) return null;
  const headline = parts.slice(1).join(" - ") || null;
  const location = snippet.match(/(?:Location|Based in)[:\s]+([A-Za-z ,]+?)(?:[·.|]|$)/i)?.[1]?.trim()
    ?? snippet.match(/\b(Chennai|Bengaluru|Coimbatore|Tirupur|Madurai|Hyderabad|Mumbai)[^·.|]*/i)?.[0]?.trim() ?? null;
  return { name, headline, location, profileUrl: url.split("?")[0] };
}
