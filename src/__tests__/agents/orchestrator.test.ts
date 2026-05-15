import { describe, it, expect } from "vitest";
import { classifyIntent } from "@/agents/orchestrator";

describe("Orchestrator — intent classifier", () => {
  it("routes 'find the flight info from last week' to search", () => {
    const intent = classifyIntent("find the flight info from last week");
    expect(intent.kind).toBe("search");
    if (intent.kind === "search") expect(intent.query).toContain("flight");
  });

  it("routes 'what did I miss today?' to summarize", () => {
    const intent = classifyIntent("what did I miss today?");
    expect(intent.kind).toBe("summarize");
    if (intent.kind === "summarize") expect(intent.windowHours).toBe(24);
  });

  it("routes 'from alex' to filter", () => {
    const intent = classifyIntent("from alex");
    expect(intent.kind).toBe("filter");
    if (intent.kind === "filter") expect(intent.sender).toBe("alex");
  });

  it("routes 'in:urgent' to filter with category", () => {
    const intent = classifyIntent("in:urgent");
    expect(intent.kind).toBe("filter");
    if (intent.kind === "filter") expect(intent.category).toBe("urgent");
  });

  it("treats empty input as unknown", () => {
    const intent = classifyIntent("");
    expect(intent.kind).toBe("unknown");
  });
});

describe("Orchestrator — vector search", () => {
  it("returns flight email when querying 'flight'", async () => {
    const { vectorSearch } = await import("@/skills/skill-vector-search");
    const { buildMockMessages } = await import("@/providers/mock-data");
    const messages = buildMockMessages();
    const results = vectorSearch(messages, "flight to SFO", 5);
    expect(results.length).toBeGreaterThan(0);
    const subjects = results.map((m) => m.subject.toLowerCase());
    expect(subjects.some((s) => s.includes("flight"))).toBe(true);
  });

  it("ranks Q3 OKR email at the top for 'OKR Carter retention'", async () => {
    const { vectorSearch } = await import("@/skills/skill-vector-search");
    const { buildMockMessages } = await import("@/providers/mock-data");
    const messages = buildMockMessages();
    const results = vectorSearch(messages, "OKR Carter retention", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subject.toLowerCase()).toContain("okr");
  });
});
