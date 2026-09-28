/** Rule-based pain-point library. Every pain is produced only from concrete evidence. */
export interface PainDef { key: string; title: string; keywords: string[] }

export const PAIN_LIBRARY: PainDef[] = [
  { key: "no_website", title: "No website", keywords: ["website", "online presence", "web design", "digital presence"] },
  { key: "no_ssl", title: "Website not secure (no HTTPS)", keywords: ["ssl", "security", "https", "website", "hosting"] },
  { key: "not_mobile", title: "Website not mobile-friendly", keywords: ["mobile", "responsive", "website", "web design"] },
  { key: "slow_site", title: "Slow website", keywords: ["speed", "performance", "hosting", "website"] },
  { key: "outdated_site", title: "Outdated website", keywords: ["website", "redesign", "web design", "outdated"] },
  { key: "no_booking", title: "No online booking / enquiry form", keywords: ["booking", "appointment", "scheduling", "lead capture", "enquiry", "forms"] },
  { key: "no_chat", title: "No chat or WhatsApp on website", keywords: ["chat", "whatsapp", "chatbot", "customer support", "lead capture"] },
  { key: "no_crm", title: "No CRM / lead tracking detected", keywords: ["crm", "lead management", "follow-up", "sales tracking", "pipeline"] },
  { key: "no_analytics", title: "No analytics tracking", keywords: ["analytics", "marketing", "tracking", "seo", "digital marketing"] },
  { key: "weak_seo", title: "Weak SEO basics", keywords: ["seo", "google ranking", "digital marketing", "visibility"] },
  { key: "low_rating", title: "Below-average customer rating", keywords: ["reviews", "reputation", "customer experience", "feedback"] },
  { key: "few_reviews", title: "Few online reviews", keywords: ["reviews", "reputation", "google business", "visibility"] },
  { key: "hiring_sales", title: "Scaling sales team manually", keywords: ["sales", "crm", "automation", "lead management", "telecalling"] },
  { key: "no_online_payment", title: "No online payments", keywords: ["payments", "payment gateway", "billing", "invoicing", "ecommerce"] },
  { key: "no_social", title: "Little social media presence", keywords: ["social media", "marketing", "branding", "digital marketing"] },
];

export const BOOKING_CATEGORIES = /dental|clinic|hospital|salon|spa|gym|school|academy|coaching|restaurant|hotel|diagnostic|physio/i;

export function productCoversPain(problemsSolved: string[], painKey: string): boolean {
  const def = PAIN_LIBRARY.find((p) => p.key === painKey);
  const probs = problemsSolved.map((p) => p.toLowerCase());
  return probs.some((p) => p === painKey || (def?.keywords.some((k) => p.includes(k) || k.includes(p)) ?? false));
}

export function industryMatch(targetIndustries: string[], category?: string | null): boolean {
  if (!category) return false;
  const c = category.toLowerCase();
  return targetIndustries.some((t) => {
    const x = t.toLowerCase();
    return x === "all" || c.includes(x) || x.includes(c) || x.split(/[\s/,]+/).some((w) => w.length > 3 && c.includes(w));
  });
}
