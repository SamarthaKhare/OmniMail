# OmniMail AI

A mobile-first, AI-native universal email PWA. Built around an **Agent OS**
architecture: discrete agents (Sync, Triage, Scribe, Orchestrator) plus
reusable Skills (vector search, summarizer, protocol facade)

## Quickstart

```bash
npm install
npm test         # 21 tests pass — including the "Protocol Mock" zero-config gate
npm run build    # production build
npm run dev      # http://localhost:3000
```

No API keys required — the default `mock` provider seeds three accounts
(Gmail-style, Outlook-style, AOL-style) with 14 realistic messages, and AI
features degrade to deterministic local templates when no LLM key is set.

## What's inside

- **Unified Inbox** across three mock accounts with origin markers.
- **The Pulse** at the top of the inbox — a 24h executive summary generated
  by the Scribe Agent. Click any bullet to jump to the thread.
- **Saliency Scoring 0–10** on every message via the Triage Agent (deterministic
  rubric: sender relationship, urgency markers, action required, promo noise).
- **Smart Reply** drawer with three voices (Professional / Casual / Short) that
  references real thread content.
- **Thread Summary** via long-right-swipe or the ✨ icon in the thread header.
- **Optimistic UI**: archive / delete / star apply instantly, roll back on
  server failure.
- **Swipe language**: left → archive, right → star, long-right → AI summary.
- **PWA**: manifest, service worker (cache-first shell, network-first API with
  stale fallback), installable to the home screen.
- **Orchestrator** answers free-form queries: "find the flight info from last
  week", "what did I miss today?", "from alex", "in:urgent".

## Provider strategy

OmniMail supports **multiple connected accounts of different types simultaneously**
— e.g. one Gmail + one Yahoo IMAP + one Office 365. Manage them at `/accounts`.

Each provider is a live implementation, not a stub:

| Provider | Implementation file                       | Requires |
| -------- | ----------------------------------------- | -------- |
| **Mock** (fallback) | [`src/providers/mock-provider.ts`](src/providers/mock-provider.ts) | nothing — runs zero-config |
| **Gmail** (OAuth2 + Gmail REST API) | [`src/providers/gmail-provider.ts`](src/providers/gmail-provider.ts) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| **Outlook / Office 365** (Graph) | [`src/providers/outlook-provider.ts`](src/providers/outlook-provider.ts) | `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, optional `MS_TENANT_ID` |
| **IMAP / SMTP** (imapflow + nodemailer) | [`src/providers/imap-provider.ts`](src/providers/imap-provider.ts) | nothing — **Yahoo and AOL only**, via the form on `/accounts` |

When no real accounts are connected, the inbox renders the Mock dataset so
the demo always has something to show. Add a real account at `/accounts`
and the Mock data automatically steps aside.

### Connecting Gmail

1. Open <https://console.cloud.google.com/apis/credentials>, create an OAuth
   2.0 Client ID for a **Web application**.
2. Authorized redirect URI: `http://localhost:3100/api/auth/google/callback`
   (or your deployed URL).
3. Add Gmail API + OpenID Connect scopes when prompted on consent screen
   setup. The runtime requests `gmail.modify`, `gmail.send`, `openid`,
   `email`, `profile`.
4. Put credentials in `.env.local`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   OMNIMAIL_BASE_URL=http://localhost:3100
   ```
5. Restart the dev server → `/accounts` → **Connect Gmail**.

### Connecting Office 365 / Outlook

1. Register an app at <https://entra.microsoft.com> → App registrations.
2. Redirect URI (Web): `http://localhost:3100/api/auth/microsoft/callback`.
3. API permissions: `Mail.ReadWrite`, `Mail.Send`, `offline_access`,
   `openid`, `email`, `profile`. Grant admin consent if required for your
   tenant.
4. `.env.local`:
   ```
   MS_CLIENT_ID=...
   MS_CLIENT_SECRET=...
   MS_TENANT_ID=common      # or your tenant id
   OMNIMAIL_BASE_URL=http://localhost:3100
   ```
5. Restart → `/accounts` → **Connect Outlook**.

### Connecting Yahoo or AOL (IMAP / SMTP)

Open `/accounts` → **Connect Yahoo or AOL** → pick the service → enter your
email and **app password**. The form verifies both IMAP (port 993, direct
TLS) and SMTP (port 465, direct TLS) before saving.

Both providers stopped accepting plain passwords years ago. Generate an
app password on the provider's security page:

- Yahoo: <https://login.yahoo.com/account/security>
- AOL: <https://login.aol.com/account/security>

