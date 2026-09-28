import { domainFromUrl } from "../utils";

export type InputType = "query" | "names" | "urls" | "maps" | "csv";

export interface SearchIntent {
  category: string;
  location: string;
  area?: string;
  synonyms: string[];
  keywords: string[];
  sizeHint?: string;
  osmTags: { key: string; value: string }[];
}

export interface ParsedInput { type: InputType; items: string[]; intent?: SearchIntent }

/** Category dictionary → OSM tags + synonyms. Extend freely. */
export const CATEGORY_MAP: { match: RegExp; category: string; tags: [string, string][]; synonyms: string[] }[] = [
  { match: /dent/i, category: "Dental clinic", tags: [["amenity", "dentist"], ["healthcare", "dentist"]], synonyms: ["dentist", "dental care", "orthodontist"] },
  { match: /hospital/i, category: "Hospital", tags: [["amenity", "hospital"]], synonyms: ["multi-speciality hospital", "nursing home"] },
  { match: /clinic|doctor|physician/i, category: "Clinic", tags: [["amenity", "clinic"], ["amenity", "doctors"]], synonyms: ["medical centre", "polyclinic"] },
  { match: /pharma|chemist|medical shop/i, category: "Pharmacy", tags: [["amenity", "pharmacy"]], synonyms: ["chemist", "medical store"] },
  { match: /garment|apparel|textile|knit/i, category: "Garment manufacturer/exporter", tags: [["craft", "tailor"], ["shop", "clothes"], ["industrial", "textile"], ["man_made", "works"]], synonyms: ["apparel exporter", "knitwear", "textile mill"] },
  { match: /restaurant|hotel|biryani|cafe|food/i, category: "Restaurant", tags: [["amenity", "restaurant"], ["amenity", "cafe"]], synonyms: ["eatery", "mess", "cafe"] },
  { match: /school|academy|coaching|tuition|institute|college/i, category: "Education", tags: [["amenity", "school"], ["amenity", "college"], ["office", "educational_institution"]], synonyms: ["coaching centre", "training institute"] },
  { match: /real estate|builder|developer|property/i, category: "Real estate", tags: [["office", "estate_agent"], ["office", "company"]], synonyms: ["builders", "property developer"] },
  { match: /gym|fitness/i, category: "Gym / fitness", tags: [["leisure", "fitness_centre"]], synonyms: ["fitness studio", "yoga"] },
  { match: /salon|spa|beauty/i, category: "Salon / spa", tags: [["shop", "beauty"], ["shop", "hairdresser"]], synonyms: ["beauty parlour", "unisex salon"] },
  { match: /auto|car|garage|service cent/i, category: "Automotive", tags: [["shop", "car_repair"], ["shop", "car"]], synonyms: ["car service", "showroom"] },
  { match: /hardware|electrical|plumb/i, category: "Hardware / electrical", tags: [["shop", "hardware"], ["shop", "electrical"]], synonyms: ["building materials"] },
  { match: /logistic|transport|courier|cargo/i, category: "Logistics", tags: [["office", "logistics"], ["office", "courier"]], synonyms: ["transporters", "freight forwarder"] },
  { match: /software|it compan|saas|tech/i, category: "IT / software", tags: [["office", "it"], ["office", "company"]], synonyms: ["IT services", "software company"] },
  { match: /ca\b|chartered|account|audit/i, category: "Accounting / CA firm", tags: [["office", "accountant"], ["office", "tax_advisor"]], synonyms: ["auditors", "tax consultant"] },
  { match: /law|advocate|legal/i, category: "Law firm", tags: [["office", "lawyer"]], synonyms: ["advocates", "legal services"] },
  { match: /manufactur|factory|industr|engineering/i, category: "Manufacturing", tags: [["man_made", "works"], ["industrial", "factory"], ["craft", "metal_construction"]], synonyms: ["industries", "engineering works"] },
  { match: /jewel/i, category: "Jewellery", tags: [["shop", "jewelry"]], synonyms: ["jewellers", "gold shop"] },
  { match: /super ?market|grocery|store/i, category: "Retail", tags: [["shop", "supermarket"], ["shop", "convenience"]], synonyms: ["departmental store"] },
  { match: /hotel|lodge|resort/i, category: "Hotel", tags: [["tourism", "hotel"]], synonyms: ["lodge", "resort"] },
];

