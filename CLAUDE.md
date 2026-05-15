# OmniMail AI Project Guidelines

OmniMail AI is a **mobile-first, AI-native universal email client (PWA)**. The aim is to
eliminate "inbox anxiety": users should never have to *read* an email to understand its
intent or priority.

## Build Commands

- Dev: `npm run dev`
- Build: `npm run build`
- Test: `npm run test`           # vitest, headless
- Test (watch): `npm run test:watch`
- Lint: `npm run lint`

## Architecture: Agent OS

The system is split into **Agents** (logic controllers that make decisions) and
**Skills** (reusable, stateless capabilities). React-specific lifecycle logic lives in
**Hooks**.

- **Agents** live in `src/agents/`
  - `sync.ts`         — delta-sync between client and provider (Mock/Gmail/Outlook/IMAP)
  - `triage.ts`       — assigns saliency score, labels, category to a message
  - `scribe.ts`       — generates Pulse summaries and Smart Reply drafts
  - `orchestrator.ts` — routes user intent ("find the flight info") to the right agent
- **Skills** live in `src/skills/`
  - `use-email-protocol.ts` — provider-agnostic protocol facade (Gmail/IMAP/Outlook)
  - `skill-summarizer.ts`   — LLM context-window management for summaries
  - `skill-vector-search.ts` — lightweight in-memory semantic search
- **Hooks** live in `src/hooks/` (React-only — `use-inbox`, `use-swipe`, etc.)
- **Providers** live in `src/providers/` — concrete adapters that implement the protocol
- **Types** live in `src/types/protocol.ts` — the single source of truth for the
  unified email schema (see `specs/protocol.md`)

## Provider Strategy

OmniMail is **multi-account** and supports exactly four provider paths:

  1. **Gmail** — OAuth2 + Gmail REST API
  2. **Office 365 / Outlook** — OAuth2 + Microsoft Graph
  3. **Yahoo Mail** — IMAP/SMTP, app password required
  4. **AOL Mail** — IMAP/SMTP, app password required

IMAP is intentionally restricted to Yahoo + AOL. The allowed-services list is
the single source of truth in `src/lib/imap-services.ts`, and the
`/api/accounts/imap` route rejects any service outside it. Do not introduce
custom IMAP hosts or other providers (iCloud, Fastmail, etc.) — this is a
product scope decision.

Connected accounts live in `.omnimail/accounts.json` (AES-256-GCM at rest,
gitignored). When zero real accounts are connected, the mock provider seeds
the inbox so the demo always has data. See `README.md` for env-var setup
and the `/accounts` page for runtime account management.

- Providers in `src/providers/` are all live implementations.
- Registry lookup is by **account id**, not env var — `getProviderForAccount(id)`.
- Sync agent fans out across every connected account in parallel; results are
  merged and triaged before they leave.

## AI Strategy

LLM calls go through `src/lib/llm.ts`. Order of preference:

1. `ANTHROPIC_API_KEY`  → Anthropic Claude (Sonnet 4.6 by default)
2. `OPENAI_API_KEY`     → OpenAI
3. Neither              → deterministic **local fallback** (rule-based templates). The
   product still works without keys; AI features just degrade gracefully.

## Code Style

- TypeScript everywhere. No `any` unless interfacing with untyped external libs.
- Functional components. Tailwind CSS only — no CSS modules.
- Icons: `lucide-react`.
- API calls go through `src/lib/api.ts`; UI surfaces errors via toast/inline banner —
  never crash the inbox.
- Server-only code (anything touching credentials, IMAP, OAuth secrets) lives in
  `src/app/api/**` or files imported only by it; never import them from client components.

## Testing Strategy

- Unit tests for agents in `src/__tests__/agents/`.
- Protocol mock test in `src/__tests__/protocol.test.ts` — this is the **Zero-Config
  Start** smoke test; it must always pass on a fresh clone.
- E2E (optional, Playwright) in `tests/e2e/` for the inbox flow.

## UX Invariants

- **Mobile-first**: design at 375px first. Tap targets ≥ 44px.
- **Optimistic UI**: archive/delete must apply instantly; sync runs in background and
  rolls back on failure.
- **Swipe language**: left-swipe → archive; long right-swipe → AI summary.
- **The Pulse** sits at the top of the inbox and summarizes the last 24h of unread mail.
