import type {
  AIBlock,
  EmailMessage,
  TriageCategory,
  TriageIntent,
} from "@/types/protocol";

/**
 * Triage Agent.
 *
 * Inputs:  an EmailMessage
 * Outputs: an AIBlock {saliency, category, intents, summary?, triagedAt}
 *
 * Algorithm is deterministic + heuristic so it never depends on an LLM key.
 * The Scribe Agent can later layer an LLM-written `summary` on top.
 *
 * Saliency rubric (specs/protocol.md):
 *   sender relationship    : -2 .. +3
 *   urgency markers        :  0 .. +3
 *   action required        :  0 .. +2
 *   promo / noise penalty  : -5 .. 0
 *   thread continuity      :  0 .. +1   (replies to threads the user is in)
 * Clamped to 0..10.
 */

const PROMO_PHRASES = [
  "% off",
  "promo code",
  "limited time",
  "today only",
  "free shipping",
  "unsubscribe",
  "claim your",
  "exclusive offer",
];

const URGENT_PHRASES = [
  "urgent",
  "asap",
  "today",
  "eod",
  "end of day",
  "by tomorrow",
  "before friday",
  "deadline",
  "immediately",
  "right away",
];

const ACTION_PHRASES = [
  "can you",
  "could you",
  "please review",
  "please confirm",
  "need your",
  "sign off",
  "sign-off",
  "rsvp",
  "approve",
  "reply with",
  "let me know",
];

const NEWSLETTER_SENDERS = [
  "morningbrew",
  "substack",
  "medium.com",
  "linkedin.com",
  "noreply@",
  "no-reply@",
  "newsletter",
  "digest",
];

const NOTIFICATION_SENDERS = [
  "github.com",
  "atlassian.net",
  "jira",
  "linear.app",
  "notion.so",
  "slack.com",
  "calendar",
];

const PROMO_SENDERS = ["uber.com", "doordash", "groupon", "marketing@", "promo@", "deals@"];

const INVOICE_PHRASES = ["invoice", "statement", "receipt", "payment due", "amount due"];
const FLIGHT_PHRASES = ["flight", "boarding", "gate", "departs", "itinerary"];
const MEETING_PHRASES = ["meeting", "calendar", "invite", "agenda", "reschedule"];

export function triageMessage(msg: EmailMessage): AIBlock {
  const lcSubject = msg.subject.toLowerCase();
  const lcBody = msg.body.text.toLowerCase();
  const lcFrom = (msg.from.email + " " + (msg.from.name ?? "")).toLowerCase();
  const text = `${lcSubject} ${lcBody}`;

  // Category
  let category: TriageCategory = "other";
  if (PROMO_SENDERS.some((s) => lcFrom.includes(s)) || PROMO_PHRASES.some((p) => text.includes(p))) {
    category = "promo";
  } else if (NEWSLETTER_SENDERS.some((s) => lcFrom.includes(s))) {
    category = "newsletter";
  } else if (NOTIFICATION_SENDERS.some((s) => lcFrom.includes(s))) {
    category = "notification";
  } else if (isLikelyWorkDomain(msg.from.email)) {
    category = "work";
  } else if (isLikelyPersonal(msg.from.email)) {
    category = "personal";
  }

  // Sender relationship: very rough — bumps for known peers, hits for noreply
  let salience = 3; // start at 3/10
  if (lcFrom.includes("noreply") || lcFrom.includes("no-reply")) salience -= 2;
  if (category === "promo") salience -= 4;
  if (category === "newsletter") salience -= 3;
  if (category === "notification") salience -= 1;
  if (category === "work" || category === "personal") salience += 1;

  // Urgency markers
  const urgencyHits = URGENT_PHRASES.filter((p) => text.includes(p)).length;
  salience += Math.min(3, urgencyHits);
  if (/[A-Z]{3,}/.test(msg.subject)) salience += 1; // shouting subject (URGENT)
  if (/\?$/.test(msg.subject.trim())) salience += 1; // question in subject

  // Action required
  const actionHits = ACTION_PHRASES.filter((p) => text.includes(p)).length;
  salience += Math.min(2, actionHits);

  // Recency lift — anything < 60 min old gets +1 if not promo/newsletter
  // (At this point `category` cannot have been promoted to "urgent" yet —
  // that happens below — so we only check the meaningful cases here.)
  const ageMin = (Date.now() - new Date(msg.receivedAt).getTime()) / 60_000;
  if (ageMin < 60 && (category === "work" || category === "personal")) {
    salience += 1;
  }

  // Promote category to "urgent" when high salience + urgency hits
  if (urgencyHits >= 1 && salience >= 7 && category !== "promo" && category !== "newsletter") {
    category = "urgent";
  }

  salience = Math.max(0, Math.min(10, salience));

  // Intents
  const intents: TriageIntent[] = [];
  if (ACTION_PHRASES.some((p) => text.includes(p)) || /\?\s*$/.test(msg.subject)) {
    intents.push("reply_needed");
  }
  if (FLIGHT_PHRASES.some((p) => text.includes(p))) intents.push("flight");
  if (MEETING_PHRASES.some((p) => text.includes(p))) intents.push("meeting");
  if (INVOICE_PHRASES.some((p) => text.includes(p))) intents.push("invoice");
  if (category === "newsletter" || category === "promo") intents.push("fyi");

  return {
    saliency: salience,
    category,
    intents: intents.length ? intents : undefined,
    summary: heuristicSummary(msg),
    triagedAt: new Date().toISOString(),
  };
}

/** Bulk-triage helper used by the Sync Agent. */
export function triageBatch(msgs: EmailMessage[]): EmailMessage[] {
  return msgs.map((m) => ({ ...m, ai: triageMessage(m) }));
}

function isLikelyWorkDomain(email: string): boolean {
  const dom = email.split("@")[1]?.toLowerCase() ?? "";
  if (!dom) return false;
  if (PERSONAL_DOMAINS.has(dom)) return false;
  if (NOTIFICATION_SENDERS.some((s) => dom.includes(s))) return false;
  if (PROMO_SENDERS.some((s) => dom.includes(s))) return false;
  return true;
}

function isLikelyPersonal(email: string): boolean {
  const dom = email.split("@")[1]?.toLowerCase() ?? "";
  return PERSONAL_DOMAINS.has(dom);
}

const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "fastmail.com",
]);

/** A one-line summary that doesn't need an LLM. The Scribe Agent may overwrite. */
function heuristicSummary(msg: EmailMessage): string {
  const sender = msg.from.name?.split(/\s+/)[0] ?? msg.from.email.split("@")[0];
  const subj = msg.subject.replace(/^(?:re|fwd|fw):\s*/i, "").trim();
  const cleaned = subj.length > 80 ? subj.slice(0, 77) + "…" : subj;
  return `${sender}: ${cleaned}`;
}
