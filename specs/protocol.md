# OmniMail Unified Email Protocol

This document is the single source of truth for OmniMail's provider-agnostic email
schema. Every provider adapter (Mock, Gmail, Outlook, IMAP) maps its native data
into these types; everything else in the app — agents, hooks, UI — only sees the
unified shape.

The canonical TypeScript definitions live in [`src/types/protocol.ts`](../src/types/protocol.ts).

## Goals

1. **One inbox, many providers.** Gmail labels, Outlook categories, and IMAP folders
   are normalized into a single `labels: string[]` plus structural folder enums.
2. **Stable IDs across providers.** Each message exposes a `uid` that is unique within
   the OmniMail namespace (`<provider>:<account>:<remoteId>`), so client-side state
   and AI metadata survive re-syncs.
3. **AI-friendly.** Every message carries an `ai` block (`saliency`, `summary`,
   `category`, `intents`) that agents can write to incrementally.

## Core entities

### `Account`

```ts
{
  id: string;              // OmniMail-internal id
  provider: 'mock' | 'gmail' | 'outlook' | 'imap';
  email: string;           // user@example.com
  displayName: string;
  color: string;           // hex, for origin marker
  signature?: string;
  voiceProfile?: 'professional' | 'casual' | 'short';
}
```

### `EmailAddress`

```ts
{ name?: string; email: string }
```

### `EmailMessage`

```ts
{
  uid: string;                 // <provider>:<accountId>:<remoteId>
  accountId: string;
  threadId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  snippet: string;             // first ~200 chars, plain text
  body: { text: string; html?: string };
  receivedAt: string;          // ISO timestamp
  isRead: boolean;
  isStarred: boolean;
  folder: 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash' | 'spam';
  labels: string[];            // provider labels mapped through normalizer
  attachments: Attachment[];
  ai?: {
    saliency: number;          // 0-10, written by Triage Agent
    category: TriageCategory;  // urgent | personal | work | promo | newsletter | notification | other
    summary?: string;          // one-line, written by Scribe
    intents?: TriageIntent[];  // reply_needed | meeting | flight | invoice | follow_up
    triagedAt: string;
  };
}
```

### `Thread`

A `Thread` is the user-facing unit. It groups messages by `threadId` and exposes:

```ts
{
  threadId: string;
  accountId: string;
  subject: string;             // subject of the latest message, with Re:/Fwd: stripped
  participants: EmailAddress[];
  messages: EmailMessage[];    // sorted oldest → newest
  lastMessageAt: string;
  unreadCount: number;
  saliency: number;            // max() over messages
  category: TriageCategory;    // mode of message categories
  hasAttachments: boolean;
}
```

### `DraftReply`

```ts
{
  threadId: string;
  inReplyToUid: string;
  fromAccountId: string;
  voice: 'professional' | 'casual' | 'short';
  body: string;                // markdown
  citations: string[];         // uids of messages the draft references
  generatedAt: string;
}
```

### `Pulse`

The executive summary that sits at the top of the inbox. Produced by the Scribe Agent
from the last 24h of unread mail.

```ts
{
  generatedAt: string;
  windowHours: number;         // typically 24
  unreadCount: number;
  headline: string;            // one sentence
  bullets: PulseBullet[];      // 3-6 items, sorted by saliency desc
}
PulseBullet = {
  threadId: string;
  saliency: number;
  text: string;                // human-friendly: "Alex needs your reply on Q3 OKRs"
  category: TriageCategory;
}
```

## Provider Adapter Contract

Every provider in `src/providers/` exports a `Provider` object satisfying:

```ts
{
  id: 'mock' | 'gmail' | 'outlook' | 'imap';
  listAccounts(): Promise<Account[]>;
  listMessages(accountId, opts): Promise<EmailMessage[]>;
  getThread(threadId): Promise<Thread>;
  sendMessage(draft): Promise<EmailMessage>;
  applyAction(action): Promise<void>;   // archive | delete | star | mark_read | label
}
```

The active provider is selected at runtime by `useEmailProtocol()` /
`getActiveProvider()` based on `OMNIMAIL_PROVIDER`. The default is `mock` so the app
runs zero-config.

## Saliency scoring

The Triage Agent assigns an integer **0–10** based on a weighted blend of:

- **Sender relationship**: known contact (+3), VIP domain (+2), mailing list (-2).
- **Urgency markers**: words like "urgent", "today", "ASAP", a question mark in the
  subject, a deadline in the body (+1 to +3).
- **Action required**: explicit ask, RSVP, signature request (+2).
- **Promotion / noise**: unsubscribe header, marketing-style words (-3 to -5).

The exact algorithm is in `src/agents/triage.ts`. Scores ≥ 7 are surfaced in the Pulse.
