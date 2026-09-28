/** Deterministic, realistic-looking FAKE data for mock mode. Everything generated here is marked source "mock". */
import { hashString } from "../utils";

export function rng(seed: string) {
  let h = parseInt(hashString(seed).slice(0, 8), 16) || 1;
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

export function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

export const AREAS = [
  ["Anna Nagar", "600040"], ["T Nagar", "600017"], ["Adyar", "600020"], ["Velachery", "600042"], ["Guindy", "600032"],
  ["Nungambakkam", "600034"], ["Mylapore", "600004"], ["Porur", "600116"], ["Tambaram", "600045"], ["Sholinganallur", "600119"],
  ["Ambattur", "600053"], ["Perungudi", "600096"], ["Egmore", "600008"], ["Vadapalani", "600026"], ["Chromepet", "600044"],
] as const;

export const TIRUPUR_AREAS = [["Avinashi Road", "641603"], ["Kumar Nagar", "641603"], ["Palladam Road", "641604"], ["Tiruppur North", "641602"]] as const;

const PREFIX = ["Sri", "Sree", "New", "Royal", "Shree", "Golden", "Lakshmi", "Murugan", "Kaveri", "Vel", "Annai", "Balaji", "Ganesh", "Sakthi", "Kumaran", "Chola", "Pandian", "Vijay", "Surya", "Aadhya"];
const FIRST = ["Karthik", "Priya", "Arun", "Divya", "Senthil", "Lakshmi", "Ramesh", "Meena", "Vignesh", "Kavitha", "Suresh", "Anitha", "Prakash", "Deepa", "Mohan", "Revathi", "Ganesh", "Sangeetha", "Rajesh", "Nithya", "Bala", "Janani", "Vijay", "Harini"];
const LAST = ["Kumar", "Raman", "Subramanian", "Krishnan", "Natarajan", "Srinivasan", "Venkatesh", "Raghavan", "Sundaram", "Iyer", "Pillai", "Murthy", "Rajan", "Selvam", "Chandran", "Balasubramanian"];
const STREETS = ["2nd Avenue", "Main Road", "Gandhi Street", "Nehru Street", "100 Feet Road", "Bazaar Road", "1st Cross Street", "Kamarajar Salai", "Mount Road", "Arcot Road"];

const SUFFIX: Record<string, string[]> = {
  "Dental clinic": ["Dental Care", "Dental Clinic", "Smile Dental", "Multispeciality Dental", "Dental Studio"],
  Clinic: ["Clinic", "Medical Centre", "Health Care", "Polyclinic"],
  Hospital: ["Hospital", "Hospitals", "Nursing Home", "Speciality Hospital"],
  "Garment manufacturer/exporter": ["Exports", "Knit Fashions", "Garments", "Apparels", "Textiles", "Knitwear"],
  Restaurant: ["Restaurant", "Mess", "Biryani House", "Veg Restaurant", "Cafe"],
  Education: ["Academy", "Coaching Centre", "Matriculation School", "Institute"],
  "Real estate": ["Builders", "Properties", "Homes", "Developers", "Realty"],
  default: ["Enterprises", "Industries", "Solutions", "Traders", "Associates", "Services"],
};

export function mockPersonName(r: () => number) {
  return `${pick(r, FIRST)} ${pick(r, LAST)}`;
}

export interface MockCompany {
  name: string; area: string; pincode: string; city: string; address: string; category: string; phone: string; phone2?: string;
  website?: string; email?: string; rating: number; reviews: number; lat: number; lng: number; yearEst: number; size: string;
}

export function mockCompanies(category: string, city: string, area: string | undefined, count: number, seed: string): MockCompany[] {
  const r = rng(`${seed}:${category}:${city}:${area}`);
  const out: MockCompany[] = [];
  const suffixes = SUFFIX[category] ?? SUFFIX.default;
  const areas: readonly (readonly [string, string])[] = /tirupur/i.test(city) ? TIRUPUR_AREAS : AREAS;
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const [ar, pin] = area ? ([area, areas.find((a) => a[0] === area)?.[1] ?? "600001"] as const) : pick(r, areas);
    let name = `${pick(r, PREFIX)} ${pick(r, suffixes)}`;
    if (used.has(name)) name = `${pick(r, PREFIX)} ${pick(r, LAST)} ${pick(r, suffixes)}`;
    used.add(name);
    const slug = name.toLowerCase().replace(/[^a-z]+/g, "");
    const hasSite = r() > 0.3;
    const mobile = `+91 9${Math.floor(r() * 1e9).toString().padStart(9, "0")}`;
    const land = `+91 44 ${Math.floor(20000000 + r() * 79999999)}`;
    out.push({
      name, area: ar, pincode: pin, city: /tirupur/i.test(city) ? "Tirupur" : city,
      address: `No. ${1 + Math.floor(r() * 180)}, ${pick(r, STREETS)}, ${ar}, ${city} - ${pin}`,
      category, phone: r() > 0.4 ? mobile : land, phone2: r() > 0.7 ? land : undefined,
      website: hasSite ? `https://www.${slug}.example.in` : undefined,
      email: hasSite && r() > 0.4 ? `info@${slug}.example.in` : undefined,
      rating: Math.round((3.2 + r() * 1.7) * 10) / 10, reviews: Math.floor(r() * 400),
      lat: 13.0827 + (r() - 0.5) * 0.2, lng: 80.2707 + (r() - 0.5) * 0.2,
      yearEst: 1985 + Math.floor(r() * 38), size: pick(r, ["1-10", "11-50", "11-50", "51-200", "201-500"]),
    });
  }
  return out;
}

export const MOCK_TITLES = [
  "Founder & Managing Director", "Proprietor", "Director", "Chief Executive Officer", "Head of Operations", "HR Manager",
  "Purchase Manager", "IT Manager", "Marketing Manager", "Sales Head", "Admin Manager", "Accounts Manager", "Co-Founder",
];

export function mockPeople(company: string, domain: string | null, n: number) {
  const r = rng(`people:${company}`);
  const people = [];
  const titles = [...MOCK_TITLES];
  for (let i = 0; i < n; i++) {
    const name = mockPersonName(r);
    const title = titles.splice(Math.floor(r() * titles.length), 1)[0] ?? "Manager";
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    people.push({
      name, title,
      headline: `${title} at ${company}`,
      location: "Chennai, Tamil Nadu, India",
      profileUrl: `https://www.linkedin.com/in/${slug}-${Math.floor(r() * 9000 + 1000)}`,
      snippet: `${name} – ${title} – ${company}. Chennai, Tamil Nadu. ${pick(r, ["15+ years in the industry.", "Passionate about quality and customers.", "Growing the team in 2026.", "Ex-TVS, ex-Ashok Leyland."])}`,
      domain,
    });
  }
  return people;
}
