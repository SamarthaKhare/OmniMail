"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Inbox, Search, PenSquare, Filter, UserCog } from "lucide-react";
import { useEmailProtocol } from "@/skills/use-email-protocol";
import { PulseCard } from "@/components/pulse-card";
import { EmailRow } from "@/components/email-row";
import { ThreadView } from "@/components/thread-view";
import { ComposeSheet } from "@/components/compose-sheet";
import { cn } from "@/lib/utils";
import type { Account, EmailMessage, OutboundDraft } from "@/types/protocol";

type Filter = "all" | "unread" | "urgent";

export default function InboxPage() {
  const {
    accounts,
    accountsById,
    messages,
    loading,
    error,
    sendAction,
    sendDraft,
    refresh,
  } = useEmailProtocol();

  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInitial, setComposeInitial] = useState<Partial<OutboundDraft> | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let out = messages;
    if (accountFilter) out = out.filter((m) => m.accountId === accountFilter);
    if (labelFilter) out = out.filter((m) => m.labels.includes(labelFilter));
    if (filter === "unread") out = out.filter((m) => !m.isRead);
    if (filter === "urgent") out = out.filter((m) => (m.ai?.saliency ?? 0) >= 7);
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (m) =>
          m.subject.toLowerCase().includes(q) ||
          m.snippet.toLowerCase().includes(q) ||
          m.from.email.toLowerCase().includes(q) ||
          (m.from.name?.toLowerCase().includes(q) ?? false),
      );
    }
    return out;
  }, [messages, filter, accountFilter, labelFilter, query]);

  function openForward(msg: EmailMessage) {
    const quoted = msg.body.text
      .split("\n")
      .map((l) => "> " + l)
      .join("\n");
    setComposeInitial({
      fromAccountId: msg.accountId,
      to: [],
      subject: msg.subject.match(/^fwd:/i) ? msg.subject : `Fwd: ${msg.subject}`,
      body: `\n\n---------- Forwarded message ----------\nFrom: ${msg.from.name ?? msg.from.email} <${msg.from.email}>\nDate: ${new Date(msg.receivedAt).toLocaleString()}\nSubject: ${msg.subject}\n\n${quoted}`,
    });
    setComposeOpen(true);
  }

  // Group by thread, take latest message per thread
  const threadRows = useMemo(() => {
    const seen = new Map<string, EmailMessage>();
    for (const m of filtered) {
      const existing = seen.get(m.threadId);
      if (!existing || m.receivedAt > existing.receivedAt) seen.set(m.threadId, m);
    }
    return Array.from(seen.values()).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }, [filtered]);

  const counts = useMemo(() => {
    const pool = accountFilter
      ? messages.filter((m) => m.accountId === accountFilter)
      : messages;
    return {
      all: pool.length,
      unread: pool.filter((m) => !m.isRead).length,
      urgent: pool.filter((m) => (m.ai?.saliency ?? 0) >= 7).length,
    };
  }, [messages, accountFilter]);

  const accountUnread = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of messages) {
      if (!m.isRead) map.set(m.accountId, (map.get(m.accountId) ?? 0) + 1);
    }
    return map;
  }, [messages]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <TopBar
        query={query}
        setQuery={setQuery}
        accountColors={accounts.map((a) => a.color)}
      />

      <PulseCard onOpenThread={(tid) => setActiveThread(tid)} />

      <AccountSwitcher
        accounts={accounts}
        selected={accountFilter}
        onSelect={setAccountFilter}
        unreadByAccount={accountUnread}
      />

      {labelFilter && (
        <LabelFilterBadge label={labelFilter} onClear={() => setLabelFilter(null)} />
      )}

      <FilterBar filter={filter} setFilter={setFilter} counts={counts} />

      {error && (
        <div className="mx-3 mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex-1">
        {loading ? (
          <LoadingList />
        ) : threadRows.length === 0 ? (
          <EmptyState onRefresh={refresh} />
        ) : (
          <ul className="scroll-clean">
            {threadRows.map((m) => (
              <li key={m.threadId}>
                <EmailRow
                  msg={m}
                  account={accountsById[m.accountId]}
                  onOpen={() => setActiveThread(m.threadId)}
                  onArchive={() => sendAction({ type: "archive", uid: m.uid })}
                  onStar={(v) => sendAction({ type: "star", uid: m.uid, value: v })}
                  onLongRight={() => setActiveThread(m.threadId)}
                  onLabelClick={(label) => setLabelFilter(label)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <FloatingCompose onClick={() => setComposeOpen(true)} />

      <AnimatePresence>
        {activeThread && (
          <ThreadView
            key={activeThread}
            threadId={activeThread}
            accountsById={accountsById}
            onClose={() => {
              setActiveThread(null);
              void refresh();
            }}
            onArchive={(uid) => sendAction({ type: "archive", uid })}
            onDelete={(uid) => sendAction({ type: "delete", uid })}
            onStar={(uid, v) => sendAction({ type: "star", uid, value: v })}
            onSendReply={sendDraft}
            onForward={openForward}
            onLabel={(uid, label, value) =>
              sendAction({ type: "label", uid, label, value })
            }
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {composeOpen && (
          <ComposeSheet
            accounts={accounts}
            initial={composeInitial ?? undefined}
            onClose={() => {
              setComposeOpen(false);
              setComposeInitial(null);
            }}
            onSend={async (d) => {
              await sendDraft(d);
            }}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function TopBar({
  query,
  setQuery,
  accountColors,
}: {
  query: string;
  setQuery: (s: string) => void;
  accountColors: string[];
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/90 px-3 pb-2 pt-3 backdrop-blur"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-fg text-bg">
          <Inbox className="h-4 w-4" />
        </span>
        <h1 className="text-base font-semibold tracking-tight">OmniMail</h1>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex items-center -space-x-1.5">
            {accountColors.slice(0, 4).map((c, i) => (
              <span
                key={i}
                className="h-5 w-5 rounded-full border-2 border-bg"
                style={{ background: c }}
                aria-hidden
              />
            ))}
          </div>
          <Link
            href="/accounts"
            aria-label="Manage accounts"
            className="rounded-full p-1.5 text-subtle hover:bg-muted hover:text-fg active:scale-95"
          >
            <UserCog className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-subtle" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search across accounts…"
          className="w-full rounded-xl border border-border/70 bg-surface pl-8 pr-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
    </header>
  );
}

function AccountSwitcher({
  accounts,
  selected,
  onSelect,
  unreadByAccount,
}: {
  accounts: Account[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  unreadByAccount: Map<string, number>;
}) {
  if (accounts.length <= 1) return null;
  return (
    <div className="scroll-clean flex items-center gap-1.5 overflow-x-auto px-3 pb-1 pt-2">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
          selected === null
            ? "border-fg bg-fg text-bg"
            : "border-border bg-surface text-fg/80 hover:bg-muted",
        )}
      >
        All inboxes
      </button>
      {accounts.map((a) => {
        const unread = unreadByAccount.get(a.id) ?? 0;
        const active = selected === a.id;
        return (
          <button
            key={a.id}
            onClick={() => onSelect(active ? null : a.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium transition",
              active
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface text-fg/80 hover:bg-muted",
            )}
            aria-pressed={active}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: a.color }}
              aria-hidden
            />
            <span className="max-w-[100px] truncate">{a.email}</span>
            {unread > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold",
                  active ? "bg-accent text-accentFg" : "bg-muted text-subtle",
                )}
              >
                {unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function LabelFilterBadge({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <div className="mx-3 mt-2 inline-flex items-center gap-1 self-start rounded-full border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent">
      <span>Label: {label}</span>
      <button onClick={onClear} className="ml-0.5 rounded-full px-1 hover:bg-accent/15" aria-label="Clear label filter">
        ×
      </button>
    </div>
  );
}

function FilterBar({
  filter,
  setFilter,
  counts,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  counts: { all: number; unread: number; urgent: number };
}) {
  const tabs: Array<{ id: Filter; label: string; n: number }> = [
    { id: "all", label: "All", n: counts.all },
    { id: "unread", label: "Unread", n: counts.unread },
    { id: "urgent", label: "Urgent", n: counts.urgent },
  ];
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <Filter className="h-3.5 w-3.5 text-subtle" />
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setFilter(t.id)}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium transition",
            filter === t.id
              ? "bg-fg text-bg"
              : "bg-muted text-fg/70 hover:bg-muted/70",
          )}
        >
          {t.label}
          <span
            className={cn(
              "ml-1 text-[10px]",
              filter === t.id ? "text-bg/70" : "text-subtle",
            )}
          >
            {t.n}
          </span>
        </button>
      ))}
    </div>
  );
}

function FloatingCompose({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Compose"
      className="fixed bottom-5 right-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accentFg shadow-lg active:scale-95"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
    >
      <PenSquare className="h-6 w-6" />
    </button>
  );
}

function LoadingList() {
  return (
    <ul className="px-3 pt-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-border/40 py-3">
          <div className="shimmer h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="shimmer h-3 w-1/3 rounded" />
            <div className="shimmer h-3 w-2/3 rounded" />
            <div className="shimmer h-3 w-1/2 rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="mx-3 mt-8 rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center">
      <Inbox className="mx-auto h-8 w-8 text-subtle" />
      <p className="mt-3 text-sm font-medium">Nothing here.</p>
      <p className="mt-1 text-xs text-subtle">No messages match this filter.</p>
      <button
        onClick={onRefresh}
        className="mt-3 rounded-full bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/70"
      >
        Refresh
      </button>
    </div>
  );
}
