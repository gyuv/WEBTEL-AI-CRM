/** Deterministic, evidence-only analysis + asset templates. Used in mock mode and as the LLM fallback. */
import type { Analysis, Assets, Evidence } from "./schemas";
import { PAIN_LIBRARY, BOOKING_CATEGORIES, productCoversPain, industryMatch } from "./pains";
import { digitalMaturity } from "../leadgen/techstack";
import { OPT_OUT_LINE } from "../outreach/spam";
import { firstName } from "../utils";

export interface LeadCtx {
  lead: { id: string; name: string; category: string | null; city: string | null; area: string | null; website: string | null; rating: number | null; reviewsCount: number | null; yearEst: number | null; sizeEstimate: string | null; socials: Record<string, string>; whatsapp: string | null };
  tech: string[];
  audit: Record<string, unknown> | null;
  people: { id: string; fullName: string; title: string | null; roleGroup: string | null; dmScore: number; headline: string | null }[];
  evidence: Evidence[];
}

export interface ProductCtx {
  id: string; name: string; category: string | null; shortDesc: string | null; targetIndustries: string[]; problemsSolved: string[];
  benefits: string[]; usps: string[]; pricing: string | null; objections: { objection: string; rebuttal: string }[]; caseStudies: string | null;
}

export interface ProfileCtx { displayName: string; companyName: string; signature: string; meetingLink: string; phone: string }

function ev(ctx: LeadCtx, prefix: string) {
  return ctx.evidence.filter((e) => e.id.startsWith(prefix)).map((e) => e.id);
}

