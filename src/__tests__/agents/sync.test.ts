import { describe, it, expect, beforeEach } from "vitest";
import { __resetMockStore } from "@/providers/mock-provider";

/**
 * Sync Agent — verifies that the Triage step always runs as part of sync, so
 * downstream code can rely on `msg.ai` being populated.
 */
describe("Sync Agent", () => {
  beforeEach(() => __resetMockStore());

  it("attaches an AI block to every message returned from syncAllInboxes()", async () => {
    const { syncAllInboxes } = await import("@/agents/sync");
    const msgs = await syncAllInboxes();
    expect(msgs.length).toBeGreaterThan(0);
    for (const m of msgs) {
      expect(m.ai).toBeDefined();
      expect(typeof m.ai!.saliency).toBe("number");
      expect(m.ai!.saliency).toBeGreaterThanOrEqual(0);
      expect(m.ai!.saliency).toBeLessThanOrEqual(10);
      expect(m.ai!.category).toBeTruthy();
    }
  });
});
