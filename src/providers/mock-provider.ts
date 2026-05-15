import type {
  Account,
  EmailMessage,
  ListMessagesOpts,
  MessageAction,
  OutboundDraft,
  Provider,
  Thread,
} from "@/types/protocol";
import { mockAccounts, buildMockMessages } from "./mock-data";

/**
 * In-memory provider. Stable across requests in dev because we cache on the
 * global object. This is the zero-config default — the app fully works without
 * any OAuth credentials or external services.
 */
type Store = { messages: EmailMessage[]; sentCounter: number };

const globalKey = "__omnimail_mock_store__";
function getStore(): Store {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (!g[globalKey]) {
    g[globalKey] = {
      messages: buildMockMessages(),
      sentCounter: 0,
    } satisfies Store;
  }
  return g[globalKey] as Store;
}

function findOrThrow(uid: string): EmailMessage {
  const m = getStore().messages.find((x) => x.uid === uid);
  if (!m) throw new Error(`Message not found: ${uid}`);
  return m;
}

function matchesQuery(m: EmailMessage, q: string): boolean {
  const needle = q.toLowerCase();
  return (
    m.subject.toLowerCase().includes(needle) ||
    m.snippet.toLowerCase().includes(needle) ||
    m.body.text.toLowerCase().includes(needle) ||
    m.from.email.toLowerCase().includes(needle) ||
    (m.from.name?.toLowerCase().includes(needle) ?? false)
  );
}

export const mockProvider: Provider = {
  id: "mock",

  async listAccounts() {
    return mockAccounts;
  },

  async listMessages(accountId: string, opts: ListMessagesOpts = {}) {
    const { folder = "inbox", limit = 100, query } = opts;
    const out = getStore()
      .messages.filter((m) => m.accountId === accountId && m.folder === folder)
      .filter((m) => (query ? matchesQuery(m, query) : true))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .slice(0, limit);
    return structuredClone(out);
  },

  async getThread(threadId: string) {
    const ms = getStore()
      .messages.filter((m) => m.threadId === threadId)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    if (ms.length === 0) throw new Error(`Thread not found: ${threadId}`);
    const latest = ms[ms.length - 1];
    const participants = uniqueParticipants(ms);
    const unreadCount = ms.filter((m) => !m.isRead).length;
    const saliency = Math.max(0, ...ms.map((m) => m.ai?.saliency ?? 0));
    const hasAttachments = ms.some((m) => m.attachments.length > 0);

    return structuredClone({
      threadId,
      accountId: latest.accountId,
      subject: cleanSubject(latest.subject),
      participants,
      messages: ms,
      lastMessageAt: latest.receivedAt,
      unreadCount,
      saliency,
      category: latest.ai?.category ?? "other",
      hasAttachments,
    }) satisfies Thread;
  },

  async sendMessage(draft: OutboundDraft) {
    const store = getStore();
    store.sentCounter += 1;
    const acct = mockAccounts.find((a) => a.id === draft.fromAccountId);
    if (!acct) throw new Error(`Unknown sending account: ${draft.fromAccountId}`);
    const inReplyTo = draft.inReplyToUid ? findOrThrow(draft.inReplyToUid) : undefined;

    const msg: EmailMessage = {
      uid: `mock:${acct.id}:sent_${store.sentCounter}`,
      accountId: acct.id,
      threadId: inReplyTo?.threadId ?? `t_sent_${store.sentCounter}`,
      from: { name: acct.displayName, email: acct.email },
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      snippet: draft.body.slice(0, 200),
      body: { text: draft.body },
      receivedAt: new Date().toISOString(),
      isRead: true,
      isStarred: false,
      folder: "sent",
      labels: [],
      attachments: [],
    };
    store.messages.push(msg);

    if (inReplyTo) {
      inReplyTo.isRead = true;
    }
    return structuredClone(msg);
  },

  async applyAction(action: MessageAction) {
    const m = findOrThrow(action.uid);
    switch (action.type) {
      case "archive":
        m.folder = "archive";
        break;
      case "delete":
        m.folder = "trash";
        break;
      case "star":
        m.isStarred = action.value;
        break;
      case "mark_read":
        m.isRead = action.value;
        break;
      case "label":
        if (action.value) {
          if (!m.labels.includes(action.label)) m.labels.push(action.label);
        } else {
          m.labels = m.labels.filter((l) => l !== action.label);
        }
        break;
    }
  },
};

function uniqueParticipants(ms: EmailMessage[]) {
  const seen = new Map<string, { name?: string; email: string }>();
  for (const m of ms) {
    seen.set(m.from.email, m.from);
    for (const t of m.to) seen.set(t.email, t);
  }
  return Array.from(seen.values());
}

function cleanSubject(s: string): string {
  return s.replace(/^(?:\s*(?:re|fwd|fw)\s*:\s*)+/i, "").trim();
}

/** Test-only reset. */
export function __resetMockStore() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any)[globalKey] = undefined;
}
