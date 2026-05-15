import "server-only";
import { z } from "zod";
import type {
  Account,
  DraftReply,
  EmailMessage,
  Pulse,
  PulseBullet,
  Thread,
  TriageCategory,
  VoiceProfile,
} from "@/types/protocol";
import { generateLLMText, generateLLMObject, llmAvailable } from "@/lib/llm";

/**
 * Scribe Agent — turns email context into:
 *   1. The Pulse (executive 24h summary)
 *   2. Smart Reply drafts in a chosen voice
 *
 * Every public method has a deterministic local fallback so it works without
 * an API key. The LLM path is preferred when keys are present.
 */

// ────────────────────── PULSE ──────────────────────

export async function generatePulse(msgs: EmailMessage[]): Promise<Pulse> {
  const windowHours = 24;
  const cutoff = Date.now() - windowHours * 3600_000;
  const recentUnread = msgs.filter(
    (m) => !m.isRead && new Date(m.receivedAt).getTime() >= cutoff,
  );

  if (recentUnread.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      windowHours,
      unreadCount: 0,
      headline: "Inbox zero in the last 24 hours. Nothing needs you right now.",
      bullets: [],
    };
  }

  // Always compute a deterministic fallback first.
  const local = localPulse(recentUnread, windowHours);

  if (!llmAvailable()) return local;

  const schema = z.object({
    headline: z.string(),
    bullets: z
      .array(
        z.object({
          threadId: z.string(),
          saliency: z.number().min(0).max(10),
          text: z.string(),
          category: z.enum([
            "urgent",
            "personal",
            "work",
            "promo",
            "newsletter",
            "notification",
            "other",
          ]),
        }),
      )
      .min(1)
      .max(6),
  });

  const corpus = recentUnread
    .slice(0, 30)
    .map(
      (m) =>
        `[thread:${m.threadId}] [sal:${m.ai?.saliency ?? 0}] from ${m.from.name ?? m.from.email}: ${m.subject}\n${m.snippet}`,
    )
    .join("\n---\n");

  const llm = await generateLLMObject({
    system:
      "You are the executive summarizer for an email client. Produce a 1-sentence headline " +
      "and 3-6 bullets covering only what the user must know in the last 24 hours. " +
      "Be specific — name people, name the ask, name the deadline. Never include promo or " +
      "newsletter content. Use the provided threadId verbatim in each bullet.",
    prompt: `User's unread mail in the last ${windowHours}h:\n\n${corpus}`,
    schema,
  });

  if (!llm) return local;
  return {
    generatedAt: new Date().toISOString(),
    windowHours,
    unreadCount: recentUnread.length,
    headline: llm.headline,
    bullets: llm.bullets as PulseBullet[],
  };
}

function localPulse(msgs: EmailMessage[], windowHours: number): Pulse {
  const byThread = new Map<string, EmailMessage[]>();
  for (const m of msgs) {
    const arr = byThread.get(m.threadId) ?? [];
    arr.push(m);
    byThread.set(m.threadId, arr);
  }

  const bullets: PulseBullet[] = [];
  for (const [threadId, group] of byThread) {
    const latest = group.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    const sal = Math.max(...group.map((m) => m.ai?.saliency ?? 0));
    const cat: TriageCategory = latest.ai?.category ?? "other";
    if (cat === "promo" || cat === "newsletter") continue;
    bullets.push({
      threadId,
      saliency: sal,
      category: cat,
      text: bulletFor(latest),
    });
  }

  bullets.sort((a, b) => b.saliency - a.saliency);
  const top = bullets.slice(0, 6);

  const urgent = top.filter((b) => b.saliency >= 7).length;
  const headline =
    urgent > 0
      ? `${urgent} ${urgent === 1 ? "item needs" : "items need"} you today — plus ${msgs.length - urgent} other unread.`
      : `${msgs.length} unread; nothing urgent. Quick scan recommended.`;

  return {
    generatedAt: new Date().toISOString(),
    windowHours,
    unreadCount: msgs.length,
    headline,
    bullets: top,
  };
}

function bulletFor(m: EmailMessage): string {
  const who = m.from.name?.split(/\s+/)[0] ?? m.from.email.split("@")[0];
  const intents = m.ai?.intents ?? [];
  if (intents.includes("reply_needed")) return `${who} is asking: "${m.subject}" — reply needed.`;
  if (intents.includes("flight")) return `Travel: ${m.subject}.`;
  if (intents.includes("meeting")) return `Meeting: ${m.subject}.`;
  if (intents.includes("invoice")) return `Finance: ${m.subject}.`;
  return `${who}: ${m.subject}.`;
}

// ────────────────────── SMART REPLY ──────────────────────

