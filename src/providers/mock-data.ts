import type { Account, EmailMessage } from "@/types/protocol";

/**
 * Fixed reference point so mock timestamps are stable inside snapshots / SSR.
 * Real providers use the system clock; the mock uses an anchor + offsets so
 * "now" looks plausible regardless of when the app is opened.
 */
function isoMinutesAgo(min: number, anchor = Date.now()): string {
  return new Date(anchor - min * 60_000).toISOString();
}

export const mockAccounts: Account[] = [
  {
    id: "acct_personal",
    provider: "mock",
    email: "samar.k@gmail.com",
    displayName: "Samar K",
    color: "#ea4335",
    signature: "— Samar",
    voiceProfile: "casual",
  },
  {
    id: "acct_work",
    provider: "mock",
    email: "samar@acme.co",
    displayName: "Samar @ Acme",
    color: "#0078d4",
    signature: "Samar Khare\nProduct, Acme",
    voiceProfile: "professional",
  },
  {
    id: "acct_aol",
    provider: "mock",
    email: "samar.legacy@aol.com",
    displayName: "Legacy AOL",
    color: "#7c3aed",
    voiceProfile: "short",
  },
];

/**
 * Bake the dataset lazily so timestamps are relative to whenever the server starts.
 * (Mock data only — providers backed by real APIs ignore this.)
 */
