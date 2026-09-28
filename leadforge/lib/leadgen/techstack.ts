export interface SiteAudit {
  ssl: boolean;
  mobileViewport: boolean;
  title?: string;
  metaDescription: boolean;
  h1: boolean;
  responseMs?: number;
  htmlKb?: number;
  copyrightYear?: number;
  hasBookingOrForm: boolean;
  hasChat: boolean;
  hasWhatsappWidget: boolean;
  hasEcommerce: boolean;
  hasBlog: boolean;
  hasCareers: boolean;
}

const SIGS: [string, RegExp][] = [
  ["WordPress", /wp-content|wp-includes/i],
  ["Shopify", /cdn\.shopify\.com|Shopify\.theme/i],
  ["Wix", /wix\.com|_wixCIDX|wixstatic/i],
  ["Squarespace", /squarespace/i],
  ["Webflow", /webflow/i],
  ["Zoho Sites", /zohosites|sites\.zoho/i],
  ["Next.js", /__NEXT_DATA__|_next\/static/i],
  ["React", /react(-dom)?(\.production)?\.min\.js|data-reactroot/i],
  ["Bootstrap", /bootstrap(\.min)?\.css/i],
  ["jQuery", /jquery(\.min)?\.js/i],
  ["Google Analytics", /googletagmanager\.com\/gtag|google-analytics\.com|gtag\(/i],
  ["Google Tag Manager", /googletagmanager\.com\/gtm/i],
  ["Meta Pixel", /connect\.facebook\.net\/.*fbevents|fbq\(/i],
  ["Hotjar", /hotjar/i],
  ["Tawk.to chat", /tawk\.to/i],
  ["Intercom", /intercom/i],
  ["Zendesk", /zendesk|zdassets/i],
  ["Freshworks", /freshchat|freshdesk|freshworks/i],
  ["Zoho SalesIQ/CRM", /salesiq|zoho\.com\/crm|zohopublic/i],
  ["HubSpot", /hs-scripts|hubspot/i],
  ["Razorpay", /razorpay/i],
  ["PayU", /payu/i],
  ["Paytm", /paytm/i],
  ["Stripe", /js\.stripe\.com/i],
  ["WooCommerce", /woocommerce/i],
  ["Calendly", /calendly/i],
  ["Practo", /practo/i],
  ["WhatsApp widget", /wa\.me\/|api\.whatsapp\.com|whatsapp-widget/i],
  ["reCAPTCHA", /recaptcha/i],
  ["Cloudflare", /cloudflare|cf-ray/i],
];

export function detectTech(html: string, headers: Record<string, string> = {}): string[] {
  const hay = html + " " + Object.entries(headers).map(([k, v]) => `${k}:${v}`).join(" ");
  return SIGS.filter(([, re]) => re.test(hay)).map(([n]) => n);
}

export function auditHtml(html: string, url: string, responseMs?: number): SiteAudit {
  const lower = html.toLowerCase();
  const years = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1])).filter((y) => y > 1995 && y < 2100);
  return {
    ssl: url.startsWith("https://"),
    mobileViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim(),
    metaDescription: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html),
    h1: /<h1[\s>]/i.test(html),
    responseMs,
    htmlKb: Math.round(html.length / 1024),
    copyrightYear: years.length ? Math.max(...years) : undefined,
    hasBookingOrForm: /<form[\s>]/i.test(html) && /(book|appointment|enquir|contact|quote|schedule)/i.test(lower),
    hasChat: /tawk\.to|intercom|zendesk|freshchat|salesiq|crisp\.chat|drift/i.test(lower),
    hasWhatsappWidget: /wa\.me\/|api\.whatsapp\.com/i.test(lower),
    hasEcommerce: /add to cart|woocommerce|shopify|checkout/i.test(lower),
    hasBlog: /href=["'][^"']*\/(blog|news|articles)/i.test(lower),
    hasCareers: /href=["'][^"']*\/(careers?|jobs|join-us|work-with-us)/i.test(lower),
  };
}

export function digitalMaturity(tech: string[], a: Partial<SiteAudit> | null, hasWebsite: boolean): number {
  if (!hasWebsite) return 10;
  let s = 25;
  if (a?.ssl) s += 10;
  if (a?.mobileViewport) s += 10;
  if (a?.metaDescription) s += 5;
  if (a?.hasBookingOrForm) s += 10;
  if (a?.hasChat || a?.hasWhatsappWidget) s += 8;
  if (tech.some((t) => /Analytics|Tag Manager|Pixel|Hotjar/.test(t))) s += 10;
  if (tech.some((t) => /HubSpot|Zoho|Freshworks|Intercom|Zendesk/.test(t))) s += 12;
  if (tech.some((t) => /Razorpay|PayU|Paytm|Stripe|WooCommerce|Shopify/.test(t))) s += 5;
  if (a?.copyrightYear && a.copyrightYear >= new Date().getFullYear() - 1) s += 5;
  return Math.min(100, s);
}
