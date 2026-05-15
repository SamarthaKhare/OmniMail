"use client";

import { useState } from "react";
import { Star, Archive, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { cn, initials, relativeTime } from "@/lib/utils";
import { useSwipe } from "@/hooks/use-swipe";
import type { Account, EmailMessage } from "@/types/protocol";

interface Props {
  msg: EmailMessage;
  account?: Account;
  onOpen: () => void;
  onArchive: () => void;
  onStar: (next: boolean) => void;
  onLongRight: () => void;
  onLabelClick?: (label: string) => void;
}

export function EmailRow({
  msg,
  account,
  onOpen,
  onArchive,
  onStar,
  onLongRight,
  onLabelClick,
}: Props) {
  const [dx, setDx] = useState(0);

  const handlers = useSwipe({
    onSwipeLeft: onArchive,
    onSwipeRight: () => onStar(!msg.isStarred),
    onLongRight,
    onDrag: setDx,
  });

  const sal = msg.ai?.saliency ?? 0;
  const cat = msg.ai?.category ?? "other";

  return (
    <div className="relative overflow-hidden">
      {/* Swipe-action backgrounds */}
      <div className="absolute inset-y-0 left-0 flex w-full items-center justify-between px-4 text-xs font-medium text-white">
        <div
          className={cn(
            "flex items-center gap-1.5 text-warn transition-opacity",
            dx > 24 ? "opacity-100" : "opacity-0",
          )}
        >
          {dx > 140 ? <Sparkles className="h-4 w-4" /> : <Star className="h-4 w-4" />}
          <span>{dx > 140 ? "Summarize" : msg.isStarred ? "Unstar" : "Star"}</span>
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 text-danger transition-opacity",
            dx < -24 ? "opacity-100" : "opacity-0",
          )}
        >
          <span>Archive</span>
          <Archive className="h-4 w-4" />
        </div>
      </div>

      <motion.div
        {...handlers}
        animate={{ x: dx }}
        transition={{ type: "spring", stiffness: 600, damping: 40, mass: 0.4 }}
        className="relative bg-bg"
      >
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
          className={cn(
            "flex w-full items-stretch gap-3 border-b border-border/60 px-3 py-3 text-left",
            "cursor-pointer active:bg-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          )}
        >
          {/* Saliency rail */}
          <span
            className={cn("saliency-bar self-stretch", `saliency-${Math.max(1, sal)}`)}
            aria-hidden
          />

          {/* Avatar */}
          <div className="relative">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ background: account?.color ?? "#3b5cff" }}
            >
              {initials(msg.from.name ?? msg.from.email)}
            </div>
            {!msg.isRead && (
              <span
                className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg bg-accent"
                aria-hidden
              />
            )}
          </div>

          {/* Body */}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className={cn("truncate text-[15px]", msg.isRead ? "font-medium text-fg/85" : "font-semibold text-fg")}>
                {msg.from.name ?? msg.from.email}
              </span>
              <span className="ml-auto shrink-0 text-xs text-subtle">
                {relativeTime(msg.receivedAt)}
              </span>
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className={cn("truncate text-sm", msg.isRead ? "text-fg/80" : "text-fg")}>
                {msg.subject || "(no subject)"}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-1 text-[13px] text-subtle">{msg.snippet}</p>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <CategoryPill category={cat} />
              {sal >= 7 && (
                <span className="rounded-full bg-danger/12 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-danger">
                  Urgent · {sal}
                </span>
              )}
              {msg.labels.slice(0, 2).map((l) =>
                onLabelClick ? (
                  <button
                    key={l}
                    onClick={(e) => {
                      e.stopPropagation();
                      onLabelClick(l);
                    }}
                    className="rounded-full border border-border bg-surface px-1.5 py-0.5 text-[10px] text-fg/75 hover:bg-muted"
                  >
                    {l}
                  </button>
                ) : (
                  <span
                    key={l}
                    className="rounded-full border border-border bg-surface px-1.5 py-0.5 text-[10px] text-fg/75"
                  >
                    {l}
                  </span>
                ),
              )}
              {msg.labels.length > 2 && (
                <span className="text-[10px] text-subtle">+{msg.labels.length - 2}</span>
              )}
              {msg.isStarred && <Star className="h-3.5 w-3.5 fill-warn text-warn" />}
              {account && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-subtle">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: account.color }} />
                  {account.email}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function CategoryPill({ category }: { category: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    urgent: { label: "Urgent", cls: "bg-danger/15 text-danger" },
    work: { label: "Work", cls: "bg-accent/15 text-accent" },
    personal: { label: "Personal", cls: "bg-ok/15 text-ok" },
    promo: { label: "Promo", cls: "bg-subtle/15 text-subtle" },
    newsletter: { label: "News", cls: "bg-subtle/15 text-subtle" },
    notification: { label: "Notif", cls: "bg-subtle/15 text-subtle" },
    other: { label: "Other", cls: "bg-subtle/15 text-subtle" },
  };
  const c = map[category] ?? map.other;
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", c.cls)}>
      {c.label}
    </span>
  );
}
