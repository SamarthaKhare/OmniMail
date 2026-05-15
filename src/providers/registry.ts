import "server-only";
import type { Account, Provider, ProviderId } from "@/types/protocol";
import { mockProvider } from "./mock-provider";
import { gmailProvider } from "./gmail-provider";
import { outlookProvider } from "./outlook-provider";
import { imapProvider } from "./imap-provider";
import { listAccountRecords } from "@/lib/accounts-store";

const REGISTRY: Record<ProviderId, Provider> = {
  mock: mockProvider,
  gmail: gmailProvider,
  outlook: outlookProvider,
  imap: imapProvider,
};

export function getProvider(id: ProviderId): Provider {
  const p = REGISTRY[id];
  if (!p) throw new Error(`Unknown provider id: ${id}`);
  return p;
}

/**
 * Returns the list of accounts the user has connected (Gmail, Outlook, IMAP).
 * If none are connected and `OMNIMAIL_DISABLE_MOCK !== "1"`, the Mock accounts
 * are returned so the demo always has something to show.
 */
export async function getActiveAccounts(): Promise<Account[]> {
  const records = listAccountRecords();
  if (records.length > 0) {
    return records.map((r) => ({
      id: r.id,
      provider: r.provider,
      email: r.email,
      displayName: r.displayName,
      color: r.color,
      signature: r.signature,
      voiceProfile: r.voiceProfile,
    }));
  }
  if (process.env.OMNIMAIL_DISABLE_MOCK === "1") return [];
  return mockProvider.listAccounts();
}

/**
 * Picks the provider for a given account id. The mock provider matches mock
 * accounts; everything else looks up the connected-account record.
 */
export function getProviderForAccount(accountId: string): Provider {
  if (accountId.startsWith("acct_")) return mockProvider; // mock account ids start with acct_
  const records = listAccountRecords();
  const rec = records.find((r) => r.id === accountId);
  if (!rec) {
    // Could be a not-yet-loaded mock account id — fall back to mock so we
    // don't crash mid-sync. The provider itself will surface "not found"
    // errors at message level if the id truly doesn't exist anywhere.
    return mockProvider;
  }
  return getProvider(rec.provider);
}

/** Convenience — returns true when the user has at least one real account connected. */
export function hasConnectedAccounts(): boolean {
  return listAccountRecords().length > 0;
}
