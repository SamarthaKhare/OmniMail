import "server-only";
import type {
  EmailAddress,
  EmailMessage,
  Folder,
  ListMessagesOpts,
  MessageAction,
  OutboundDraft,
  Provider,
  Thread,
} from "@/types/protocol";
import { makeUid, parseUid } from "@/types/protocol";
import {
  getAccountRecord,
  getCredentials,
  listAccountRecords,
  updateCredentials,
} from "@/lib/accounts-store";
import { microsoftConfig, refreshAccessToken, type OAuthTokens } from "@/lib/oauth";

/**
 * Outlook / Office 365 provider via Microsoft Graph.
 */

async function getAccessToken(accountId: string): Promise<string> {
  const cfg = microsoftConfig();
  if (!cfg) throw new Error("Outlook OAuth not configured. Set MS_CLIENT_ID + MS_CLIENT_SECRET.");
  const creds = getCredentials(accountId);
  if (!creds || creds.kind !== "outlook") throw new Error(`No Outlook credentials for ${accountId}`);
  if (creds.accessToken && creds.accessTokenExpiresAt && creds.accessTokenExpiresAt > Date.now()) {
    return creds.accessToken;
  }
  const refreshed: OAuthTokens = await refreshAccessToken(cfg, creds.refreshToken);
  updateCredentials(accountId, {
    kind: "outlook",
    refreshToken: refreshed.refreshToken ?? creds.refreshToken,
    accessToken: refreshed.accessToken,
    accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
  });
  return refreshed.accessToken;
}

