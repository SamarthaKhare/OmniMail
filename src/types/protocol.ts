/**
 * OmniMail Unified Email Protocol.
 *
 * Every provider adapter maps its native representation to these types. The rest of
 * the app (agents, hooks, UI) only ever sees this shape. See specs/protocol.md.
 */

export type ProviderId = "mock" | "gmail" | "outlook" | "imap";

export type Folder =
  | "inbox"
  | "sent"
  | "drafts"
  | "archive"
  | "trash"
  | "spam";

export type VoiceProfile = "professional" | "casual" | "short";

export type TriageCategory =
  | "urgent"
  | "personal"
  | "work"
  | "promo"
  | "newsletter"
  | "notification"
  | "other";

export type TriageIntent =
  | "reply_needed"
  | "meeting"
  | "flight"
  | "invoice"
  | "follow_up"
  | "fyi";

export interface Account {
  id: string;
  provider: ProviderId;
  email: string;
  displayName: string;
  color: string;
  signature?: string;
  voiceProfile?: VoiceProfile;
}

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
}

export interface AIBlock {
  saliency: number;
  category: TriageCategory;
  summary?: string;
  intents?: TriageIntent[];
  triagedAt: string;
}

export interface EmailMessage {
  uid: string;
  accountId: string;
  threadId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  snippet: string;
  body: { text: string; html?: string };
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  folder: Folder;
  labels: string[];
  attachments: Attachment[];
  ai?: AIBlock;
}

export interface Thread {
  threadId: string;
  accountId: string;
  subject: string;
  participants: EmailAddress[];
  messages: EmailMessage[];
  lastMessageAt: string;
  unreadCount: number;
  saliency: number;
  category: TriageCategory;
  hasAttachments: boolean;
}

export interface DraftReply {
  threadId: string;
  inReplyToUid: string;
  fromAccountId: string;
  voice: VoiceProfile;
  body: string;
  citations: string[];
  generatedAt: string;
}

export interface PulseBullet {
  threadId: string;
  saliency: number;
  text: string;
  category: TriageCategory;
}

export interface Pulse {
  generatedAt: string;
  windowHours: number;
  unreadCount: number;
  headline: string;
  bullets: PulseBullet[];
}

export type ListMessagesOpts = {
  folder?: Folder;
  limit?: number;
  cursor?: string;
  query?: string;
};

export type MessageAction =
  | { type: "archive"; uid: string }
  | { type: "delete"; uid: string }
  | { type: "star"; uid: string; value: boolean }
  | { type: "mark_read"; uid: string; value: boolean }
  | { type: "label"; uid: string; label: string; value: boolean };

export interface Provider {
  id: ProviderId;
  listAccounts(): Promise<Account[]>;
  listMessages(accountId: string, opts?: ListMessagesOpts): Promise<EmailMessage[]>;
  getThread(threadId: string): Promise<Thread>;
  sendMessage(draft: OutboundDraft): Promise<EmailMessage>;
  applyAction(action: MessageAction): Promise<void>;
}

export interface OutboundDraft {
  fromAccountId: string;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: string;
  inReplyToUid?: string;
}

/** Make a stable cross-provider UID. */
export function makeUid(provider: ProviderId, accountId: string, remoteId: string): string {
  return `${provider}:${accountId}:${remoteId}`;
}

/** Parse a UID. Throws on malformed input — callers should only feed in trusted IDs. */
export function parseUid(uid: string): { provider: ProviderId; accountId: string; remoteId: string } {
  const [provider, accountId, ...rest] = uid.split(":");
  if (!provider || !accountId || rest.length === 0) {
    throw new Error(`Malformed uid: ${uid}`);
  }
  return {
    provider: provider as ProviderId,
    accountId,
    remoteId: rest.join(":"),
  };
}