export function buildMockMessages(now = Date.now()): EmailMessage[] {
  const m = (min: number) => isoMinutesAgo(min, now);

  return [
    // ──────────────── Personal (gmail-style) ────────────────
    {
      uid: "mock:acct_personal:m1",
      accountId: "acct_personal",
      threadId: "t_flight_dl1273",
      from: { name: "Delta Air Lines", email: "noreply@delta.com" },
      to: [{ email: "samar.k@gmail.com" }],
      subject: "Your flight DL1273 to SFO departs in 24 hours",
      snippet:
        "Check in is now open. Seat 14C, Gate B22. Boarding begins at 6:35 PM.",
      body: {
        text: "Hi Samar,\n\nCheck-in is now open for your flight DL1273 from JFK to SFO tomorrow at 7:05 PM. Seat 14C, Gate B22. Boarding begins at 6:35 PM.\n\nManage your trip in the Fly Delta app.",
      },
      receivedAt: m(35),
      isRead: false,
      isStarred: false,
      folder: "inbox",
      labels: ["Travel"],
      attachments: [],
    },
    {
      uid: "mock:acct_personal:m2",
      accountId: "acct_personal",
      threadId: "t_mom",
      from: { name: "Mom", email: "asha.k@yahoo.com" },
      to: [{ email: "samar.k@gmail.com" }],
      subject: "Sunday dinner?",
      snippet:
        "Are you free this Sunday? I'm making the dal you liked. Bring laundry.",
      body: {
        text: "Hi beta,\n\nAre you free this Sunday at 7? I'm making the dal you liked last time. Bring your laundry — and ask Priya if she wants to come.\n\nLove,\nMom",
      },
      receivedAt: m(95),
      isRead: false,
      isStarred: true,
      folder: "inbox",
      labels: ["Family"],
      attachments: [],
    },
    {
      uid: "mock:acct_personal:m3",
      accountId: "acct_personal",
      threadId: "t_amazon_1",
      from: { name: "Amazon.com", email: "auto-confirm@amazon.com" },
      to: [{ email: "samar.k@gmail.com" }],
      subject: "Your order has shipped: Logitech MX Master 3S",
      snippet:
        "Arriving Tomorrow by 9 PM. Track your package or change delivery instructions.",
      body: {
        text: "Hi Samar,\n\nYour Logitech MX Master 3S has shipped and will arrive tomorrow by 9 PM. Track your package or change delivery instructions in the app.",
      },
      receivedAt: m(180),
      isRead: true,
      isStarred: false,
      folder: "inbox",
      labels: ["Shopping"],
      attachments: [],
    },
    {
      uid: "mock:acct_personal:m4",
      accountId: "acct_personal",
      threadId: "t_promo_uber",
      from: { name: "Uber Eats", email: "noreply@uber.com" },
      to: [{ email: "samar.k@gmail.com" }],
      subject: "🔥 50% off your next 3 orders — today only",
      snippet:
        "Tap to claim. Minimum order $15. Promo code AUTO_APPLIED at checkout.",
      body: {
        text: "Get 50% off your next 3 orders. Tap to claim — promo code is auto-applied. Minimum $15. Offer expires at midnight.",
      },
      receivedAt: m(220),
      isRead: false,
      isStarred: false,
      folder: "inbox",
      labels: ["Promotions"],
      attachments: [],
    },
    {
      uid: "mock:acct_personal:m5",
      accountId: "acct_personal",
      threadId: "t_chase",
      from: { name: "Chase", email: "alerts@chase.com" },
      to: [{ email: "samar.k@gmail.com" }],
      subject: "Statement available for card ending 4421",
      snippet:
        "Your December statement is ready. Minimum payment $35 due Jan 8.",
      body: {
        text: "Your December statement is now available. Minimum payment $35.00 is due January 8. View your statement in the Chase mobile app.",
      },
      receivedAt: m(420),
      isRead: false,
      isStarred: false,
      folder: "inbox",
      labels: ["Finance"],
      attachments: [],
    },

    // ──────────────── Work (outlook-style) ────────────────
    {
      uid: "mock:acct_work:m1",
      accountId: "acct_work",
      threadId: "t_okr_alex",
      from: { name: "Alex Chen", email: "alex@acme.co" },
      to: [{ email: "samar@acme.co" }],
      subject: "URGENT: Need your sign-off on Q3 OKRs before EOD",
      snippet:
        "Hey — Carter's pushing for the OKRs to be locked today. Can you review the doc and reply with a yes/no by 5pm?",
      body: {
        text: "Hey Samar,\n\nCarter's pushing for the Q3 OKRs to be locked today before the board prep meeting tomorrow morning. I've made my edits — can you review the doc (link in the calendar invite) and reply with a yes/no by 5pm?\n\nThe biggest open question is whether we keep the 'activation rate' target at 42% or push it to 45%. I lean 42% given Q2 actuals.\n\nThanks,\nAlex",
      },
      receivedAt: m(18),
      isRead: false,
      isStarred: false,
      folder: "inbox",
      labels: ["OKRs", "Q3"],
      attachments: [],
    },
    {
      uid: "mock:acct_work:m2",
      accountId: "acct_work",
      threadId: "t_design_review",
      from: { name: "Priya Raman", email: "priya@acme.co" },
      to: [{ email: "samar@acme.co" }, { email: "design@acme.co" }],
      subject: "Design review Thursday — agenda + Figma",
      snippet:
        "Sending the agenda for Thursday's design review. Three flows to walk through. Figma linked.",
      body: {
        text: "Hi team,\n\nAgenda for Thursday's design review:\n\n1. Onboarding v3 (15m)\n2. Billing redesign (20m)\n3. Empty-state audit (10m)\n\nFigma: figma.com/file/acme-design-2026-01\n\nLet me know if anything is missing.\n\nPriya",
      },
      receivedAt: m(70),
      isRead: false,
      isStarred: false,
      folder: "inbox",
      labels: ["Design"],
      attachments: [
        { id: "a1", filename: "agenda.pdf", mimeType: "application/pdf", size: 84_213 },
      ],
    },
    {
      uid: "mock:acct_work:m3",
      accountId: "acct_work",
      threadId: "t_stripe_invoice",
      from: { name: "Stripe", email: "invoice+statements@stripe.com" },
      to: [{ email: "samar@acme.co" }],
      subject: "Invoice 2026-0014 — $1,240.00",
      snippet:
        "Your invoice for December is ready. Payment will be drafted on Jan 5.",
      body: {
        text: "Hi,\n\nInvoice 2026-0014 for $1,240.00 is ready. Payment will be drafted from the account ending 8821 on January 5.",
      },
      receivedAt: m(240),
      isRead: false,
      isStarred: false,
      folder: "inbox",
      labels: ["Finance", "Invoice"],
      attachments: [
        { id: "a2", filename: "invoice-2026-0014.pdf", mimeType: "application/pdf", size: 23_104 },
      ],
    },
    {
      uid: "mock:acct_work:m4",
      accountId: "acct_work",
      threadId: "t_jira",
      from: { name: "Jira", email: "jira@acme.atlassian.net" },
      to: [{ email: "samar@acme.co" }],
      subject: "[ACME-1421] assigned to you: Activation funnel instrumentation",
      snippet:
        "Carter assigned ACME-1421 to you. Priority: High. Due: Jan 10.",
      body: {
        text: "Carter assigned ACME-1421 'Activation funnel instrumentation' to you. Priority: High. Due: Jan 10. View ticket.",
      },
      receivedAt: m(340),
      isRead: true,
      isStarred: false,
      folder: "inbox",
      labels: ["Jira"],
      attachments: [],
    },
    {
      uid: "mock:acct_work:m5",
      accountId: "acct_work",
      threadId: "t_okr_alex",
      from: { name: "Alex Chen", email: "alex@acme.co" },
      to: [{ email: "samar@acme.co" }],
      subject: "Re: URGENT: Need your sign-off on Q3 OKRs before EOD",
      snippet:
        "Also — Carter asked specifically about retention. Worth a line in your reply.",
      body: {
        text: "One more thing — Carter asked specifically about retention numbers. Worth a quick line in your reply confirming we're holding at 88%.\n\nA.",
      },
      receivedAt: m(12),
      isRead: false,
      isStarred: false,
      folder: "inbox",
      labels: ["OKRs", "Q3"],
      attachments: [],
    },
    {
      uid: "mock:acct_work:m6",
      accountId: "acct_work",
      threadId: "t_recruiter",
      from: { name: "Jordan Pierce", email: "jordan@northstack.io" },
      to: [{ email: "samar@acme.co" }],
      subject: "Quick chat about a Staff PM role?",
      snippet:
        "Hi Samar — saw your work on activation. Have a Staff PM role at a Series B that might interest you.",
      body: {
        text: "Hi Samar,\n\nMy name is Jordan, I'm a recruiter at Northstack. Saw your work on activation funnels and wanted to flag a Staff PM role at a Series B fintech that I think would be a fit. Open to a quick 15-min chat next week?\n\nJordan",
      },
      receivedAt: m(560),
      isRead: false,
      isStarred: false,
      folder: "inbox",
      labels: [],
      attachments: [],
    },

    // ──────────────── AOL (IMAP-style) — mostly noise ────────────────
    {
      uid: "mock:acct_aol:m1",
      accountId: "acct_aol",
      threadId: "t_aol_newsletter",
      from: { name: "Morning Brew", email: "crew@morningbrew.com" },
      to: [{ email: "samar.legacy@aol.com" }],
      subject: "☕ Tuesday: The chip war just got messier",
      snippet:
        "Plus: a $19B IPO, Buffett's latest move, and why coffee is up 38%.",
      body: { text: "Today's Brew — the chip war just got messier..." },
      receivedAt: m(150),
      isRead: false,
      isStarred: false,
      folder: "inbox",
      labels: ["Newsletter"],
      attachments: [],
    },
    {
      uid: "mock:acct_aol:m2",
      accountId: "acct_aol",
      threadId: "t_aol_linkedin",
      from: { name: "LinkedIn", email: "noreply@linkedin.com" },
      to: [{ email: "samar.legacy@aol.com" }],
      subject: "You appeared in 14 searches this week",
      snippet:
        "Recruiters at Stripe, Linear, and Figma viewed your profile.",
      body: {
        text: "You appeared in 14 searches this week. Recruiters at Stripe, Linear, and Figma viewed your profile.",
      },
      receivedAt: m(720),
      isRead: false,
      isStarred: false,
      folder: "inbox",
      labels: ["Notifications"],
      attachments: [],
    },
    {
      uid: "mock:acct_aol:m3",
      accountId: "acct_aol",
      threadId: "t_aol_dentist",
      from: { name: "Dr. Patel's Office", email: "appointments@patelddss.com" },
      to: [{ email: "samar.legacy@aol.com" }],
      subject: "Appointment reminder: cleaning, Friday 10am",
      snippet:
        "Reminder: you have a cleaning appointment Friday at 10am. Reply C to confirm or R to reschedule.",
      body: {
        text: "Reminder: you have a cleaning appointment with Dr. Patel on Friday at 10am. Reply C to confirm or R to reschedule.",
      },
      receivedAt: m(800),
      isRead: false,
      isStarred: false,
      folder: "inbox",
      labels: [],
      attachments: [],
    },
  ];
}
