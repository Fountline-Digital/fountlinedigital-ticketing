import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Two-factor with an authenticator app (TOTP, RFC 6238): 6 digits, 30-second steps, SHA-1.
// Works with Google Authenticator, Microsoft Authenticator, 1Password, Authy, etc.

const STEP_SECONDS = 30;
const DIGITS = 6;
const ISSUER = "Fountline Digital";

// ---- secret encryption (AES-256-GCM) ---------------------------------------
function key() {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) throw new Error("MFA_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("MFA_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return buf;
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(stored: string) {
  const [iv, tag, ct] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// ---- base32 -----------------------------------------------------------------
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string) {
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("Invalid base32 secret");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ---- TOTP -------------------------------------------------------------------
export function generateSecret() {
  return base32Encode(randomBytes(20)); // 160-bit secret
}

export function otpauthUri(secret: string, accountEmail: string) {
  const label = encodeURIComponent(`${ISSUER}:${accountEmail}`);
  const params = new URLSearchParams({ secret, issuer: ISSUER, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function codeForStep(secret: Buffer, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const num = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return num.toString().padStart(DIGITS, "0");
}

export function stepOf(date: Date) {
  return Math.floor(date.getTime() / 1000 / STEP_SECONDS);
}

export function dateOfStep(step: number) {
  return new Date(step * STEP_SECONDS * 1000);
}

/**
 * Checks a 6-digit code, allowing one step of clock drift either way.
 * Returns the matched step, or null. Codes at or before `lastUsedStep` are rejected (no reuse).
 */
export function verifyTotp(secretBase32: string, code: string, lastUsedStep: number | null) {
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return null;
  const secret = base32Decode(secretBase32);
  const now = stepOf(new Date());
  for (const step of [now - 1, now, now + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(codeForStep(secret, step));
    if (timingSafeEqual(expected, Buffer.from(cleaned))) return step;
  }
  return null;
}

// ---- recovery codes ---------------------------------------------------------
export function hashRecoveryCode(code: string) {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

export function generateRecoveryCodes(count = 10) {
  const codes = Array.from({ length: count }, () => {
    const hex = randomBytes(5).toString("hex"); // 10 chars
    return `${hex.slice(0, 5)}-${hex.slice(5)}`;
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}
