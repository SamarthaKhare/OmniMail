import "server-only";
import type { Account, EmailMessage, ListMessagesOpts, Thread } from "@/types/protocol";
import { getActiveAccounts, getProviderForAccount } from "@/providers/registry";
import { triageBatch } from "./triage";

/**
 * Sync Agent.
 *
 * Responsible for delta-sync between OmniMail and each connected provider.
 * One sync call may touch multiple providers (Gmail + Yahoo IMAP + Outlook).
 * Every message returned by the Sync Agent has been triaged.
 */

export async function syncAccounts(): Promise<Account[]> {
  return getActiveAccounts();
}

export async function syncInbox(
  accountId: string,
  opts: ListMessagesOpts = {},
): Promise<EmailMessage[]> {
  const provider = getProviderForAccount(accountId);
  const raw = await provider.listMessages(accountId, opts);
  return triageBatch(raw);
}

export async function syncAllInboxes(): Promise<EmailMessage[]> {
  const accounts = await getActiveAccounts();
  const lists = await Promise.allSettled(
    accounts.map((a) =>
      getProviderForAccount(a.id).listMessages(a.id, { folder: "inbox" }),
    ),
  );
  const merged: EmailMessage[] = [];
  for (const r of lists) {
    if (r.status === "fulfilled") merged.push(...r.value);
    else console.error("[sync] account fetch failed:", r.reason);
  }
  return triageBatch(merged).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export async function syncThread(threadId: string): Promise<Thread> {
  // ThreadIds are namespaced by provider implicitly through their member messages.
  // We need to pick the right provider — encode it in the threadId for non-mock providers.
  // For now: try each connected provider until one returns the thread.
  const accounts = await getActiveAccounts();
  const candidates = accounts.map((a) => getProviderForAccount(a.id));
  // De-dupe providers
  const uniq = Array.from(new Set(candidates));
  let lastError: unknown = null;
  for (const provider of uniq) {
    try {
      const t = await provider.getThread(threadId);
      const messages = triageBatch(t.messages);
      const saliency = Math.max(0, ...messages.map((m) => m.ai?.saliency ?? 0));
      const latest = messages[messages.length - 1];
      return {
        ...t,
        messages,
        saliency,
        category: latest?.ai?.category ?? t.category,
      };
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw lastError ?? new Error(`Thread not found: ${threadId}`);
}
