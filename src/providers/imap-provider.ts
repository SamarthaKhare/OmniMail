import "server-only";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser, type ParsedMail } from "mailparser";
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
import { getCredentials, listAccountRecords } from "@/lib/accounts-store";

/**
 * Real IMAP provider — works with Yahoo, AOL, iCloud, Fastmail, self-hosted,
 * and Gmail/Outlook when using an app password.
 *
 * Connection model: each call opens a short-lived client. Real production
 * would pool connections + IDLE for push; for the assignment a fresh open/
 * close per call is correct and simple.
 *
 * Folder mapping: we look at the IMAP `\Inbox`, `\Sent`, `\Drafts`, `\Trash`,
 * `\Junk` flags exposed by `client.list({ statusQuery: { ... }})`, then fall
 * back to common english folder names if the server doesn't tag them.
 */

interface ImapCreds {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  user: string;
  pass: string;
  secure: boolean;
}

function getCreds(accountId: string): ImapCreds {
  const creds = getCredentials(accountId);
  if (!creds || creds.kind !== "imap") {
    throw new Error(`No IMAP credentials for account ${accountId}`);
  }
  return creds;
}

async function withClient<T>(accountId: string, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const c = getCreds(accountId);
  const client = new ImapFlow({
    host: c.imapHost,
    port: c.imapPort,
    secure: c.secure,
    auth: { user: c.user, pass: c.pass },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try { await client.logout(); } catch { /* swallow */ }
  }
}

async function resolveFolder(client: ImapFlow, target: Folder): Promise<string> {
  const list = await client.list({ statusQuery: { messages: true } });
  const byFlag: Record<Folder, string | undefined> = {
    inbox: list.find((m) => m.specialUse === "\\Inbox")?.path ?? list.find((m) => /^INBOX$/i.test(m.path))?.path,
    sent: list.find((m) => m.specialUse === "\\Sent")?.path,
    drafts: list.find((m) => m.specialUse === "\\Drafts")?.path,
    archive: list.find((m) => m.specialUse === "\\Archive")?.path,
    trash: list.find((m) => m.specialUse === "\\Trash")?.path,
    spam: list.find((m) => m.specialUse === "\\Junk")?.path,
  };
  let path = byFlag[target];
  if (!path) {
    const map: Record<Folder, RegExp> = {
      inbox: /^inbox$/i,
      sent: /^sent( mail| items)?$/i,
      drafts: /^drafts?$/i,
      archive: /^archive|all mail$/i,
      trash: /^trash|deleted( items| messages)?$/i,
      spam: /^(spam|junk)$/i,
    };
    path = list.find((m) => map[target].test(m.path))?.path;
  }
  if (!path) throw new Error(`IMAP folder for ${target} not found`);
  return path;
}

function mapAddress(a?: { name?: string; address?: string }): EmailAddress {
  return { name: a?.name || undefined, email: a?.address ?? "" };
}
function mapAddresses(arr?: { name?: string; address?: string }[]): EmailAddress[] {
  return (arr ?? []).map(mapAddress).filter((a) => a.email);
}

function buildThreadId(parsed: ParsedMail, accountId: string): string {
  // Threading by Message-ID references — fall back to subject when missing.
  const refs = (parsed.references as string[] | string | undefined) ?? [];
  const refList = Array.isArray(refs) ? refs : [refs];
  if (refList.length > 0 && refList[0]) return `${accountId}:thr:${normalizeMsgId(refList[0])}`;
  if (parsed.inReplyTo) return `${accountId}:thr:${normalizeMsgId(parsed.inReplyTo)}`;
  if (parsed.messageId) return `${accountId}:thr:${normalizeMsgId(parsed.messageId)}`;
  const subj = (parsed.subject ?? "").replace(/^(?:re|fwd|fw):\s*/i, "").trim().toLowerCase();
  return `${accountId}:thr:subject:${subj || "unknown"}`;
}
function normalizeMsgId(id: string): string {
  return id.replace(/[<>]/g, "").trim();
}

function parsedToEmailMessage(
  parsed: ParsedMail,
  remoteUid: string,
  accountRecord: { id: string; email: string },
  folder: Folder,
  flags: string[],
): EmailMessage {
  const fromObj = Array.isArray(parsed.from?.value) ? parsed.from?.value[0] : undefined;
  const from: EmailAddress = mapAddress(fromObj);
  const to = mapAddresses(parsed.to && (Array.isArray(parsed.to) ? parsed.to[0].value : parsed.to.value));
  const cc = mapAddresses(parsed.cc && (Array.isArray(parsed.cc) ? parsed.cc[0].value : parsed.cc.value));
  const text = parsed.text ?? "";
  const html = typeof parsed.html === "string" ? parsed.html : undefined;
  const snippet = (text || stripHtml(html ?? "")).slice(0, 200).replace(/\s+/g, " ").trim();

  return {
    uid: makeUid("imap", accountRecord.id, remoteUid),
    accountId: accountRecord.id,
    threadId: buildThreadId(parsed, accountRecord.id),
    from,
    to,
    cc: cc.length ? cc : undefined,
    subject: parsed.subject ?? "(no subject)",
    snippet,
    body: { text, html },
    receivedAt: (parsed.date ?? new Date()).toISOString(),
    isRead: flags.includes("\\Seen"),
    isStarred: flags.includes("\\Flagged"),
    folder,
    labels: extractLabels(flags),
    attachments: (parsed.attachments ?? []).map((a, i) => ({
      id: a.cid ?? `att${i}`,
      filename: a.filename ?? `attachment-${i}`,
      mimeType: a.contentType ?? "application/octet-stream",
      size: a.size ?? 0,
    })),
  };
}

function extractLabels(flags: string[]): string[] {
  // IMAP keywords (non-system flags) become labels in our model.
  return flags.filter((f) => !f.startsWith("\\"));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
}

export const imapProvider: Provider = {
  id: "imap",

  async listAccounts() {
    return listAccountRecords()
      .filter((r) => r.provider === "imap")
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
    const { folder = "inbox", limit = 50, query } = opts;
    const record = listAccountRecords().find((r) => r.id === accountId);
    if (!record) throw new Error(`Account ${accountId} not found`);

    return withClient(accountId, async (client) => {
      const path = await resolveFolder(client, folder);
      const lock = await client.getMailboxLock(path);
      try {
        const search = query
          ? await client.search({ or: [{ subject: query }, { body: query }] }, { uid: true })
          : null;
        const uids: number[] = search && Array.isArray(search) ? search : [];
        // If no query: fetch newest `limit` by sequence.
        const status = await client.status(path, { messages: true });
        const total = status.messages ?? 0;
        const fetchRange = query
          ? uids.slice(-limit).map(String).join(",") || "1:0"
          : total > 0
            ? `${Math.max(1, total - limit + 1)}:${total}`
            : "1:0";

        const out: EmailMessage[] = [];
        for await (const msg of client.fetch(fetchRange, { source: true, uid: true, flags: true, envelope: true })) {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const flags = Array.from(msg.flags ?? []);
          out.push(parsedToEmailMessage(parsed, String(msg.uid), { id: record.id, email: record.email }, folder, flags));
        }
        return out.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
      } finally {
        lock.release();
      }
    });
  },

  async getThread(threadId: string) {
    // We're "stitching" threads ourselves via Message-ID — scan recent inbox
    // and sent for matches. For perf this would be cached; for the assignment
    // a fresh scan over the last 200 messages is fine.
    const accounts = await imapProvider.listAccounts();
    for (const a of accounts) {
      const recent = await imapProvider.listMessages(a.id, { folder: "inbox", limit: 200 });
      const sent = await imapProvider.listMessages(a.id, { folder: "sent", limit: 200 });
      const all = [...recent, ...sent];
      const hits = all.filter((m) => m.threadId === threadId).sort((x, y) => x.receivedAt.localeCompare(y.receivedAt));
      if (hits.length > 0) {
        const latest = hits[hits.length - 1];
        const participants = uniqByEmail([...hits.flatMap((m) => [m.from, ...m.to])]);
        return {
          threadId,
          accountId: a.id,
          subject: latest.subject.replace(/^(?:re|fwd|fw):\s*/i, "").trim(),
          participants,
          messages: hits,
          lastMessageAt: latest.receivedAt,
          unreadCount: hits.filter((m) => !m.isRead).length,
          saliency: 0,
          category: "other",
          hasAttachments: hits.some((m) => m.attachments.length > 0),
        } satisfies Thread;
      }
    }
    throw new Error(`Thread not found: ${threadId}`);
  },

  async sendMessage(draft: OutboundDraft) {
    const record = listAccountRecords().find((r) => r.id === draft.fromAccountId);
    if (!record) throw new Error(`Account ${draft.fromAccountId} not found`);
    const c = getCreds(draft.fromAccountId);
    // SMTP encryption mode is port-driven: 465 = direct TLS, everything else
    // (587, 25) uses STARTTLS. The form's `secure` flag only governs IMAP.
    const transporter = nodemailer.createTransport({
      host: c.smtpHost,
      port: c.smtpPort,
      secure: c.smtpPort === 465,
      requireTLS: c.smtpPort !== 465,
      auth: { user: c.user, pass: c.pass },
    });
    const info = await transporter.sendMail({
      from: { name: record.displayName, address: record.email },
      to: draft.to.map((t) => ({ name: t.name ?? "", address: t.email })),
      cc: draft.cc?.map((t) => ({ name: t.name ?? "", address: t.email })),
      bcc: draft.bcc?.map((t) => ({ name: t.name ?? "", address: t.email })),
      subject: draft.subject,
      text: draft.body,
      inReplyTo: draft.inReplyToUid ? parseUid(draft.inReplyToUid).remoteId : undefined,
    });

    // Most providers (Yahoo, AOL, iCloud, Gmail-via-IMAP) save outgoing mail to
    // Sent server-side. For servers that don't, the user can BCC themselves
    // or enable Sent-saving in their server settings — we don't try to APPEND
    // here because nodemailer doesn't expose the raw rfc822 bytes cleanly.

    return {
      uid: makeUid("imap", record.id, info.messageId ?? `sent_${Date.now()}`),
      accountId: record.id,
      threadId: draft.inReplyToUid ? parseUid(draft.inReplyToUid).remoteId : `sent_${Date.now()}`,
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
    await withClient(accountId, async (client) => {
      const inboxPath = await resolveFolder(client, "inbox");
      const lock = await client.getMailboxLock(inboxPath);
      try {
        switch (action.type) {
          case "archive": {
            const archive = await resolveFolder(client, "archive").catch(() => null);
            if (archive) await client.messageMove(remoteId, archive, { uid: true });
            else await client.messageFlagsAdd(remoteId, ["\\Deleted"], { uid: true });
            break;
          }
          case "delete": {
            const trash = await resolveFolder(client, "trash").catch(() => null);
            if (trash) await client.messageMove(remoteId, trash, { uid: true });
            else await client.messageFlagsAdd(remoteId, ["\\Deleted"], { uid: true });
            break;
          }
          case "star":
            if (action.value) await client.messageFlagsAdd(remoteId, ["\\Flagged"], { uid: true });
            else await client.messageFlagsRemove(remoteId, ["\\Flagged"], { uid: true });
            break;
          case "mark_read":
            if (action.value) await client.messageFlagsAdd(remoteId, ["\\Seen"], { uid: true });
            else await client.messageFlagsRemove(remoteId, ["\\Seen"], { uid: true });
            break;
          case "label":
            // IMAP keywords (non-system flags). Some servers reject arbitrary keywords —
            // imapflow surfaces that as a thrown error which we re-throw to the caller.
            if (action.value) await client.messageFlagsAdd(remoteId, [action.label], { uid: true });
            else await client.messageFlagsRemove(remoteId, [action.label], { uid: true });
            break;
        }
      } finally {
        lock.release();
      }
    });
  },
};

/** Test an IMAP/SMTP credential set without saving it. */
export async function verifyImapCredentials(c: ImapCreds): Promise<void> {
  const client = new ImapFlow({
    host: c.imapHost,
    port: c.imapPort,
    secure: c.secure,
    auth: { user: c.user, pass: c.pass },
    logger: false,
  });
  await client.connect();
  try {
    await client.list();
  } finally {
    try { await client.logout(); } catch { /* swallow */ }
  }
  const transporter = nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort,
    secure: c.smtpPort === 465,
    requireTLS: c.smtpPort !== 465,
    auth: { user: c.user, pass: c.pass },
  });
  await transporter.verify();
}

function uniqByEmail(arr: EmailAddress[]): EmailAddress[] {
  const seen = new Map<string, EmailAddress>();
  for (const a of arr) if (!seen.has(a.email)) seen.set(a.email, a);
  return Array.from(seen.values());
}