async function graph<T = unknown>(accountId: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken(accountId);
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const FOLDER_TO_GRAPH: Record<Folder, string> = {
  inbox: "inbox",
  sent: "sentitems",
  drafts: "drafts",
  archive: "archive",
  trash: "deleteditems",
  spam: "junkemail",
};

interface GraphMsg {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: { contentType: "text" | "html"; content: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress: { name?: string; address: string } }[];
  ccRecipients?: { emailAddress: { name?: string; address: string } }[];
  bccRecipients?: { emailAddress: { name?: string; address: string } }[];
  receivedDateTime: string;
  isRead: boolean;
  flag?: { flagStatus?: "notFlagged" | "complete" | "flagged" };
  categories?: string[];
  parentFolderId?: string;
  hasAttachments?: boolean;
}

function addr(a?: { name?: string; address?: string }): EmailAddress {
  return { name: a?.name || undefined, email: a?.address ?? "" };
}

function toEmailMessage(m: GraphMsg, accountId: string, folder: Folder): EmailMessage {
  const text = m.body.contentType === "text"
    ? m.body.content
    : (m.body.content || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  const html = m.body.contentType === "html" ? m.body.content : undefined;
  return {
    uid: makeUid("outlook", accountId, m.id),
    accountId,
    threadId: `outlook:${accountId}:${m.conversationId}`,
    from: addr(m.from?.emailAddress),
    to: (m.toRecipients ?? []).map((r) => addr(r.emailAddress)),
    cc: m.ccRecipients?.length ? m.ccRecipients.map((r) => addr(r.emailAddress)) : undefined,
    subject: m.subject || "(no subject)",
    snippet: (m.bodyPreview ?? text).slice(0, 200),
    body: { text, html },
    receivedAt: m.receivedDateTime,
    isRead: m.isRead,
    isStarred: m.flag?.flagStatus === "flagged",
    folder,
    labels: m.categories ?? [],
    attachments: [],
  };
}

export const outlookProvider: Provider = {
  id: "outlook",

  async listAccounts() {
    return listAccountRecords()
      .filter((r) => r.provider === "outlook")
      .map((r) => ({
        id: r.id,
        provider: r.provider,
        email: r.email,
        displayName: r.displayName,
        color: r.color,
        signature: r.signature,
        voiceProfile: r.voiceProfile,
      }));
  },

  async listMessages(accountId: string, opts: ListMessagesOpts = {}) {
    const { folder = "inbox", limit = 30, query } = opts;
    const folderId = FOLDER_TO_GRAPH[folder];
    const search = query ? `&$search="${encodeURIComponent(query)}"` : "";
    const out = await graph<{ value: GraphMsg[] }>(
      accountId,
      `/me/mailFolders/${folderId}/messages?$top=${limit}&$orderby=receivedDateTime desc${search}`,
    );
    return (out.value ?? []).map((m) => toEmailMessage(m, accountId, folder));
  },

  async getThread(threadId: string) {
    const [, accountId, conversationId] = threadId.split(":");
    if (!accountId || !conversationId) throw new Error(`Outlook thread id malformed: ${threadId}`);
    const out = await graph<{ value: GraphMsg[] }>(
      accountId,
      `/me/messages?$filter=conversationId eq '${conversationId}'&$orderby=receivedDateTime asc&$top=50`,
    );
    const messages = (out.value ?? []).map((m) =>
      toEmailMessage(m, accountId, m.parentFolderId === "sentitems" ? "sent" : "inbox"),
    );
    const latest = messages[messages.length - 1];
    return {
      threadId,
      accountId,
      subject: (latest?.subject ?? "").replace(/^(?:re|fwd|fw):\s*/i, "").trim(),
      participants: [latest?.from ?? { email: "" }, ...(latest?.to ?? [])].filter((a) => a.email),
      messages,
      lastMessageAt: latest?.receivedAt ?? new Date().toISOString(),
      unreadCount: messages.filter((m) => !m.isRead).length,
      saliency: 0,
      category: "other",
      hasAttachments: messages.some((m) => m.attachments.length > 0),
    } satisfies Thread;
  },

  async sendMessage(draft: OutboundDraft) {
    const record = getAccountRecord(draft.fromAccountId);
    if (!record) throw new Error(`Account ${draft.fromAccountId} not found`);
    const message = {
      subject: draft.subject,
      body: { contentType: "Text", content: draft.body },
      toRecipients: draft.to.map((t) => ({ emailAddress: { address: t.email, name: t.name } })),
      ccRecipients: draft.cc?.map((t) => ({ emailAddress: { address: t.email, name: t.name } })),
      bccRecipients: draft.bcc?.map((t) => ({ emailAddress: { address: t.email, name: t.name } })),
    };
    await graph(record.id, `/me/sendMail`, {
      method: "POST",
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
    return {
      uid: makeUid("outlook", record.id, `sent_${Date.now()}`),
      accountId: record.id,
      threadId: `outlook:${record.id}:sent_${Date.now()}`,
      from: { name: record.displayName, email: record.email },
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      snippet: draft.body.slice(0, 200),
      body: { text: draft.body },
      receivedAt: new Date().toISOString(),
      isRead: true,
      isStarred: false,
      folder: "sent",
      labels: [],
      attachments: [],
    };
  },

  async applyAction(action: MessageAction) {
    const { accountId, remoteId } = parseUid(action.uid);
    switch (action.type) {
      case "archive": {
        // Move to "archive" if it exists, else just remove from Inbox.
        await graph(accountId, `/me/messages/${remoteId}/move`, {
          method: "POST",
          body: JSON.stringify({ destinationId: "archive" }),
        });
        return;
      }
      case "delete":
        await graph(accountId, `/me/messages/${remoteId}/move`, {
          method: "POST",
          body: JSON.stringify({ destinationId: "deleteditems" }),
        });
        return;
      case "star":
        await graph(accountId, `/me/messages/${remoteId}`, {
          method: "PATCH",
          body: JSON.stringify({
            flag: { flagStatus: action.value ? "flagged" : "notFlagged" },
          }),
        });
        return;
      case "mark_read":
        await graph(accountId, `/me/messages/${remoteId}`, {
          method: "PATCH",
          body: JSON.stringify({ isRead: action.value }),
        });
        return;
      case "label": {
        // Graph "categories" are user-defined string list; we toggle one entry.
        const current = await graph<{ categories?: string[] }>(accountId, `/me/messages/${remoteId}?$select=categories`);
        const set = new Set(current.categories ?? []);
        if (action.value) set.add(action.label); else set.delete(action.label);
        await graph(accountId, `/me/messages/${remoteId}`, {
          method: "PATCH",
          body: JSON.stringify({ categories: Array.from(set) }),
        });
        return;
      }
    }
  },
};
