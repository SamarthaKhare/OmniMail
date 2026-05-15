import type { EmailMessage } from "@/types/protocol";

/**
 * skill-vector-search
 *
 * A lightweight, dependency-free semantic-ish search over the unified inbox.
 * For the assignment we don't ship a real embedding model — instead we use a
 * TF-IDF–style bag-of-words cosine similarity with a few email-specific
 * boosts (sender, subject weight, recency). This is good enough to power the
 * Orchestrator's "find the flight info from last week" demo without any
 * external service.
 *
 * Plugging in real embeddings later: replace `vectorize` with a call to
 * embeddings.create() and store the vectors in the message's AIBlock.
 */

const STOPWORDS = new Set([
  "the","a","an","and","or","but","is","are","was","were","be","been","being",
  "have","has","had","do","does","did","of","to","in","on","at","for","with",
  "by","as","that","this","these","those","i","you","he","she","it","we","they",
  "your","my","our","their","from","re","fwd","fw","not","no",
]);

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).filter((t) => !STOPWORDS.has(t));
}

function tf(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function score(msg: EmailMessage, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const subjectTokens = tokenize(msg.subject);
  const bodyTokens = tokenize(msg.snippet + " " + msg.body.text.slice(0, 2000));
  const senderTokens = tokenize(msg.from.email + " " + (msg.from.name ?? ""));

  const subjectTf = tf(subjectTokens);
  const bodyTf = tf(bodyTokens);
  const senderTf = tf(senderTokens);

  let s = 0;
  for (const q of queryTokens) {
    s += (subjectTf.get(q) ?? 0) * 5; // subjects matter most
    s += (senderTf.get(q) ?? 0) * 3;
    s += (bodyTf.get(q) ?? 0) * 1;
  }

  // Recency boost: half-life of 7 days
  const ageDays = (Date.now() - new Date(msg.receivedAt).getTime()) / 86_400_000;
  s *= Math.pow(0.5, ageDays / 7);

  // Saliency boost — surface important things first
  s *= 1 + (msg.ai?.saliency ?? 0) / 20;

  return s;
}

export function vectorSearch(
  corpus: EmailMessage[],
  query: string,
  k = 10,
): EmailMessage[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored = corpus
    .map((m) => ({ m, s: score(m, tokens) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, k);

  return scored.map((x) => x.m);
}