export function ruleAnalysis(ctx: LeadCtx, products: ProductCtx[]): Analysis {
  const { lead, tech } = ctx;
  const a = (ctx.audit ?? {}) as Record<string, unknown>;
  const hasSite = Boolean(lead.website);
  const pains: Analysis["pains"] = [];
  const add = (key: string, detail: string, confidence: number, evidenceIds: string[]) => {
    if (!evidenceIds.length) return;
    pains.push({ key, title: PAIN_LIBRARY.find((p) => p.key === key)!.title, detail, confidence, evidenceIds });
  };
  const siteEv = ev(ctx, "site");
  const listEv = ev(ctx, "listing");
  if (!hasSite) add("no_website", "No website was found in any source checked.", 70, listEv);
  if (hasSite && a.ssl === false) add("no_ssl", "Site loads over plain HTTP; browsers show 'Not secure'.", 90, siteEv);
  if (hasSite && a.mobileViewport === false) add("not_mobile", "No mobile viewport meta tag; likely poor on phones.", 80, siteEv);
  if (hasSite && typeof a.responseMs === "number" && a.responseMs > 3000) add("slow_site", `Home page took ${(a.responseMs / 1000).toFixed(1)}s to respond.`, 70, siteEv);
  if (hasSite && typeof a.copyrightYear === "number" && a.copyrightYear < new Date().getFullYear() - 2) add("outdated_site", `Footer copyright year is ${a.copyrightYear}.`, 65, siteEv);
  if (hasSite && a.hasBookingOrForm === false && BOOKING_CATEGORIES.test(lead.category ?? "")) add("no_booking", "No booking/enquiry form found on the pages crawled.", 70, siteEv);
  if (hasSite && !a.hasChat && !a.hasWhatsappWidget && !lead.whatsapp) add("no_chat", "No live chat or WhatsApp click-to-chat detected.", 65, siteEv);
  if (hasSite && !tech.some((t) => /HubSpot|Zoho|Freshworks|Intercom|Zendesk/.test(t))) add("no_crm", "No CRM or marketing-automation scripts detected on the website.", 55, ev(ctx, "tech").length ? ev(ctx, "tech") : siteEv);
  if (hasSite && !tech.some((t) => /Analytics|Tag Manager|Pixel/.test(t))) add("no_analytics", "No Google Analytics / Tag Manager / Pixel detected.", 70, siteEv);
  if (hasSite && (a.metaDescription === false || a.h1 === false)) add("weak_seo", `Missing ${[a.metaDescription === false && "meta description", a.h1 === false && "H1 heading"].filter(Boolean).join(" and ")}.`, 60, siteEv);
  if ((lead.rating ?? 5) < 3.8 && (lead.reviewsCount ?? 0) >= 10) add("low_rating", `Rated ${lead.rating} from ${lead.reviewsCount} reviews.`, 75, ev(ctx, "rating"));
  if (lead.reviewsCount !== null && lead.reviewsCount < 20) add("few_reviews", `Only ${lead.reviewsCount} public reviews.`, 60, ev(ctx, "rating"));
  const hiring = (a.hiringSignals as string[] | undefined) ?? [];
  if (hiring.some((h) => /sales|telecaller|business development/i.test(h))) add("hiring_sales", hiring.join("; "), 70, ev(ctx, "hiring"));
  if (hasSite && a.hasEcommerce === false && /retail|shop|store|jewel|garment/i.test(lead.category ?? "") && !tech.some((t) => /Razorpay|PayU|Paytm|Stripe/.test(t))) add("no_online_payment", "No payment gateway detected.", 55, siteEv);
  if (hasSite && Object.keys(lead.socials ?? {}).length === 0) add("no_social", "No social media links found on the website.", 50, siteEv);

  const signals: Analysis["signals"] = [];
  for (const h of hiring) signals.push({ title: h, confidence: 70, evidenceIds: ev(ctx, "hiring") });
  if (lead.yearEst && lead.yearEst >= new Date().getFullYear() - 2) signals.push({ title: `New business (est. ${lead.yearEst})`, confidence: 60, evidenceIds: ev(ctx, "listing") });
  if ((lead.reviewsCount ?? 0) > 150) signals.push({ title: `Busy business (${lead.reviewsCount} reviews)`, confidence: 55, evidenceIds: ev(ctx, "rating") });

  const dm = digitalMaturity(tech, a, hasSite);
  const matches = products
    .map((p) => {
      const covered = pains.filter((x) => productCoversPain(p.problemsSolved, x.key ?? ""));
      const ind = industryMatch(p.targetIndustries, lead.category);
      const fitPct = Math.min(100, covered.reduce((s, x) => s + x.confidence * 0.35, 0) + (ind ? 35 : 0) + (dm < 50 ? 5 : 0));
      const person = pickPerson(ctx.people, p);
      return {
        productId: p.id, productName: p.name, fitPct: Math.round(fitPct),
        reasoning: covered.length
          ? `Solves ${covered.map((c) => c.title.toLowerCase()).join(", ")}${ind ? `; ${lead.category} is a target industry` : ""}.`
          : ind ? `${lead.category} is a target industry, but no specific pain was evidenced yet.` : "Weak fit: no evidenced pain this product solves.",
        targetRole: person ? `${person.fullName} (${person.title ?? person.roleGroup})` : roleFor(p),
        targetPersonId: person?.id ?? null,
        objections: p.objections.length ? p.objections.slice(0, 3) : genericObjections(p),
        openingLine: covered[0]
          ? `I noticed ${covered[0].detail.charAt(0).toLowerCase() + covered[0].detail.slice(1)} — we help ${lead.category ?? "businesses"} in ${lead.city ?? "Chennai"} fix exactly that with ${p.name}.`
          : `We help ${lead.category ?? "businesses"} in ${lead.city ?? "Chennai"} with ${p.shortDesc ?? p.name}.`,
      };
    })
    .sort((x, y) => y.fitPct - x.fitPct)
    .slice(0, 3);

  const facts = ctx.evidence.length;
  const dataQuality = facts >= 6 ? "good" : facts >= 3 ? "thin" : "insufficient";
  return {
    summary: `${lead.name} is a ${lead.category ?? "business"} in ${[lead.area, lead.city].filter(Boolean).join(", ") || "an unknown location"}${lead.yearEst ? `, established ${lead.yearEst}` : ""}.${hasSite ? "" : " No website found."}${dataQuality !== "good" ? " Limited public data — verify on the call." : ""}`,
    industry: lead.category ?? "insufficient data",
    sizeEstimate: lead.sizeEstimate ? `${lead.sizeEstimate} employees (estimate)` : "insufficient data",
    digitalMaturity: dm,
    dataQuality,
    pains: pains.sort((x, y) => y.confidence - x.confidence),
    signals,
    matches,
    whyNow: signals[0] ? `${signals[0].title} — act while they are changing things.` : pains[0] ? `Visible, fixable issue today: ${pains[0].title.toLowerCase()}.` : "No timing signal found — low priority / nurture.",
  };
}