export async function generateSmartReply(opts: {
  thread: Thread;
  account: Account;
  voice: VoiceProfile;
}): Promise<DraftReply> {
  const { thread, account, voice } = opts;
  const lastInbound = [...thread.messages].reverse().find((m) => m.folder !== "sent");
  const inReplyToUid = (lastInbound ?? thread.messages[thread.messages.length - 1]).uid;

  const local = localReply(thread, account, voice);

  if (!llmAvailable()) return { ...local, inReplyToUid };

  const tail = thread.messages.slice(-4);
  const transcript = tail
    .map((m) => {
      const who = m.from.name ?? m.from.email;
      return `From: ${who}\nSubject: ${m.subject}\n\n${m.body.text}`;
    })
    .join("\n\n--- next message ---\n\n");

  const voiceRules: Record<VoiceProfile, string> = {
    professional:
      "Polished, friendly-but-formal. Two short paragraphs max. Address the sender by name.",
    casual: "Warm, conversational, contractions OK. 2–4 sentences. First-name basis.",
    short:
      "Curt and useful. Two sentences max. No greeting, no signoff beyond the user's name.",
  };

  const llm = await generateLLMText({
    system:
      `You draft email replies for a busy user. Voice: ${voice}. Rules: ${voiceRules[voice]} ` +
      `Reference specific content from the thread (numbers, names, deadlines). ` +
      `Do not include subject lines. Do not invent facts. ` +
      `Sign off as "${account.displayName}" unless the voice is "short".`,
    prompt: `Draft a reply to this thread:\n\n${transcript}`,
    maxTokens: 320,
  });

  if (!llm) return { ...local, inReplyToUid };

  return {
    threadId: thread.threadId,
    inReplyToUid,
    fromAccountId: account.id,
    voice,
    body: llm.trim(),
    citations: tail.map((m) => m.uid),
    generatedAt: new Date().toISOString(),
  };
}

function localReply(thread: Thread, account: Account, voice: VoiceProfile): DraftReply {
  const last = [...thread.messages].reverse().find((m) => m.folder !== "sent") ?? thread.messages.at(-1)!;
  const senderFirst = (last.from.name ?? last.from.email.split("@")[0]).split(/\s+/)[0];
  const hasQuestion = /\?/.test(last.body.text) || /\?/.test(last.subject);
  const hasUrgent = /urgent|today|asap|eod/i.test(last.body.text + last.subject);

  let body = "";
  switch (voice) {
    case "professional":
      body =
        `Hi ${senderFirst},\n\nThanks for the note on "${cleanSubj(last.subject)}". ` +
        (hasQuestion
          ? "I'll get back to you with specifics shortly — likely later today."
          : "I'm aligned on this; happy to proceed.") +
        (hasUrgent ? " I'll prioritize and confirm before EOD." : "") +
        `\n\nBest,\n${account.displayName}`;
      break;
    case "casual":
      body =
        `Hey ${senderFirst} — got it. ` +
        (hasQuestion ? "Will follow up with details soon. " : "Looks good to me. ") +
        (hasUrgent ? "On it today. " : "") +
        `\n\n${account.displayName.split(/\s+/)[0]}`;
      break;
    case "short":
      body = hasQuestion ? `Yes — will confirm shortly.` : `Sounds good. Proceeding.`;
      break;
  }

  return {
    threadId: thread.threadId,
    inReplyToUid: last.uid,
    fromAccountId: account.id,
    voice,
    body,
    citations: [last.uid],
    generatedAt: new Date().toISOString(),
  };
}

function cleanSubj(s: string): string {
  return s.replace(/^(?:re|fwd|fw):\s*/i, "").trim();
}

// ────────────────────── SINGLE-THREAD SUMMARY ──────────────────────
// Long-press on an email = "summarize this thread in one paragraph."

export async function summarizeThread(thread: Thread): Promise<string> {
  if (!llmAvailable()) {
    return localThreadSummary(thread);
  }
  const transcript = thread.messages
    .slice(-8)
    .map((m) => `From ${m.from.name ?? m.from.email}: ${m.subject}\n${m.body.text}`)
    .join("\n\n---\n\n");
  const out = await generateLLMText({
    system:
      "You summarize email threads in one tight paragraph (2-4 sentences). " +
      "Name who said what, the latest decision or open question, and any deadline. " +
      "No filler.",
    prompt: transcript,
    maxTokens: 200,
  });
  return out?.trim() ?? localThreadSummary(thread);
}

function localThreadSummary(thread: Thread): string {
  const lastInbound = [...thread.messages].reverse().find((m) => m.folder !== "sent") ?? thread.messages.at(-1)!;
  const sender = lastInbound.from.name ?? lastInbound.from.email;
  const intents = lastInbound.ai?.intents ?? [];
  const intentLine = intents.includes("reply_needed")
    ? "They're waiting on a reply from you."
    : intents.includes("meeting")
      ? "It's about a meeting."
      : intents.includes("invoice")
        ? "It's a billing/invoice update."
        : intents.includes("flight")
          ? "It's about travel."
          : "FYI.";
  const snippet = lastInbound.snippet.slice(0, 140);
  return `${thread.messages.length} message(s); most recent from ${sender}. ${intentLine} Snippet: "${snippet}".`;
}
