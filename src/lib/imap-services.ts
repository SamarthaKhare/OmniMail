/**
 * The exhaustive list of IMAP services OmniMail supports.
 *
 * Per product scope: **Yahoo and AOL only.** Custom hosts are deliberately
 * not allowed — both the UI and the server-side API enforce this list.
 *
 * Settings verified against Yahoo Mail and AOL Mail public help docs:
 *   - Yahoo: https://help.yahoo.com/kb/imap-mail-yahoo-mobile-mail-app-sln4075.html
 *   - AOL:   https://help.aol.com/articles/aol-mail-for-other-mail-clients
 *
 * Both providers require an **app password** (not the account password) for
 * IMAP/SMTP access. The UI surfaces this so users don't get authentication
 * failures with their normal password.
 */

export type ImapServiceId = "yahoo" | "aol";

export interface ImapServiceConfig {
  id: ImapServiceId;
  label: string;
  emailDomains: string[]; // accepted email domains for sanity checks
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  /** IMAP uses direct TLS (port 993). SMTP secure mode is derived from port. */
  secure: boolean;
  appPasswordUrl: string;
  appPasswordHint: string;
}

export const IMAP_SERVICES: Record<ImapServiceId, ImapServiceConfig> = {
  yahoo: {
    id: "yahoo",
    label: "Yahoo Mail",
    emailDomains: ["yahoo.com", "ymail.com", "rocketmail.com"],
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 465,
    secure: true,
    appPasswordUrl: "https://login.yahoo.com/account/security",
    appPasswordHint:
      "Yahoo no longer accepts your normal password for IMAP. Generate an app password at Account Security → Generate app password.",
  },
  aol: {
    id: "aol",
    label: "AOL Mail",
    emailDomains: ["aol.com", "aim.com"],
    imapHost: "imap.aol.com",
    imapPort: 993,
    smtpHost: "smtp.aol.com",
    smtpPort: 465,
    secure: true,
    appPasswordUrl: "https://login.aol.com/account/security",
    appPasswordHint:
      "AOL requires an app password for third-party mail apps. Generate one at Account Security → Generate app password.",
  },
};

export function isSupportedImapService(s: string): s is ImapServiceId {
  return s === "yahoo" || s === "aol";
}

export function listImapServices(): ImapServiceConfig[] {
  return [IMAP_SERVICES.yahoo, IMAP_SERVICES.aol];
}