function roleFor(p: ProductCtx) {
  const c = `${p.category ?? ""} ${p.name}`.toLowerCase();
  if (/crm|software|erp|it|cloud|security/.test(c)) return "Owner / IT head";
  if (/marketing|seo|website|social/.test(c)) return "Owner / Marketing head";
  if (/hr|payroll|recruit/.test(c)) return "HR manager";
  return "Owner / Managing Director";
}

function pickPerson(people: LeadCtx["people"], p: ProductCtx) {
  const want = /crm|software|erp|it|cloud/i.test(`${p.category} ${p.name}`) ? ["founder", "director", "it"] : /hr|payroll/i.test(`${p.category}`) ? ["hr", "founder", "director"] : ["founder", "director", "marketing", "operations"];
  return [...people].sort((a, b) => (want.indexOf(a.roleGroup ?? "") === -1 ? 9 : want.indexOf(a.roleGroup ?? "")) - (want.indexOf(b.roleGroup ?? "") === -1 ? 9 : want.indexOf(b.roleGroup ?? "")) || b.dmScore - a.dmScore)[0] ?? null;
}

function genericObjections(p: ProductCtx) {
  return [
    { objection: "We already have something for this.", rebuttal: `Totally fair — many of our clients did too. Could I show you in 10 minutes where ${p.name} is different, so you can compare?` },
    { objection: "Too expensive / no budget now.", rebuttal: `Understood. ${p.pricing ? `Plans start at ${p.pricing}. ` : ""}Most clients recover the cost within a few months — shall I share a quick ROI example?` },
    { objection: "Send me details on WhatsApp/email.", rebuttal: "Sure, I'll send a one-page summary now. What's the one thing you'd want it to answer?" },
  ];
}

