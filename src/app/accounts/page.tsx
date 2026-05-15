"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ProviderId = "gmail" | "outlook" | "imap" | "mock";

interface ConnectedAccount {
  id: string;
  provider: ProviderId;
  email: string;
  displayName: string;
  color: string;
  createdAt: string;
}

interface AccountsResp {
  accounts: ConnectedAccount[];
  available: { gmail: boolean; outlook: boolean; imap: boolean };
}

/** Mirrors src/lib/imap-services.ts — kept narrow on purpose. */
const SUPPORTED_IMAP_SERVICES: Array<{
  id: "yahoo" | "aol";
  label: string;
  exampleEmail: string;
  appPasswordUrl: string;
}> = [
  { id: "yahoo", label: "Yahoo Mail", exampleEmail: "you@yahoo.com", appPasswordUrl: "https://login.yahoo.com/account/security" },
  { id: "aol", label: "AOL Mail", exampleEmail: "you@aol.com", appPasswordUrl: "https://login.aol.com/account/security" },
];

export default function AccountsPage() {
  return (
    <Suspense fallback={<AccountsLoading />}>
      <AccountsInner />
    </Suspense>
  );
}

function AccountsLoading() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col p-3">
      <div className="shimmer h-12 rounded-xl" />
      <div className="mt-3 space-y-2">
        <div className="shimmer h-14 rounded-xl" />
        <div className="shimmer h-14 rounded-xl" />
      </div>
    </main>
  );
}

