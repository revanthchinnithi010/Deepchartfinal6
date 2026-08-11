import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { logger } from "../lib/logger.js";

const ALGO    = "aes-256-cbc";
const IS_PROD = process.env["NODE_ENV"] === "production";

// ─── Key resolution (once at module load) ────────────────────────────────────

const rawSecret: string | undefined =
  process.env["BROKER_ENCRYPTION_KEY"] ??
  process.env["ENCRYPTION_SECRET"] ??
  undefined;

if (!rawSecret) {
  if (IS_PROD) {
    logger.error(
      "BROKER_ENCRYPTION_KEY is not set. Broker credential storage is disabled in production. " +
      "Generate a key with: openssl rand -hex 32 — then add it to Replit Secrets.",
    );
  } else {
    logger.warn(
      "BROKER_ENCRYPTION_KEY is not set — using insecure dev key. " +
      "Set BROKER_ENCRYPTION_KEY in Replit Secrets before deploying.",
    );
  }
}

// ─── Named error class ───────────────────────────────────────────────────────

export class EncryptionKeyMissingError extends Error {
  override readonly name = "EncryptionKeyMissingError";
  constructor() {
    super(
      "BROKER_ENCRYPTION_KEY is not configured. " +
      "Generate a 32-byte hex key with: openssl rand -hex 32 — " +
      "then add it to Replit Secrets (Tools → Secrets).",
    );
  }
}

// ─── Public readiness helper ─────────────────────────────────────────────────

/**
 * Returns true when a real encryption key is available.
 * Check this in routes/middleware before touching encrypted credentials to
 * surface a clear 503 instead of a cryptic decrypt failure.
 */
export function isEncryptionReady(): boolean {
  return rawSecret !== undefined;
}

// ─── Key derivation (internal) ───────────────────────────────────────────────

function deriveCurrentKey(): Buffer {
  const src = rawSecret ?? "tj-dev-insecure-key-not-for-prod";
  return createHash("sha256").update(src).digest();
}

/**
 * Legacy derivation used before the SHA-256 migration.
 * Tries Buffer.from(slice(0,32)) only when the raw secret is long enough.
 * Returns null when it cannot produce a valid 32-byte key.
 */
function deriveLegacyKey(): Buffer | null {
  if (!rawSecret || rawSecret.length < 32) return null;
  try {
    const buf = Buffer.from(rawSecret.slice(0, 32), "utf8");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseHexParts(ciphertext: string): { iv: Buffer; enc: Buffer } | null {
  const colonIdx = ciphertext.indexOf(":");
  if (colonIdx === -1) return null;
  const ivHex  = ciphertext.slice(0, colonIdx);
  const encHex = ciphertext.slice(colonIdx + 1);
  if (!ivHex || !encHex || ivHex.length !== 32) return null;
  try {
    return { iv: Buffer.from(ivHex, "hex"), enc: Buffer.from(encHex, "hex") };
  } catch {
    return null;
  }
}

function tryDecrypt(key: Buffer, iv: Buffer, enc: Buffer): string | null {
  try {
    const decipher  = createDecipheriv(ALGO, key, iv);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string with AES-256-CBC.
 * Output format: "<iv-hex>:<ciphertext-hex>"
 *
 * Throws EncryptionKeyMissingError in production when BROKER_ENCRYPTION_KEY
 * is not set. In development it logs a warning and uses a static fallback key.
 */
export function encrypt(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new TypeError("encrypt: plaintext must be a string");
  }
  if (IS_PROD && !rawSecret) {
    throw new EncryptionKeyMissingError();
  }

  const key       = deriveCurrentKey();
  const iv        = randomBytes(16);
  const cipher    = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

/**
 * Decrypt a ciphertext produced by encrypt().
 *
 * Tries the current SHA-256 key derivation first. If that fails, attempts the
 * legacy slice-to-32 derivation used before the SHA-256 migration, so that
 * credentials stored with the old algorithm continue to work.
 *
 * Throws EncryptionKeyMissingError in production when BROKER_ENCRYPTION_KEY
 * is not set. Throws a descriptive Error when all decryption strategies fail.
 */
export function decrypt(ciphertext: string): string {
  if (typeof ciphertext !== "string" || !ciphertext.includes(":")) {
    throw new Error(
      "BrokerEncryption.decrypt: malformed ciphertext — expected \"<iv-hex>:<data-hex>\"",
    );
  }
  if (IS_PROD && !rawSecret) {
    throw new EncryptionKeyMissingError();
  }

  const parts = parseHexParts(ciphertext);
  if (!parts) {
    throw new Error(
      "BrokerEncryption.decrypt: invalid ciphertext format — " +
      "bad IV length or non-hex characters",
    );
  }

  const { iv, enc } = parts;

  const currentResult = tryDecrypt(deriveCurrentKey(), iv, enc);
  if (currentResult !== null) return currentResult;

  const legacyKey = deriveLegacyKey();
  if (legacyKey) {
    const legacyResult = tryDecrypt(legacyKey, iv, enc);
    if (legacyResult !== null) {
      logger.warn(
        "BrokerEncryption.decrypt: decrypted with LEGACY key derivation. " +
        "Reconnect this broker account to re-encrypt with the current algorithm.",
      );
      return legacyResult;
    }
  }

  throw new Error(
    "BrokerEncryption.decrypt: decryption failed with all key derivations. " +
    "Possible causes: wrong BROKER_ENCRYPTION_KEY, data encrypted on a different " +
    "server, or corrupted storage. Reconnect the broker account to fix this.",
  );
}
