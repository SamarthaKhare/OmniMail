"use client";

import { useEffect, useState } from "react";
import { Sparkles, ChevronRight, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Pulse } from "@/types/protocol";

interface Props {
  onOpenThread: (threadId: string) => void;
}

export function PulseCard({ onOpenThread }: Props) {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/pulse", { cache: "no-store" });
      const data = (await res.json()) as Pulse;
      setPulse(data);
    } catch {
      setPulse(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section
      className={cn(
        "pulse-aurora mx-3 mt-3 rounded-2xl border border-border/70 px-4 py-3 shadow-sm",
        "transition-all",
      )}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Sparkles className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold tracking-tight">The Pulse</h2>
          <span className="text-xs text-subtle">last 24h</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Regenerate Pulse"
            onClick={() => void load()}
            className="rounded-full p-1.5 text-subtle hover:bg-muted active:scale-95"
          >
            <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full p-1.5 text-subtle hover:bg-muted active:scale-95"
          >
            <ChevronRight
              className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")}
            />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="mt-3 space-y-2">
          <div className="shimmer h-4 w-3/4 rounded" />
          <div className="shimmer h-3 w-full rounded" />
          <div className="shimmer h-3 w-5/6 rounded" />
        </div>
      ) : pulse ? (
        <div className="mt-2">
          <p className="text-[15px] leading-snug">{pulse.headline}</p>
          {expanded && pulse.bullets.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {pulse.bullets.map((b) => (
                <li key={b.threadId}>
                  <button
                    onClick={() => onOpenThread(b.threadId)}
                    className="group flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left text-sm text-fg/90 hover:bg-muted active:bg-muted/80"
                  >
                    <SaliencyDot s={b.saliency} />
                    <span className="flex-1 leading-snug">{b.text}</span>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-subtle opacity-0 transition group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {expanded && pulse.bullets.length === 0 && (
            <p className="mt-1 text-sm text-subtle">Nothing to surface — you're clear.</p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-subtle">Couldn't generate Pulse. Try again.</p>
      )}
    </section>
  );
}

function SaliencyDot({ s }: { s: number }) {
  const tone =
    s >= 7 ? "bg-danger" : s >= 5 ? "bg-warn" : s >= 3 ? "bg-subtle" : "bg-subtle/50";
  return <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", tone)} aria-hidden />;
}
