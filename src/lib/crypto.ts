import "server-only";
import crypto from "node:crypto";

/**
 * Tiny AES-GCM helper for at-rest credential encryption.
 *
 * Key derivation:
 *   - If `OMNIMAIL_SECRET` is set, we derive a 32-byte key from it via scrypt.
 *   - Otherwise, we generate a random key on first boot and write it to
 *     `.omnimail/key` (gitignored). This is fine for local dev — production
 *     should set `OMNIMAIL_SECRET` to a secret pulled from a real KMS.
 *
 * NOT production grade — there is no per-record IV reuse protection beyond a
 * fresh random IV, no key rotation, no HMAC outside of GCM's tag. It's a
 * local-disk encryption layer, not a vault.
 */

import fs from "node:fs";
import path from "node:path";

// See accounts-store.ts for why /tmp on Vercel.
const STATE_DIR = process.env.VERCEL
  ? path.resolve("/tmp", ".omnimail")
  : path.resolve(process.cwd(), ".omnimail");
const KEY_PATH = path.join(STATE_DIR, "key");

let _key: Buffer | null = null;

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  }
}

function deriveKey(secret: string): Buffer {
  // Deterministic — same secret → same key. 16-byte fixed salt is fine for
  // local-dev; in prod you'd derive per-account or rotate.
  return crypto.scryptSync(secret, "omnimail-v1-salt", 32);
}

function loadOrCreateLocalKey(): Buffer {
  ensureDir();
  if (fs.existsSync(KEY_PATH)) {
    const hex = fs.readFileSync(KEY_PATH, "utf8").trim();
    return Buffer.from(hex, "hex");
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, key.toString("hex"), { mode: 0o600 });
  return key;
}

function getKey(): Buffer {
  if (_key) return _key;
  _key = process.env.OMNIMAIL_SECRET
    ? deriveKey(process.env.OMNIMAIL_SECRET)
    : loadOrCreateLocalKey();
  return _key;
}

export interface SealedBlob {
  v: 1;
  iv: string; // base64
  ct: string; // base64 (ciphertext + tag)
}

export function seal(plaintext: string): SealedBlob {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("base64"),
    ct: Buffer.concat([enc, tag]).toString("base64"),
  };
}

export function open(blob: SealedBlob): string {
  if (blob.v !== 1) throw new Error("Unsupported sealed-blob version");
  const iv = Buffer.from(blob.iv, "base64");
  const both = Buffer.from(blob.ct, "base64");
  const ct = both.subarray(0, both.length - 16);
  const tag = both.subarray(both.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function sealObject<T>(obj: T): SealedBlob {
  return seal(JSON.stringify(obj));
}
export function openObject<T>(blob: SealedBlob): T {
  return JSON.parse(open(blob)) as T;
}