function AccountsInner() {
  const params = useSearchParams();
  const [data, setData] = useState<AccountsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [imapOpen, setImapOpen] = useState(false);

  const banner = (() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) return { kind: "ok" as const, text: `Connected ${connected} account.` };
    if (error) return { kind: "err" as const, text: decodeURIComponent(error) };
    return null;
  })();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/accounts", { cache: "no-store" });
      const json = (await res.json()) as AccountsResp;
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function disconnect(id: string) {
    if (!confirm("Disconnect this account? Stored credentials will be deleted.")) return;
    const res = await fetch(`/api/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) void load();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-border/60 bg-bg/95 px-2 py-2 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}>
        <Link href="/" aria-label="Back to inbox" className="rounded-full p-2 hover:bg-muted active:scale-95">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-[15px] font-semibold">Accounts</h1>
      </header>

      {banner && (
        <div
          className={cn(
            "mx-3 mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm",
            banner.kind === "ok"
              ? "border border-ok/40 bg-ok/10 text-ok"
              : "border border-danger/40 bg-danger/10 text-danger",
          )}
        >
          {banner.kind === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="break-words">{banner.text}</span>
        </div>
      )}

      <section className="p-3">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
          Connected
        </h2>
        {loading ? (
          <div className="space-y-2">
            <div className="shimmer h-14 rounded-xl" />
            <div className="shimmer h-14 rounded-xl" />
          </div>
        ) : (data?.accounts.length ?? 0) === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-subtle">
            No real accounts connected yet. The inbox is using mock data.
          </p>
        ) : (
          <ul className="space-y-2">
            {data!.accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface/80 px-3 py-2.5"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ background: a.color }}
                >
                  {a.email.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.email}</p>
                  <p className="truncate text-xs text-subtle">
                    {a.provider.toUpperCase()} · added {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => void disconnect(a.id)}
                  aria-label="Disconnect"
                  className="rounded-full p-2 text-subtle hover:bg-danger/10 hover:text-danger active:scale-95"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="p-3">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
          Add an account
        </h2>
        <div className="space-y-2">
          <ProviderButton
            label="Connect Gmail"
            sub="OAuth via Google"
            disabled={!data?.available.gmail}
            disabledHint="Server is missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — see README."
            href="/api/auth/google/authorize"
            color="#ea4335"
          />
          <ProviderButton
            label="Connect Outlook / Office 365"
            sub="OAuth via Microsoft"
            disabled={!data?.available.outlook}
            disabledHint="Server is missing MS_CLIENT_ID / MS_CLIENT_SECRET — see README."
            href="/api/auth/microsoft/authorize"
            color="#0078d4"
          />
          <button
            onClick={() => setImapOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-surface/80 px-3 py-3 text-left hover:bg-muted/60"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: "#7c3aed" }}>
              <Mail className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Connect Yahoo or AOL</p>
              <p className="text-xs text-subtle">IMAP + SMTP, requires an app password</p>
            </div>
            <Plus className="h-4 w-4 text-subtle" />
          </button>
        </div>
      </section>

      <footer className="mt-auto px-3 pb-6 pt-2 text-[11px] leading-relaxed text-subtle">
        <Lock className="mr-1 inline h-3 w-3" />
        Credentials are encrypted at rest with AES-GCM. Plaintext is never logged or sent to the
        client. Set <code className="rounded bg-muted px-1">OMNIMAIL_SECRET</code> in your
        environment for a derived key; otherwise a random key is generated locally.
      </footer>

      {imapOpen && (
        <ImapForm
          onClose={() => setImapOpen(false)}
          onSaved={() => {
            setImapOpen(false);
            void load();
          }}
        />
      )}
    </main>
  );
}

function ProviderButton({
  label,
  sub,
  disabled,
  disabledHint,
  href,
  color,
}: {
  label: string;
  sub: string;
  disabled: boolean | undefined;
  disabledHint: string;
  href: string;
  color: string;
}) {
  const inner = (
    <>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: color }}
      >
        <Mail className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-subtle">{disabled ? disabledHint : sub}</p>
      </div>
      <Plus className="h-4 w-4 text-subtle" />
    </>
  );
  if (disabled) {
    return (
      <div
        aria-disabled
        className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-surface/40 px-3 py-3 text-left opacity-60"
      >
        {inner}
      </div>
    );
  }
  return (
    <a href={href} className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-surface/80 px-3 py-3 text-left hover:bg-muted/60">
      {inner}
    </a>
  );
}

function ImapForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [service, setService] = useState<"yahoo" | "aol">("yahoo");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = SUPPORTED_IMAP_SERVICES.find((s) => s.id === service)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/accounts/imap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ service, email, password: pass.replace(/\s+/g, "") }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <header className="flex items-center gap-1 border-b border-border/60 px-2 py-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}>
        <button
          aria-label="Close"
          onClick={onClose}
          className="rounded-full p-2 hover:bg-muted active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="flex-1 text-[15px] font-semibold">Connect Yahoo or AOL</h2>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-3 p-3 pb-24">
        <Field label="Service">
          <div className="grid grid-cols-2 gap-2">
            {SUPPORTED_IMAP_SERVICES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setService(s.id)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-sm font-medium",
                  service === s.id
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-surface text-fg/80 hover:bg-muted",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Email">
          <input
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={active.exampleEmail}
            className="w-full rounded-lg border border-border/70 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>

        <Field label="App password">
          <input
            type="password"
            required
            autoComplete="off"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="xxxx xxxx xxxx xxxx"
            className="w-full rounded-lg border border-border/70 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>

        <p className="rounded-md border border-accent/30 bg-accent/8 px-2.5 py-2 text-[11px] leading-relaxed text-fg/85">
          {active.label} no longer accepts your normal sign-in password for third-party apps.{" "}
          <a
            href={active.appPasswordUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent underline"
          >
            Generate an app password
          </a>{" "}
          on the {active.label} account-security page, then paste it above. Spaces are stripped.
        </p>

        {error && (
          <p className="rounded-md bg-danger/10 px-2 py-1.5 text-xs text-danger">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !email || !pass}
          className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accentFg disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Verifying…" : "Connect"}
        </button>
        <p className="text-[11px] text-subtle">
          We'll test the IMAP and SMTP connection before saving. Nothing is stored until both succeed.
        </p>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</span>
      {children}
    </label>
  );
}
