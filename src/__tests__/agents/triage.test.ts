import { describe, it, expect } from "vitest";
import { triageMessage } from "@/agents/triage";
import type { EmailMessage } from "@/types/protocol";

function buildMsg(overrides: Partial<EmailMessage>): EmailMessage {
  return {
    uid: "mock:a:1",
    accountId: "a",
    threadId: "t",
    from: { email: "person@example.com", name: "A Person" },
    to: [{ email: "me@example.com" }],
    subject: "Hello",
    snippet: "hi there",
    body: { text: "hi there" },
    receivedAt: new Date().toISOString(),
    isRead: false,
    isStarred: false,
    folder: "inbox",
    labels: [],
    attachments: [],
    ...overrides,
  };
}

describe("Triage Agent", () => {
  it("scores explicit 'URGENT … by EOD' from a peer as ≥ 7", () => {
    const m = buildMsg({
      subject: "URGENT: Need your sign-off by EOD",
      body: { text: "Hey — can you please review the doc and confirm by 5pm today?" },
      from: { email: "alex@acme.co", name: "Alex Chen" },
    });
    const ai = triageMessage(m);
    expect(ai.saliency).toBeGreaterThanOrEqual(7);
    expect(["urgent", "work"]).toContain(ai.category);
    expect(ai.intents).toContain("reply_needed");
  });

  it("scores Uber Eats promo as low saliency + promo category", () => {
    const m = buildMsg({
      subject: "🔥 50% off your next 3 orders",
      body: { text: "Tap to claim. Promo code AUTO_APPLIED. Unsubscribe anytime." },
      from: { email: "noreply@uber.com", name: "Uber Eats" },
    });
    const ai = triageMessage(m);
    expect(ai.saliency).toBeLessThanOrEqual(2);
    expect(ai.category).toBe("promo");
  });

  it("detects flight intent", () => {
    const m = buildMsg({
      subject: "Your flight DL1273 departs tomorrow",
      body: { text: "Boarding at gate B22 at 6:35 PM." },
      from: { email: "noreply@delta.com", name: "Delta" },
    });
    const ai = triageMessage(m);
    expect(ai.intents).toContain("flight");
  });

  it("detects invoice intent + assigns lower saliency than urgent peer mail", () => {
    const m = buildMsg({
      subject: "Invoice 2026-0014 — $1,240.00",
      body: { text: "Payment will be drafted on Jan 5." },
      from: { email: "invoice+statements@stripe.com", name: "Stripe" },
    });
    const ai = triageMessage(m);
    expect(ai.intents).toContain("invoice");
    expect(ai.saliency).toBeLessThan(7);
  });

  it("newsletter sender is categorized as newsletter and gets fyi intent", () => {
    const m = buildMsg({
      subject: "Today's Brew ☕",
      body: { text: "Lots of news." },
      from: { email: "crew@morningbrew.com", name: "Morning Brew" },
    });
    const ai = triageMessage(m);
    expect(ai.category).toBe("newsletter");
    expect(ai.intents).toContain("fyi");
  });

  it("clamps saliency to [0, 10]", () => {
    const m = buildMsg({
      subject: "URGENT URGENT URGENT URGENT — please please please ASAP",
      body: { text: "Can you, could you, please review, please confirm, sign off, RSVP today?" },
      from: { email: "ceo@acme.co", name: "CEO" },
    });
    const ai = triageMessage(m);
    expect(ai.saliency).toBeLessThanOrEqual(10);
    expect(ai.saliency).toBeGreaterThanOrEqual(0);
  });
});
