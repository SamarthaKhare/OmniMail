"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles, Reply, Forward, Archive, Trash2, Star, Tag, X, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, initials, relativeTime } from "@/lib/utils";
import type {
  Account,
  DraftReply,
  EmailMessage,
  OutboundDraft,
  Thread,
  VoiceProfile,
} from "@/types/protocol";

interface Props {
  threadId: string;
  accountsById: Record<string, Account>;
  onClose: () => void;
  onArchive: (uid: string) => void;
  onDelete: (uid: string) => void;
  onStar: (uid: string, next: boolean) => void;
  onSendReply: (draft: OutboundDraft) => Promise<void>;
  onForward: (msg: EmailMessage) => void;
  onLabel: (uid: string, label: string, value: boolean) => void;
}

export function ThreadView({
  threadId,
  accountsById,
  onClose,
  onArchive,
  onDelete,
  onStar,
  onSendReply,
  onForward,
  onLabel,
}: Props) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/thread/${encodeURIComponent(threadId)}`, { cache: "no-store" });
      if (!res.ok) return;
      const t = (await res.json()) as Thread;
      if (!cancelled) setThread(t);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  async function doSummary() {
    setSummarizing(true);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      const data = (await res.json()) as { summary: string };
      setSummary(data.summary);
    } finally {
      setSummarizing(false);
    }
  }

  if (!thread) {
    return (
      <div className="fixed inset-0 z-40 bg-bg">
        <Header subject="Loading…" onClose={onClose} />
        <div className="space-y-3 p-4">
          <div className="shimmer h-4 w-2/3 rounded" />
          <div className="shimmer h-3 w-full rounded" />
          <div className="shimmer h-3 w-5/6 rounded" />
        </div>
      </div>
    );
  }

  const latest = thread.messages.at(-1)!;
  const account = accountsById[thread.accountId];

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
      className="fixed inset-0 z-40 flex flex-col bg-bg"
    >
      <Header subject={thread.subject} onClose={onClose} />

      <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2">
        <IconAction label="Summarize thread" onClick={doSummary} loading={summarizing}>
          <Sparkles className="h-4 w-4" />
        </IconAction>
        <IconAction label="Forward latest" onClick={() => onForward(latest)}>
          <Forward className="h-4 w-4" />
        </IconAction>
        <IconAction label="Archive latest" onClick={() => { onArchive(latest.uid); onClose(); }}>
          <Archive className="h-4 w-4" />
        </IconAction>
        <IconAction label="Delete latest" onClick={() => { onDelete(latest.uid); onClose(); }}>
          <Trash2 className="h-4 w-4" />
        </IconAction>
        <IconAction label="Toggle star" onClick={() => onStar(latest.uid, !latest.isStarred)}>
          <Star className={cn("h-4 w-4", latest.isStarred && "fill-warn text-warn")} />
        </IconAction>
        <button
          onClick={() => setReplyOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accentFg active:scale-[0.98]"
        >
          <Reply className="h-4 w-4" />
          Smart Reply
        </button>
      </div>

      <AnimatePresence>
        {summary && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-3 mt-3 rounded-xl border border-accent/40 bg-accent/8 p-3 text-sm leading-relaxed"
          >
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-accent">
              <Sparkles className="h-3.5 w-3.5" /> Thread summary
            </div>
            <p>{summary}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 space-y-3 overflow-auto p-3 pb-32">
        {thread.messages.map((m) => (
          <MessageBlock
            key={m.uid}
            m={m}
            account={accountsById[m.accountId]}
            onLabel={onLabel}
          />
        ))}
      </div>

      <AnimatePresence>
        {replyOpen && account && (
          <SmartReplyDrawer
            thread={thread}
            account={account}
            onClose={() => setReplyOpen(false)}
            onSend={onSendReply}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Header({ subject, onClose }: { subject: string; onClose: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-border/60 bg-bg/95 px-2 py-2 backdrop-blur">
      <button
        aria-label="Back"
        onClick={onClose}
        className="rounded-full p-2 text-fg hover:bg-muted active:scale-95"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="line-clamp-1 flex-1 text-[15px] font-semibold">{subject}</h1>
    </header>
  );
}

function IconAction({
  children,
  onClick,
  label,
  loading,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  loading?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full text-fg/80 hover:bg-muted active:scale-95",
        loading && "animate-pulse",
      )}
    >
      {children}
    </button>
  );
}

function MessageBlock({
  m,
  account,
  onLabel,
}: {
  m: EmailMessage;
  account?: Account;
  onLabel: (uid: string, label: string, value: boolean) => void;
}) {
  const [labels, setLabels] = useState<string[]>(m.labels);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v || labels.includes(v)) {
      setAdding(false);
      setDraft("");
      return;
    }
    setLabels((arr) => [...arr, v]);
    onLabel(m.uid, v, true);
    setAdding(false);
    setDraft("");
  }
  function remove(label: string) {
    setLabels((arr) => arr.filter((l) => l !== label));
    onLabel(m.uid, label, false);
  }

  return (
    <article className="rounded-2xl border border-border/60 bg-surface/80 p-3 shadow-sm">
      <header className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ background: account?.color ?? "#3b5cff" }}
        >
          {initials(m.from.name ?? m.from.email)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {m.from.name ?? m.from.email}{" "}
            <span className="text-xs font-normal text-subtle">&lt;{m.from.email}&gt;</span>
          </p>
          <p className="truncate text-xs text-subtle">
            to {m.to.map((t) => t.name ?? t.email).join(", ")} · {relativeTime(m.receivedAt)}
          </p>
        </div>
      </header>
      <pre className="mt-2.5 whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-fg/90">
        {m.body.text}
      </pre>
      {m.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.attachments.map((a) => (
            <span
              key={a.id}
              className="rounded-md border border-border/60 bg-muted/60 px-2 py-1 text-xs"
            >
              📎 {a.filename}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Tag className="h-3 w-3 text-subtle" aria-hidden />
        {labels.length === 0 && !adding && (
          <span className="text-[11px] text-subtle">no labels</span>
        )}
        {labels.map((l) => (
          <span
            key={l}
            className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-fg/85"
          >
            {l}
            <button
              onClick={() => remove(l)}
              aria-label={`Remove label ${l}`}
              className="ml-0.5 rounded-full p-0.5 hover:bg-danger/15 hover:text-danger"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") { setAdding(false); setDraft(""); }
            }}
            placeholder="label name"
            className="w-24 rounded-full border border-accent/40 bg-bg px-2 py-0.5 text-[11px] outline-none focus:border-accent"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-1.5 py-0.5 text-[11px] text-subtle hover:bg-muted"
            aria-label="Add label"
          >
            <Plus className="h-2.5 w-2.5" />
            add
          </button>
        )}
      </div>
    </article>
  );
}

function SmartReplyDrawer({
  thread,
  account,
  onClose,
  onSend,
}: {
  thread: Thread;
  account: Account;
  onClose: () => void;
  onSend: (draft: OutboundDraft) => Promise<void>;
}) {
  const [voice, setVoice] = useState<VoiceProfile>(account.voiceProfile ?? "professional");
  const [draft, setDraft] = useState<DraftReply | null>(null);
  const [editing, setEditing] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  async function regen(v: VoiceProfile) {
    setLoading(true);
    setVoice(v);
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: thread.threadId, voice: v }),
      });
      const d = (await res.json()) as DraftReply;
      setDraft(d);
      setEditing(d.body);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void regen(voice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    if (!draft) return;
    setSending(true);
    try {
      const lastInbound =
        [...thread.messages].reverse().find((m) => m.folder !== "sent") ?? thread.messages.at(-1)!;
      const replyTo = lastInbound.from.email === account.email
        ? lastInbound.to
        : [lastInbound.from];
      const subj = lastInbound.subject.match(/^re:/i)
        ? lastInbound.subject
        : `Re: ${lastInbound.subject}`;
      await onSend({
        fromAccountId: account.id,
        to: replyTo,
        subject: subj,
        body: editing,
        inReplyToUid: draft.inReplyToUid,
      });
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
      className="absolute inset-x-0 bottom-0 z-30 rounded-t-3xl border-t border-border/70 bg-surface p-3 shadow-2xl"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-accent" /> Smart Reply
        </div>
        <button
          onClick={onClose}
          className="rounded-full px-2 py-1 text-xs text-subtle hover:bg-muted"
        >
          Cancel
        </button>
      </div>

      <div className="mb-2 flex gap-1.5">
        {(["professional", "casual", "short"] as VoiceProfile[]).map((v) => (
          <button
            key={v}
            onClick={() => regen(v)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs capitalize",
              voice === v
                ? "border-accent bg-accent/15 text-accent"
                : "border-border bg-muted text-fg/80",
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <textarea
        value={editing}
        onChange={(e) => setEditing(e.target.value)}
        rows={6}
        placeholder={loading ? "Drafting…" : "Reply will appear here"}
        className="w-full resize-none rounded-xl border border-border/70 bg-bg p-3 text-sm leading-relaxed outline-none focus:border-accent"
      />
      <div className="mt-2 flex items-center justify-between text-xs text-subtle">
        <span>
          From: <span className="font-medium text-fg/80">{account.email}</span>
        </span>
        <button
          onClick={send}
          disabled={!editing || sending}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accentFg disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </motion.div>
  );
}