export const KNOWN_PLACES = [
  "Anna Nagar", "T Nagar", "Adyar", "Velachery", "Guindy", "Nungambakkam", "Mylapore", "Porur", "Tambaram", "OMR", "Sholinganallur",
  "Ambattur", "Perungudi", "Egmore", "Kodambakkam", "Chromepet", "Thiruvanmiyur", "Vadapalani", "Royapettah", "Teynampet",
  "Chennai", "Tirupur", "Coimbatore", "Madurai", "Trichy", "Tiruchirappalli", "Salem", "Erode", "Hosur", "Vellore", "Karur",
  "Bengaluru", "Bangalore", "Hyderabad", "Mumbai", "Pune", "Delhi", "Kochi", "Puducherry",
];

export function detectInputType(raw: string): InputType {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "query";
  if (lines.length > 1 && lines[0].includes(",") && lines.slice(1).every((l) => l.split(",").length === lines[0].split(",").length)) return "csv";
  if (lines.every((l) => /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(l))) return "maps";
  if (lines.every((l) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(l) && domainFromUrl(l))) return "urls";
  if (lines.length > 1) return "names";
  return "query";
}

export function parseQueryIntent(q: string, defaultCity = "Chennai"): SearchIntent {
  const text = q.trim();
  const cat = CATEGORY_MAP.find((c) => c.match.test(text));
  let location = "";
  let area: string | undefined;
  const inMatch = text.match(/\b(?:in|at|near|around)\s+([A-Za-z .]+?)(?:,|$|\s+with|\s+having|\s+that)/i);
  const known = KNOWN_PLACES.filter((p) => new RegExp(`\\b${p}\\b`, "i").test(text));
  if (known.length) {
    const cities = ["Chennai", "Tirupur", "Coimbatore", "Madurai", "Trichy", "Tiruchirappalli", "Salem", "Erode", "Hosur", "Vellore", "Karur", "Bengaluru", "Bangalore", "Hyderabad", "Mumbai", "Pune", "Delhi", "Kochi", "Puducherry"];
    const city = known.find((k) => cities.includes(k));
    const ar = known.find((k) => !cities.includes(k));
    area = ar;
    location = city ?? (ar ? defaultCity : "");
  } else if (inMatch) {
    location = inMatch[1].trim();
  }
  if (!location) location = defaultCity;
  const sizeHint = /\bsmall\b|\bsme\b/i.test(text) ? "small" : /\blarge\b|\bbig\b|enterprise/i.test(text) ? "large" : /\bmedium\b|\bmid\b/i.test(text) ? "medium" : undefined;
  const stop = new Set(["in", "at", "near", "around", "the", "and", "with", "small", "large", "medium", "of", "for", ...(area ? area.toLowerCase().split(" ") : []), ...location.toLowerCase().split(" ")]);
  const keywords = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
  const category = cat?.category ?? (keywords.join(" ") || text);
  return {
    category,
    location,
    area,
    synonyms: cat?.synonyms ?? [],
    keywords,
    sizeHint,
    osmTags: (cat?.tags ?? []).map(([key, value]) => ({ key, value })),
  };
}

export function parseInput(raw: string, defaultCity = "Chennai"): ParsedInput {
  const type = detectInputType(raw);
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (type === "query") return { type, items: [raw.trim()], intent: parseQueryIntent(raw, defaultCity) };
  return { type, items: lines };
}

/** Pull a readable place name out of a Google Maps URL (no fetching of Google). */
export function nameFromMapsUrl(url: string): string | null {
  const m = url.match(/\/maps\/place\/([^/@?]+)/);
  if (m) return decodeURIComponent(m[1].replace(/\+/g, " "));
  const q = url.match(/[?&]q=([^&]+)/);
  return q ? decodeURIComponent(q[1].replace(/\+/g, " ")) : null;
}
