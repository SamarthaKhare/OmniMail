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
import { googleConfig, refreshAccessToken, type OAuthTokens } from "@/lib/oauth";

/**
 * Gmail provider via the Gmail REST API + OAuth2.
 *
 * Token lifecycle: we store the refresh token; access tokens are refreshed
 * lazily when the cached one is expired. The Account record is updated each
 * refresh so we don't keep doing it.
 */

async function getAccessToken(accountId: string): Promise<string> {
  const cfg = googleConfig();
  if (!cfg) throw new Error("Gmail OAuth not configured. Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.");
  const creds = getCredentials(accountId);
  if (!creds || creds.kind !== "gmail") throw new Error(`No Gmail credentials for ${accountId}`);

  if (creds.accessToken && creds.accessTokenExpiresAt && creds.accessTokenExpiresAt > Date.now()) {
    return creds.accessToken;
  }
  const refreshed: OAuthTokens = await refreshAccessToken(cfg, creds.refreshToken);
  updateCredentials(accountId, {
    kind: "gmail",
    refreshToken: refreshed.refreshToken ?? creds.refreshToken,
    accessToken: refreshed.accessToken,
    accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
  });
  return refreshed.accessToken;
}

async function api<T = unknown>(accountId: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken(accountId);
  const res = await fetch(`https://gmail.googleapis.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const FOLDER_TO_GMAIL: Record<Folder, string> = {
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFT",
  archive: "", // Gmail "archived" = no INBOX label; we use `-INBOX`
  trash: "TRASH",
  spam: "SPAM",
};

interface GmailListResp {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
}

interface GmailMsg {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayload;
}

interface GmailPayload {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string };
  parts?: GmailPayload[];
}

function getHeader(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBase64Url(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

function parseAddresses(header: string): EmailAddress[] {
  if (!header) return [];
  return header.split(/,(?![^<]*>)/).map((piece) => {
    const m = piece.trim().match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
    if (m) return { name: m[1].trim() || undefined, email: m[2].trim() };
    return { email: piece.trim() };
  }).filter((a) => a.email);
}

function extractBody(payload?: GmailPayload): { text: string; html?: string } {
  if (!payload) return { text: "" };
  let text = "";
  let html: string | undefined;
  function walk(p: GmailPayload) {
    if (p.mimeType === "text/plain" && p.body?.data) text += decodeBase64Url(p.body.data) + "\n";
    else if (p.mimeType === "text/html" && p.body?.data) html = (html ?? "") + decodeBase64Url(p.body.data);
    for (const child of p.parts ?? []) walk(child);
  }
  walk(payload);
  if (!text && html) text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
  return { text, html };
}

function gmailFolderFromLabels(labelIds: string[]): Folder {
  if (labelIds.includes("TRASH")) return "trash";
  if (labelIds.includes("SPAM")) return "spam";
  if (labelIds.includes("DRAFT")) return "drafts";
  if (labelIds.includes("SENT")) return "sent";
  if (labelIds.includes("INBOX")) return "inbox";
  return "archive";
}

const SYSTEM_LABELS = new Set([
  "INBOX","SENT","DRAFT","TRASH","SPAM","UNREAD","IMPORTANT","STARRED",
  "CATEGORY_PERSONAL","CATEGORY_SOCIAL","CATEGORY_PROMOTIONS","CATEGORY_UPDATES","CATEGORY_FORUMS",
]);

function userLabels(labelIds: string[]): string[] {
  return labelIds.filter((l) => !SYSTEM_LABELS.has(l));
}

function toEmailMessage(m: GmailMsg, accountId: string): EmailMessage {
  const headers = m.payload?.headers;
  const subject = getHeader(headers, "Subject") || "(no subject)";
  const from = parseAddresses(getHeader(headers, "From"))[0] ?? { email: "" };
  const to = parseAddresses(getHeader(headers, "To"));
  const cc = parseAddresses(getHeader(headers, "Cc"));
  const body = extractBody(m.payload);
  const receivedAt = m.internalDate
    ? new Date(Number(m.internalDate)).toISOString()
    : new Date().toISOString();
  const labelIds = m.labelIds ?? [];
  return {
    uid: makeUid("gmail", accountId, m.id),
    accountId,
    threadId: `gmail:${accountId}:${m.threadId}`,
    from,
    to,
    cc: cc.length ? cc : undefined,
    subject,
    snippet: (m.snippet ?? body.text).slice(0, 200),
    body,
    receivedAt,
    isRead: !labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
    folder: gmailFolderFromLabels(labelIds),
    labels: userLabels(labelIds),
    attachments: [], // Could enumerate from payload parts with filename + body.attachmentId
  };
}

export const gmailProvider: Provider = {
  id: "gmail",

  async listAccounts() {
    return listAccountRecords()
      .filter((r) => r.provider === "gmail")
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
    const labelId = FOLDER_TO_GMAIL[folder];
    const q = query ? `&q=${encodeURIComponent(query)}` : "";
    const labelParam = labelId ? `&labelIds=${labelId}` : `&q=${encodeURIComponent("-in:trash -in:spam")}`;
    const list = await api<GmailListResp>(accountId, `/gmail/v1/users/me/messages?maxResults=${limit}${labelParam}${q}`);
    const ids = list.messages ?? [];
    const detailed = await Promise.all(
      ids.map((m) =>
        api<GmailMsg>(accountId, `/gmail/v1/users/me/messages/${m.id}?format=full`),
      ),
    );
    return detailed.map((m) => toEmailMessage(m, accountId));
  },

  async getThread(threadId: string) {
    const [, accountId, remoteThreadId] = threadId.split(":");
    if (!accountId || !remoteThreadId) throw new Error(`Gmail thread id malformed: ${threadId}`);
    const thread = await api<{ id: string; messages: GmailMsg[] }>(
      accountId,
      `/gmail/v1/users/me/threads/${remoteThreadId}?format=full`,
    );
    const messages = (thread.messages ?? []).map((m) => toEmailMessage(m, accountId));
    const record = getAccountRecord(accountId);
    if (!record) throw new Error(`Unknown account ${accountId}`);
    const latest = messages[messages.length - 1];
    return {
      threadId,
      accountId,
      subject: (latest?.subject ?? "").replace(/^(?:re|fwd|fw):\s*/i, "").trim(),
      participants: [latest?.from ?? { email: record.email }, ...(latest?.to ?? [])].filter((a) => a.email),
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
    const raw = buildRawRfc822({
      from: { name: record.displayName, email: record.email },
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      body: draft.body,
    });
    const encoded = Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
    const res = await api<{ id: string; threadId: string }>(
      record.id,
      `/gmail/v1/users/me/messages/send`,
      { method: "POST", body: JSON.stringify({ raw: encoded }) },
    );
    return {
      uid: makeUid("gmail", record.id, res.id),
      accountId: record.id,
      threadId: `gmail:${record.id}:${res.threadId}`,
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
    const modify = (add: string[], remove: string[]) =>
      api(accountId, `/gmail/v1/users/me/messages/${remoteId}/modify`, {
        method: "POST",
        body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
      });
    switch (action.type) {
      case "archive": return void (await modify([], ["INBOX"]));
      case "delete": return void (await api(accountId, `/gmail/v1/users/me/messages/${remoteId}/trash`, { method: "POST" }));
      case "star": return void (await modify(action.value ? ["STARRED"] : [], action.value ? [] : ["STARRED"]));
      case "mark_read": return void (await modify(action.value ? [] : ["UNREAD"], action.value ? ["UNREAD"] : []));
      case "label": {
        const labelId = await ensureLabel(accountId, action.label);
        return void (await modify(action.value ? [labelId] : [], action.value ? [] : [labelId]));
      }
    }
  },
};

interface GmailLabel { id: string; name: string }
async function ensureLabel(accountId: string, name: string): Promise<string> {
  const list = await api<{ labels?: GmailLabel[] }>(accountId, `/gmail/v1/users/me/labels`);
  const found = list.labels?.find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const created = await api<GmailLabel>(accountId, `/gmail/v1/users/me/labels`, {
    method: "POST",
    body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  return created.id;
}

function buildRawRfc822(args: {
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: string;
}): string {
  const fmt = (a: EmailAddress) => (a.name ? `"${a.name.replace(/"/g, "")}" <${a.email}>` : a.email);
  const lines = [
    `From: ${fmt(args.from)}`,
    `To: ${args.to.map(fmt).join(", ")}`,
  ];
  if (args.cc?.length) lines.push(`Cc: ${args.cc.map(fmt).join(", ")}`);
  if (args.bcc?.length) lines.push(`Bcc: ${args.bcc.map(fmt).join(", ")}`);
  lines.push(`Subject: ${args.subject}`);
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("");
  lines.push(args.body);
  return lines.join("\r\n");
}
