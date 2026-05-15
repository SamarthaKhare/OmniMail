import { describe, it, expect, beforeEach } from "vitest";
import { mockProvider, __resetMockStore } from "@/providers/mock-provider";
import { makeUid, parseUid } from "@/types/protocol";

/**
 * Protocol Mock — the "Zero-Config Start" smoke test. A fresh clone must pass
 * this without any external services, credentials, or env vars.
 *
 * Per the assignment success metrics:
 *   "Claude Code can run npm test and see a passing 'Protocol Mock' test
 *    immediately."
 */
describe("Protocol Mock", () => {
  beforeEach(() => __resetMockStore());

  it("UIDs round-trip through make/parse", () => {
    const uid = makeUid("mock", "acct_personal", "m1");
    expect(uid).toBe("mock:acct_personal:m1");
    const parsed = parseUid(uid);
    expect(parsed.provider).toBe("mock");
    expect(parsed.accountId).toBe("acct_personal");
    expect(parsed.remoteId).toBe("m1");
  });

  it("lists at least two accounts from different domains", async () => {
    const accounts = await mockProvider.listAccounts();
    expect(accounts.length).toBeGreaterThanOrEqual(2);
    const domains = new Set(accounts.map((a) => a.email.split("@")[1]));
    expect(domains.size).toBeGreaterThanOrEqual(2);
  });

  it("Unified View can fetch ≥ 10 emails from two different sources", async () => {
    const accounts = await mockProvider.listAccounts();
    const lists = await Promise.all(
      accounts.map((a) => mockProvider.listMessages(a.id, { folder: "inbox" })),
    );
    const flat = lists.flat();
    // From the assignment: "Ensure a 'Unified View' can fetch 10 emails from
    // two different sources." Mock provider seeds with > 10 across 3 accounts.
    expect(flat.length).toBeGreaterThanOrEqual(10);
    const accountIds = new Set(flat.map((m) => m.accountId));
    expect(accountIds.size).toBeGreaterThanOrEqual(2);
  });

  it("messages have valid unified-schema shape", async () => {
    const accounts = await mockProvider.listAccounts();
    const messages = await mockProvider.listMessages(accounts[0].id);
    for (const m of messages) {
      expect(m.uid).toMatch(/^mock:[^:]+:[^:]+/);
      expect(m.accountId).toBeTruthy();
      expect(m.threadId).toBeTruthy();
      expect(m.from.email).toMatch(/@/);
      expect(typeof m.isRead).toBe("boolean");
      expect(m.folder).toBe("inbox");
      expect(Array.isArray(m.labels)).toBe(true);
      expect(Array.isArray(m.attachments)).toBe(true);
    }
  });

  it("archive moves a message out of the inbox folder", async () => {
    const accounts = await mockProvider.listAccounts();
    const before = await mockProvider.listMessages(accounts[0].id);
    const target = before[0];

    await mockProvider.applyAction({ type: "archive", uid: target.uid });

    const after = await mockProvider.listMessages(accounts[0].id);
    expect(after.find((m) => m.uid === target.uid)).toBeUndefined();
  });

  it("sending creates a message in the sent folder under the same thread", async () => {
    const accounts = await mockProvider.listAccounts();
    const inbox = await mockProvider.listMessages(accounts[0].id);
    const reply = await mockProvider.sendMessage({
      fromAccountId: accounts[0].id,
      to: [{ email: inbox[0].from.email }],
      subject: "Re: " + inbox[0].subject,
      body: "Got it, thanks.",
      inReplyToUid: inbox[0].uid,
    });
    expect(reply.folder).toBe("sent");
    expect(reply.threadId).toBe(inbox[0].threadId);
    const sent = await mockProvider.listMessages(accounts[0].id, { folder: "sent" });
    expect(sent.some((m) => m.uid === reply.uid)).toBe(true);
  });

  it("label add/remove round-trips through the provider", async () => {
    const accounts = await mockProvider.listAccounts();
    const msgs = await mockProvider.listMessages(accounts[0].id);
    const target = msgs[0];

    await mockProvider.applyAction({ type: "label", uid: target.uid, label: "Followups", value: true });
    let again = await mockProvider.listMessages(accounts[0].id);
    expect(again.find((m) => m.uid === target.uid)!.labels).toContain("Followups");

    await mockProvider.applyAction({ type: "label", uid: target.uid, label: "Followups", value: false });
    again = await mockProvider.listMessages(accounts[0].id);
    expect(again.find((m) => m.uid === target.uid)!.labels).not.toContain("Followups");
  });

  it("threads stitch replies back to the original message", async () => {
    const accounts = await mockProvider.listAccounts();
    const inbox = await mockProvider.listMessages(accounts[1].id); // work account has a 2-message thread
    const okrTarget = inbox.find((m) => m.threadId === "t_okr_alex");
    expect(okrTarget).toBeDefined();
    const thread = await mockProvider.getThread("t_okr_alex");
    expect(thread.messages.length).toBeGreaterThanOrEqual(2);
    // Messages should be sorted oldest → newest
    for (let i = 1; i < thread.messages.length; i++) {
      expect(thread.messages[i].receivedAt >= thread.messages[i - 1].receivedAt).toBe(true);
    }
  });
});
