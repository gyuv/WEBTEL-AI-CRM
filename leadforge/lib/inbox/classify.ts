export const REPLY_CLASSES = [
  "interested", "meeting_request", "question", "objection_price", "objection_timing", "objection_competitor", "objection_need",
  "not_interested", "out_of_office", "unsubscribe", "bounce", "auto_responder",
] as const;
export type ReplyClass = (typeof REPLY_CLASSES)[number];

const RULES: [ReplyClass, RegExp, number][] = [
  ["bounce", /delivery status notification|undeliverable|mail delivery (failed|subsystem)|address not found|mailer-daemon|recipient address rejected/i, 95],
  ["unsubscribe", /\bunsubscribe\b|\bstop\b(?! by)|remove me|don'?t (email|contact) me|do not (email|contact)|take me off/i, 92],
  ["out_of_office", /out of (the )?office|on leave|on vacation|away until|limited access to (my )?email|will be back on/i, 90],
  ["auto_responder", /auto(matic)?[- ]?reply|this is an automated|thank you for (your email|contacting us).*(we will|shortly)|ticket (number|#)/i, 80],
  ["meeting_request", /(let'?s|can we|shall we|happy to) (meet|talk|connect|schedule|speak|hop on)|book a (call|slot|meeting)|what time works|available (on|tomorrow|next)|call me (on|at|tomorrow)|send (me )?(a )?(calendar|invite)/i, 85],
  ["objection_price", /too (expensive|costly)|budget|price is high|cost is|cheaper|discount|pricing is/i, 78],
  ["objection_competitor", /already (use|using|have|working with)|existing (vendor|provider|partner)|we use \w+/i, 75],
  ["objection_timing", /not (right )?now|next (quarter|month|year)|later|busy (right now|season)|after (diwali|pongal|march)|reach out in/i, 72],
  ["not_interested", /not interested|no thanks|no, thank|not (a )?(fit|priority)|we'?re good|not looking/i, 88],
  ["objection_need", /don'?t need|no need|not required|we manage (fine|ourselves)|not necessary/i, 74],
  ["interested", /interested|sounds good|tell me more|send (me )?(the )?(details|brochure|proposal|quote|pricing)|please share|keen to|would like to know/i, 80],
  ["question", /\?/, 55],
];

export function classifyReplyRules(subject: string, body: string): { label: ReplyClass; confidence: number; summary: string } {
  const text = `${subject}\n${body}`.slice(0, 4000);
  for (const [label, re, conf] of RULES) {
    if (re.test(text)) return { label, confidence: conf, summary: summarize(body) };
  }
  return { label: "question", confidence: 35, summary: summarize(body) };
}

function summarize(body: string) {
  const firstReal = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^(hi|hello|dear|>)/i.test(l))[0] ?? body.trim();
  return firstReal.slice(0, 140);
}

export const STATUS_FROM_REPLY: Record<ReplyClass, string | null> = {
  interested: "interested",
  meeting_request: "meeting_booked",
  question: "replied",
  objection_price: "replied",
  objection_timing: "replied",
  objection_competitor: "replied",
  objection_need: "replied",
  not_interested: "lost",
  out_of_office: null,
  unsubscribe: "unsubscribed",
  bounce: null,
  auto_responder: null,
};

export const NO_REPLY_CLASSES: ReplyClass[] = ["unsubscribe", "bounce", "auto_responder"];
