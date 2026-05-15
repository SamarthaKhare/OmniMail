import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { ProviderId, VoiceProfile } from "@/types/protocol";
import { sealObject, openObject, type SealedBlob } from "./crypto";

/**
 * Encrypted at-rest store of connected accounts.
 *
 * File: `.omnimail/accounts.json` (gitignored). Each account record's
 * credentials are sealed with AES-GCM; non-secret fields (email, displayName,
 * color, providerId) are stored in clear so the inbox can list accounts
 * without decrypting every record on boot.
 */

const STATE_DIR = path.resolve(process.cwd(), ".omnimail");
const ACCOUNTS_PATH = path.join(STATE_DIR, "accounts.json");

export type Credentials =
  | { kind: "imap"; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; user: string; pass: string; secure: boolean }
  | { kind: "gmail"; refreshToken: string; accessToken?: string; accessTokenExpiresAt?: number }
  | { kind: "outlook"; refreshToken: string; accessToken?: string; accessTokenExpiresAt?: number };

export interface AccountRecord {
  id: string;
  provider: ProviderId;
  email: string;
  displayName: string;
  color: string;
  signature?: string;
  voiceProfile?: VoiceProfile;
  /** Encrypted credentials blob — never returned to the client. */
  sealed: SealedBlob;
  createdAt: string;
}

interface StoreShape {
  v: 1;
  accounts: AccountRecord[];
}

function readRaw(): StoreShape {
  if (!fs.existsSync(ACCOUNTS_PATH)) return { v: 1, accounts: [] };
  try {
    const data = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, "utf8")) as StoreShape;
    if (data.v !== 1 || !Array.isArray(data.accounts)) return { v: 1, accounts: [] };
    return data;
  } catch {
    return { v: 1, accounts: [] };
  }
}

function writeRaw(s: StoreShape) {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(s, null, 2), { mode: 0o600 });
}

export function listAccountRecords(): AccountRecord[] {
  return readRaw().accounts;
}

export function getAccountRecord(id: string): AccountRecord | null {
  return readRaw().accounts.find((a) => a.id === id) ?? null;
}

export function getCredentials(id: string): Credentials | null {
  const r = getAccountRecord(id);
  if (!r) return null;
  return openObject<Credentials>(r.sealed);
}

export function upsertAccount(args: {
  id?: string;
  provider: ProviderId;
  email: string;
  displayName?: string;
  color?: string;
  voiceProfile?: VoiceProfile;
  signature?: string;
  credentials: Credentials;
}): AccountRecord {
  const id = args.id ?? `${args.provider}_${slugify(args.email)}_${Date.now().toString(36)}`;
  const store = readRaw();
  const existing = store.accounts.find((a) => a.id === id || a.email === args.email);
  const record: AccountRecord = {
    id: existing?.id ?? id,
    provider: args.provider,
    email: args.email,
    displayName: args.displayName ?? existing?.displayName ?? args.email.split("@")[0],
    color: args.color ?? existing?.color ?? hashedColor(args.email),
    signature: args.signature ?? existing?.signature,
    voiceProfile: args.voiceProfile ?? existing?.voiceProfile,
    sealed: sealObject(args.credentials),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  if (existing) {
    store.accounts = store.accounts.map((a) => (a.id === existing.id ? record : a));
  } else {
    store.accounts.push(record);
  }
  writeRaw(store);
  return record;
}

export function removeAccount(id: string): boolean {
  const store = readRaw();
  const before = store.accounts.length;
  store.accounts = store.accounts.filter((a) => a.id !== id);
  if (store.accounts.length === before) return false;
  writeRaw(store);
  return true;
}

export function updateCredentials(id: string, credentials: Credentials) {
  const store = readRaw();
  const idx = store.accounts.findIndex((a) => a.id === id);
  if (idx < 0) throw new Error(`Account ${id} not found`);
  store.accounts[idx] = { ...store.accounts[idx], sealed: sealObject(credentials) };
  writeRaw(store);
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function hashedColor(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return hslToHex(hue, 65, 55);
}
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = (() => {
    if (h < 60) return [c, x, 0];
    if (h < 120) return [x, c, 0];
    if (h < 180) return [0, c, x];
    if (h < 240) return [0, x, c];
    if (h < 300) return [x, 0, c];
    return [c, 0, x];
  })();
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
