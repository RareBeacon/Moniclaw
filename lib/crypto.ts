import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM encryption for secrets at rest (BYOK provider API keys).
 *
 * Key derivation: scrypt(AUTH_SECRET, fixed-domain salt). The plaintext key
 * never touches the database, logs, or API responses — only this module
 * decrypts, and only server-side call sites may import it.
 *
 * Format: "v1.<iv:b64>.<tag:b64>.<ciphertext:b64>" — versioned for rotation.
 */

const DOMAIN_SALT = "moniclaw:ai-secret-vault:v1";
const VERSION = "v1";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for secret encryption.");
  }
  return scryptSync(secret, DOMAIN_SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(encoded: string): string {
  const [version, ivB64, tagB64, ctB64] = encoded.split(".");
  if (version !== VERSION || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Unrecognized secret encoding.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Safe equality for hashes/tokens without leaking length via early exit. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Mask a secret for display: show the last 4 characters only. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return "••••";
  return `••••${plaintext.slice(-4)}`;
}