export function ruleAssets(ctx: LeadCtx, analysis: Analysis, product: ProductCtx | null, personId: string | null, me: ProfileCtx): Assets {
  const person = ctx.people.find((p) => p.id === personId) ?? null;
  const fn = person ? firstName(person.fullName) : "";
  const hi = fn ? `Hi ${fn}` : "Hi";
  const vanakkam = fn ? `வணக்கம் ${fn} சார்/மேடம்` : "வணக்கம் சார்/மேடம்";
  const co = ctx.lead.name;
  const covered = product ? analysis.pains.filter((x) => productCoversPain(product.problemsSolved, x.key ?? "")) : [];
  const ordered = [...covered, ...analysis.pains.filter((x) => !covered.includes(x))];
  const pain = ordered[0];
  const pain2 = ordered[1];
  const pname = product?.name ?? "our solution";
  const benefit = product?.benefits[0] ?? "save time and win more customers";
  const me1 = me.displayName || "I";
  const myCo = me.companyName || "our company";
  const painLine = pain ? pain.detail.replace(/\.$/, "") : "";
  const hook = pain ? `I was looking at ${co} and noticed: ${pain.title.toLowerCase()} (${painLine.charAt(0).toLowerCase() + painLine.slice(1)}).` : `I work with ${ctx.lead.category ?? "businesses"} around ${ctx.lead.city ?? "Chennai"}.`;
  const cs = product?.caseStudies ? ` For example: ${product.caseStudies.split(/\n/)[0].slice(0, 160)}` : "";
  const meeting = me.meetingLink ? ` You can pick a slot here: ${me.meetingLink}` : "";
  const sig = me.signature || `${me1}\n${myCo}${me.phone ? `\n${me.phone}` : ""}`;

  const en = {
    short: `${hi}, this is ${me1} from ${myCo}. ${hook} We help businesses like yours with ${pname} — ${benefit}. Would a quick 10-minute call this week make sense?`,
    long: `${hi}, this is ${me1} from ${myCo} — do you have two minutes?\n\n[Reason] ${hook}${pain2 ? ` Also, ${pain2.detail.charAt(0).toLowerCase() + pain2.detail.slice(1)}` : ""}\n\n[Question] How are you handling this today?\n\n[Pitch] ${pname}${product?.shortDesc ? ` — ${product.shortDesc}` : ""}. Result: ${benefit}.${cs}\n\n[Qualify] Who else is involved in decisions like this? Roughly what volume are you handling each month?\n\n[Close] Can I show you a 15-minute demo — is Thursday or Friday better?`,
  };
  const ta = {
    short: `${vanakkam}, நான் ${myCo}-லிருந்து ${me1} பேசுகிறேன். ${pain ? `${co} பற்றி பார்த்தேன் — ${pain.title} என்று கவனித்தேன்.` : ""} ${pname} மூலம் உங்களுக்கு நேரமும் செலவும் மிச்சமாகும். இந்த வாரம் 10 நிமிடம் பேசலாமா?`,
    long: `${vanakkam}, நான் ${myCo}-லிருந்து ${me1}. இரண்டு நிமிடம் பேசலாமா?\n\n[காரணம்] ${pain ? `${co} பற்றி பார்த்தேன் — ${pain.title}.` : `${ctx.lead.city ?? "சென்னை"}-யில் பல ${ctx.lead.category ?? "நிறுவனங்களுடன்"} வேலை செய்கிறோம்.`}\n\n[கேள்வி] இதை இப்போது எப்படி சமாளிக்கிறீர்கள்?\n\n[தீர்வு] ${pname} — ${benefit}.\n\n[முடிவு] 15 நிமிட டெமோ காட்டலாமா? வியாழன் அல்லது வெள்ளி எது வசதி?`,
  };
  const tanglish = {
    short: `${fn ? `Vanakkam ${fn} sir/madam` : "Vanakkam sir/madam"}, naan ${me1}, ${myCo}-la irundhu pesuren. ${pain ? `${co} pathi paathen — ${pain.title.toLowerCase()} nu notice panninen.` : ""} ${pname} use panna ${benefit}. Indha week oru 10 minutes pesalama?`,
    long: `${fn ? `Vanakkam ${fn}` : "Vanakkam"}, naan ${me1} from ${myCo}. Rendu nimisham pesalama?\n\n[Reason] ${pain ? `${co} website/listing paathen — ${pain.detail}` : `${ctx.lead.city ?? "Chennai"}-la neraya ${ctx.lead.category ?? "businesses"} kooda work panrom.`}\n\n[Question] Ippo idha eppadi handle panreenga?\n\n[Pitch] ${pname} — ${benefit}.\n\n[Close] Oru 15-minute demo kaatalama? Thursday-aa Friday-aa convenient?`,
  };
  const subjects = [
    pain ? `Quick idea for ${co}` : `${co} + ${myCo}`,
    pain ? `${pain.title} at ${co}?` : `Question about ${co}`,
    `${fn || co}, 10 minutes this week?`,
  ];
  const emails = [
    { variant: "A — problem-first", subject: subjects[0], altSubjects: [subjects[1], subjects[2]], body: `${hi},\n\n${hook} It usually means ${ctx.lead.category?.toLowerCase().includes("clinic") || ctx.lead.category?.toLowerCase().includes("dental") ? "patients" : "customers"} go elsewhere without you knowing.\n\nWe built ${pname} for exactly this — ${benefit}.${cs}\n\nWorth a 10-minute call this week?${meeting}\n\nThanks,\n${sig}\n\n${OPT_OUT_LINE}` },
    { variant: "B — question-first", subject: subjects[1], altSubjects: [subjects[0], subjects[2]], body: `${hi},\n\nQuick question: how does ${co} handle ${pain ? pain.title.toLowerCase() : "new enquiries and follow-ups"} today?\n\nI ask because we help ${ctx.lead.category ?? "businesses"} in ${ctx.lead.city ?? "Chennai"} with ${pname}${product?.usps[0] ? ` (${product.usps[0]})` : ""}.\n\nIf it's useful, I can share a 2-minute walkthrough.\n\nRegards,\n${sig}\n\n${OPT_OUT_LINE}` },
    { variant: "C — short & local", subject: subjects[2], altSubjects: [subjects[0], subjects[1]], body: `${hi},\n\nI'm ${me1} from ${myCo}, here in Chennai. ${pain ? `Noticed ${pain.title.toLowerCase()} on ${co}'s side — ` : ""}we fix this for local ${ctx.lead.category ?? "businesses"} with ${pname}.\n\nOpen to a quick chat?\n\n${sig}\n\n${OPT_OUT_LINE}` },
  ];
  const followUps = [
    { day: 3, subject: `Re: ${subjects[0]}`, body: `${hi},\n\nJust bringing this to the top of your inbox. Would a short call on ${pname} be useful for ${co}?\n\n${sig}\n\n${OPT_OUT_LINE}` },
    { day: 7, subject: `Re: ${subjects[0]}`, body: `${hi},\n\nOne more thought: ${product?.benefits[1] ?? benefit}.${cs}\n\nHappy to send a one-page summary if easier.\n\n${sig}\n\n${OPT_OUT_LINE}` },
    { day: 14, subject: `${co} — should I close your file?`, body: `${hi},\n\nI haven't heard back, so I'll assume the timing isn't right. If ${pain ? pain.title.toLowerCase() : "this"} becomes a priority, I'm a reply away.\n\n${sig}\n\n${OPT_OUT_LINE}` },
  ];
  const objections = [
    ...(product?.objections ?? []),
    ...(analysis.matches[0]?.objections ?? []),
  ].filter((o, i, arr) => arr.findIndex((x) => x.objection === o.objection) === i).slice(0, 6);
  return {
    productId: product?.id ?? null,
    personId,
    callScripts: { en, ta, tanglish },
    voicemail: `${hi}, this is ${me1} from ${myCo}. ${pain ? `I noticed ${pain.title.toLowerCase()} at ${co} and have a quick idea to fix it.` : `I have a quick idea for ${co}.`} I'll also send a WhatsApp. My number is ${me.phone || "[your number]"}. Thanks!`,
    gatekeeper: [
      `Hi, this is ${me1} from ${myCo}. Could you connect me to ${person ? person.fullName : "the person who handles " + (product?.category ?? "this")}? It's regarding ${pain ? pain.title.toLowerCase() : "your website/enquiries"}.`,
      "What's the best time to reach them directly?",
      "Could you share their email so I can send a short note first?",
      "Thank you, may I know your name so I can mention you helped?",
    ],
    emails,
    followUps,
    breakup: followUps[2],
    whatsapp: `${hi}, ${me1} here from ${myCo}. ${pain ? `Noticed ${pain.title.toLowerCase()} for ${co}.` : ""} We help ${ctx.lead.category ?? "businesses"} with ${pname} — ${benefit}. Can I share a 1-min video? (Reply STOP to not receive messages)`,
    linkedinNote: `${hi}, I work with ${ctx.lead.category ?? "businesses"} in ${ctx.lead.city ?? "Chennai"} on ${product?.category ?? "growth"}. Enjoyed learning about ${co} — would love to connect.`.slice(0, 295),
    linkedinFollowUp: `Thanks for connecting${fn ? `, ${fn}` : ""}! ${hook} We help with exactly this via ${pname}. Open to a quick chat sometime this week?`,
    objections,
  };
}
