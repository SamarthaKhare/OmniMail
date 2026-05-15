import "server-only";
import type { EmailMessage } from "@/types/protocol";
import { syncAllInboxes } from "./sync";
import { vectorSearch } from "@/skills/skill-vector-search";

/**
 * Orchestrator Agent.
 *
 * The primary entry point for free-form user intent. It routes a natural-language
 * query to whichever agent / skill can answer it.
 *
 * Today it handles:
 *   - SEARCH      → vector + keyword search across the unified inbox
 *   - FILTER      → category / time / sender filters parsed from query
 *   - SUMMARIZE   → "what did I miss today?"
 *
 * The router itself is a tiny rule-based classifier — fast, deterministic,
 * cheap. It only escalates to the LLM if a query doesn't match any pattern.
 */

export type Intent =
  | { kind: "search"; query: string }
  | { kind: "filter"; category?: string; sender?: string; since?: Date }
  | { kind: "summarize"; windowHours: number }
  | { kind: "unknown"; raw: string };

export function classifyIntent(raw: string): Intent {
  const q = raw.trim();
  if (!q) return { kind: "unknown", raw };

  // SUMMARIZE
  if (/^(what did i miss|catch me up|summarize|tl;dr|pulse|brief)/i.test(q)) {
    return { kind: "summarize", windowHours: 24 };
  }

  // FILTER: "from X", "category Y", "in:Z"
  // We only treat "from X" as a filter when X is clearly a sender token —
  // an email, a domain, or a single bare word that isn't a time phrase. This
  // way "find flight info from last week" stays a search query.
  const TIME_WORDS = new Set([
    "last","this","yesterday","today","tomorrow","the","a","an","my","our","your",
  ]);
  const fromMatch = q.match(/(?:^|\s)from\s+([A-Za-z0-9._+@-]+)(?:\s|$)/i);
  const senderTok = fromMatch?.[1]?.toLowerCase();
  const senderLooksReal =
    !!senderTok && !TIME_WORDS.has(senderTok) && (senderTok.includes("@") || senderTok.includes(".") || /^[a-z]{2,}$/.test(senderTok));
  const catMatch = q.match(/(?:^|\s)(?:in|category)[:\s]+(urgent|personal|work|promo|newsletter|notification)/i);

  // Only call it a filter when (a) we have a category, OR (b) we have a real-looking
  // sender AND the whole query is short (i.e. mostly the filter clause itself).
  const shortQuery = q.split(/\s+/).length <= 4;
  if (catMatch || (senderLooksReal && shortQuery)) {
    return {
      kind: "filter",
      sender: senderLooksReal ? fromMatch?.[1] : undefined,
      category: catMatch?.[1]?.toLowerCase(),
    };
  }

  // Default: semantic / keyword search
  return { kind: "search", query: q };
}

export interface OrchestratorResult {
  intent: Intent;
  messages: EmailMessage[];
  note?: string;
}

export async function runOrchestrator(raw: string): Promise<OrchestratorResult> {
  const intent = classifyIntent(raw);
  const all = await syncAllInboxes();

  switch (intent.kind) {
    case "search": {
      const ranked = vectorSearch(all, intent.query, 15);
      return {
        intent,
        messages: ranked,
        note: ranked.length === 0 ? "No matches across your inboxes." : undefined,
      };
    }
    case "filter": {
      let out = all;
      if (intent.category) out = out.filter((m) => m.ai?.category === intent.category);
      if (intent.sender) {
        const s = intent.sender.toLowerCase();
        out = out.filter(
          (m) =>
            m.from.email.toLowerCase().includes(s) ||
            (m.from.name?.toLowerCase().includes(s) ?? false),
        );
      }
      if (intent.since) {
        out = out.filter((m) => new Date(m.receivedAt) >= intent.since!);
      }
      return { intent, messages: out.slice(0, 25) };
    }
    case "summarize": {
      const cutoff = Date.now() - intent.windowHours * 3600_000;
      const recent = all.filter((m) => new Date(m.receivedAt).getTime() >= cutoff && !m.isRead);
      return {
        intent,
        messages: recent,
        note: "Pass these to /api/pulse for a generated headline.",
      };
    }
    case "unknown":
    default:
      return { intent, messages: [], note: "I didn't understand that query." };
  }
}
