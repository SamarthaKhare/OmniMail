"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Account, OutboundDraft } from "@/types/protocol";

interface Props {
  accounts: Account[];
  onClose: () => void;
  onSend: (draft: OutboundDraft) => Promise<void>;
  initial?: Partial<OutboundDraft>;
}

export function ComposeSheet({ accounts, onClose, onSend, initial }: Props) {
  const [fromId, setFromId] = useState(initial?.fromAccountId ?? accounts[0]?.id ?? "");
  const [to, setTo] = useState(
    (initial?.to ?? []).map((a) => a.email).join(", "),
  );
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    const recipients = to
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((email) => ({ email }));
    if (recipients.length === 0) {
      setError("At least one recipient required");
      return;
    }
    const acct = accounts.find((a) => a.id === fromId);
    if (!acct) {
      setError("Pick a sending account");
      return;
    }
    setSending(true);
    try {
      await onSend({
        fromAccountId: fromId,
        to: recipients,
        subject: subject || "(no subject)",
        body: acct.signature ? `${body}\n\n${acct.signature}` : body,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
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
      className="fixed inset-0 z-50 flex flex-col bg-bg"
    >
      <header className="flex items-center gap-1 border-b border-border/60 px-2 py-2">
        <button
          aria-label="Close compose"
          onClick={onClose}
          className="rounded-full p-2 hover:bg-muted active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-[15px] font-semibold">New message</h1>
        <button
          onClick={send}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accentFg disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {sending ? "Sending" : "Send"}
        </button>
      </header>

      <div className="flex flex-col gap-2 p-3">
        <Field label="From">
          <select
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="w-full appearance-none rounded-lg border border-border/70 bg-surface px-3 py-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} · {a.email}
              </option>
            ))}
          </select>
        </Field>

        <Field label="To">
          <input
            type="text"
            inputMode="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className="w-full rounded-lg border border-border/70 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>

        <Field label="Subject">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-border/70 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </Field>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          placeholder="Write your message…  (Markdown supported)"
          className="mt-1 w-full resize-none rounded-lg border border-border/70 bg-surface p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-accent"
        />

        {error && (
          <p className="rounded-md bg-danger/10 px-2 py-1.5 text-xs text-danger">{error}</p>
        )}
      </div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</span>
      {children}
    </label>
  );
}
