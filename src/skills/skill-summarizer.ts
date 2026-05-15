import type { EmailMessage, Thread } from "@/types/protocol";

/**
 * skill-summarizer
 *
 * Context-window helpers for feeding email content into an LLM. The LLM is
 * called from `src/agents/scribe.ts`; this skill is responsible for trimming
 * and shaping the corpus so we don't blow the context budget.
 *
 * Budget assumptions (Claude / GPT-4o class): ~6k input tokens leaves room
 * for the system + response. We use chars as a cheap proxy (≈4 chars/token).
 */

const CHARS_PER_TOKEN = 4;
const DEFAULT_BUDGET_TOKENS = 6000;

export interface PackedCorpus {
  text: string;
  truncated: boolean;
  messagesIncluded: number;
}

/** Pack a list of messages into a single string under a token budget. */
export function packMessages(
  msgs: EmailMessage[],
  opts: { budgetTokens?: number; perMessageMaxChars?: number } = {},
): PackedCorpus {
  const budget = (opts.budgetTokens ?? DEFAULT_BUDGET_TOKENS) * CHARS_PER_TOKEN;
  const perMsgCap = opts.perMessageMaxChars ?? 600;

  let used = 0;
  let included = 0;
  const parts: string[] = [];
  for (const m of msgs) {
    const block = renderMessage(m, perMsgCap);
    if (used + block.length > budget) break;
    parts.push(block);
    used += block.length;
    included++;
  }
  return {
    text: parts.join("\n---\n"),
    truncated: included < msgs.length,
    messagesIncluded: included,
  };
}

/** Pack a single thread, preferring the most recent messages. */
export function packThread(thread: Thread, opts: { budgetTokens?: number } = {}): PackedCorpus {
  const newestFirst = [...thread.messages].sort((a, b) =>
    b.receivedAt.localeCompare(a.receivedAt),
  );
  const packed = packMessages(newestFirst, { ...opts, perMessageMaxChars: 800 });
  return packed;
}

function renderMessage(m: EmailMessage, perMsgCap: number): string {
  const who = m.from.name ?? m.from.email;
  const body = m.body.text.length > perMsgCap ? m.body.text.slice(0, perMsgCap) + "…" : m.body.text;
  return `[${m.receivedAt}] From: ${who}\nSubject: ${m.subject}\n\n${body}`;
}