Custom IMAP hosts, iCloud, Fastmail, and Gmail-via-IMAP are **not supported**
by design — use Gmail OAuth or Outlook OAuth for those mailboxes. Server-side
the [`/api/accounts/imap`](src/app/api/accounts/imap/route.ts) route rejects
any service that isn't `yahoo` or `aol`; the host map lives in
[`src/lib/imap-services.ts`](src/lib/imap-services.ts).

### Credential storage

Connected-account credentials are persisted to `.omnimail/accounts.json`
(gitignored). Each record's credential blob is sealed with **AES-256-GCM**
via [`src/lib/crypto.ts`](src/lib/crypto.ts). The encryption key comes from:

- `OMNIMAIL_SECRET` env var (recommended) → scrypt-derived 32-byte key
- otherwise → a random key written once to `.omnimail/key` (mode `0o600`)

This is local-dev grade — for production, derive the key from a real KMS.

## AI strategy

LLM calls go through `src/lib/llm.ts` (Vercel AI SDK). The app picks a
provider at runtime based on which key is present:

1. `OPENAI_API_KEY` → **GPT-4o-mini** ← the default for this deployment
2. `ANTHROPIC_API_KEY` → Claude Sonnet 4.5 (takes priority if both are set)
3. Neither → **deterministic local fallback** (rule-based templates)

The app works in all three modes; AI quality just degrades gracefully.

### Setting the OpenAI key

**Locally** — copy your key into `.env.local`:

```
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx
```

then restart the dev server.

**On Vercel** — add `OPENAI_API_KEY` under **Project → Settings → Environment
Variables** (apply to Production, Preview, and Development), then redeploy.
Env vars only take effect on new builds.

> Note on priority: if you ever set both `ANTHROPIC_API_KEY` and
> `OPENAI_API_KEY`, Anthropic wins because it's checked first in
> `src/lib/llm.ts`. To force OpenAI, leave `ANTHROPIC_API_KEY` unset.

## Project layout (Agent OS)

```
src/
├── agents/                 # Logic controllers — decisions live here
│   ├── sync.ts             # Delta-sync between client and provider
│   ├── triage.ts           # Saliency + category + intents
│   ├── scribe.ts           # Pulse, Smart Reply, Thread Summary
│   └── orchestrator.ts     # Free-form intent router
├── skills/                 # Stateless reusable capabilities
│   ├── use-email-protocol.ts   # Client-side provider facade (hook)
│   ├── skill-vector-search.ts  # In-memory TF-IDF semantic search
│   └── skill-summarizer.ts     # LLM context-window packing
├── providers/              # Concrete adapters (mock + gmail/outlook/imap stubs)
├── hooks/                  # React lifecycle (use-swipe)
├── types/protocol.ts       # Single source of truth — unified email schema
├── components/             # Pulse card, email row, thread view, compose sheet
├── app/                    # Next.js App Router (UI + /api routes)
└── __tests__/              # Vitest — Protocol Mock + agent unit tests
specs/
└── protocol.md             # Schema spec; mirrored in src/types/protocol.ts
public/
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
└── icon-{192,512}.png
CLAUDE.md                   # Project rules for Claude Code
```

## Tests

```bash
npm test
```

- `protocol.test.ts` — the **Zero-Config Start** smoke test (Mock provider
  satisfies the unified schema; unified view fetches ≥10 from ≥2 sources).
- `agents/triage.test.ts` — urgent peer mail scores ≥7, promos ≤2, flight /
  invoice intents detected, saliency clamped to 0–10.
- `agents/orchestrator.test.ts` — intent classifier + vector search.
- `agents/sync.test.ts` — every synced message carries an `ai` block.

## Notes & decisions

- **Why mock-first?** Real OAuth (Gmail/Microsoft) needs an approved app
  registration and consent screen, which can't ship in a one-shot assignment.
  The mock provider keeps the demo working end-to-end while leaving the
  Provider interface untouched — swapping in a real adapter is a one-file change.
- **Why a deterministic triage algorithm?** The PRD asks for saliency *based
  on urgency and sender relationship* — this is exactly the kind of structured
  signal a rule-based pass nails. LLM enrichment is layered on top (the Scribe
  Agent overwrites `summary` with an LLM-written version when a key is present).
- **Why TF-IDF for "vector" search?** Ships zero-dependency, runs in milliseconds,
  and the file is structured so replacing it with a real embeddings call is one
  function swap. Real-world OmniMail would store embeddings on the AIBlock.
