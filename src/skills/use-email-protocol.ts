"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Account,
  EmailMessage,
  MessageAction,
  OutboundDraft,
  Thread,
} from "@/types/protocol";

/**
 * useEmailProtocol — the client-side facade over /api/* routes.
 *
 * The point of this hook is that everything in the UI talks to the same
 * provider-agnostic surface. Swapping the active provider (mock → gmail →
 * outlook → imap) is a server-side concern (OMNIMAIL_PROVIDER) and doesn't
 * touch any component code.
 *
 * Optimistic updates: archive/delete/star/markRead apply locally first and
 * roll back if the server rejects. This is the "zero-latency feel" required
 * by the spec.
 */

type State = {
  accounts: Account[];
  messages: EmailMessage[];
  loading: boolean;
  error: string | null;
};

const initial: State = { accounts: [], messages: [], loading: true, error: null };

export function useEmailProtocol() {
  const [state, setState] = useState<State>(initial);

  const refresh = useCallback(async () => {
    try {
      setState((s) => ({ ...s, loading: true, error: null }));
      const res = await fetch("/api/inbox", { cache: "no-store" });
      if (!res.ok) throw new Error(`inbox failed: ${res.status}`);
      const data = (await res.json()) as { accounts: Account[]; messages: EmailMessage[] };
      setState({ accounts: data.accounts, messages: data.messages, loading: false, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyOptimistic = useCallback(
    (uid: string, mutate: (m: EmailMessage) => EmailMessage | null) => {
      let prev: EmailMessage | undefined;
      setState((s) => {
        const messages = s.messages
          .map((m) => {
            if (m.uid !== uid) return m;
            prev = m;
            return mutate(m);
          })
          .filter((m): m is EmailMessage => m !== null);
        return { ...s, messages };
      });
      return () => {
        if (!prev) return;
        const restored = prev;
        setState((s) => {
          if (s.messages.some((m) => m.uid === restored.uid)) return s;
          return { ...s, messages: [restored, ...s.messages] };
        });
      };
    },
    [],
  );

  const sendAction = useCallback(async (action: MessageAction) => {
    let rollback: (() => void) | null = null;
    if (action.type === "archive" || action.type === "delete") {
      rollback = applyOptimistic(action.uid, () => null); // remove from list
    } else if (action.type === "star") {
      rollback = applyOptimistic(action.uid, (m) => ({ ...m, isStarred: action.value }));
    } else if (action.type === "mark_read") {
      rollback = applyOptimistic(action.uid, (m) => ({ ...m, isRead: action.value }));
    }

    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!res.ok) throw new Error(`action failed: ${res.status}`);
    } catch (err) {
      rollback?.();
      setState((s) => ({ ...s, error: (err as Error).message }));
    }
  }, [applyOptimistic]);

  const sendDraft = useCallback(async (draft: OutboundDraft) => {
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!res.ok) throw new Error(`send failed: ${res.status}`);
    await refresh();
  }, [refresh]);

  const getThread = useCallback(async (threadId: string): Promise<Thread> => {
    const res = await fetch(`/api/thread/${encodeURIComponent(threadId)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`thread failed: ${res.status}`);
    return (await res.json()) as Thread;
  }, []);

  const accountsById = useMemo(
    () => Object.fromEntries(state.accounts.map((a) => [a.id, a] as const)),
    [state.accounts],
  );

  return {
    ...state,
    accountsById,
    refresh,
    sendAction,
    sendDraft,
    getThread,
  };
}
