/**
 * The cryptography sign-in needs, all from node:crypto (backend-plan.md, Security model):
 * - session tokens: 256 random bits, kept in the database only as a SHA-256 hash;
 * - one-time codes: 6 digits, kept as an HMAC under a key derived from AUTH_SECRET, so the database alone can't
 *   be searched for them (a million guesses against a plain hash would take a moment);
 * - TOTP secrets: AES-256-GCM under another derived key;
 * - comparisons in constant time.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export type Keys = { otp: Buffer; totp: Buffer; upload: Buffer };

/** Separate keys for separate jobs, from the one AUTH_SECRET. */
export function deriveKeys(authSecret: string): Keys {
  const ikm = Buffer.from(authSecret, "base64");
  const derive = (info: string) => Buffer.from(hkdfSync("sha256", ikm, Buffer.alloc(0), `excursia:${info}`, 32));
  return { otp: derive("otp-code"), totp: derive("totp-secret"), upload: derive("upload-url") };
}

/** A new session token for the cookie: 32 random bytes, base64url. */
export const newToken = () => randomBytes(32).toString("base64url");

/** What the database keeps of a token. Tokens are random, so a fast hash is enough. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A one-time code: six digits, uniformly random. */
export const newCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

/** What the database keeps of a one-time code, bound to where it was sent and why. */
export const hashCode = (key: Buffer, destination: string, purpose: string, code: string) =>
  createHmac("sha256", key).update(`${purpose}\n${destination}\n${code}`).digest("hex");

/** Two hex digests compared in constant time. */
export function sameDigest(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** AES-256-GCM: iv.tag.ciphertext, each base64url. */
export function encrypt(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(key: Buffer, sealed: string): string {
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

/** Ten recovery codes, each 10 characters from an alphabet without look-alikes, shown once at enrolment. */
export function newRecoveryCodes(n = 10): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: n }, () => {
    const s = Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** Recovery codes are random, so like tokens a fast hash is enough; spaces, case and the hyphen don't matter. */
export const hashRecoveryCode = (code: string) => hashToken(code.toLowerCase().replace(/[^a-z0-9]/g, ""));
