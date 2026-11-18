/**
 * Time-based one-time passwords (RFC 6238, the codes authenticator apps show): HMAC-SHA1, 30-second steps,
 * 6 digits, one step of clock drift either way. The caller stores the step a code was used in, so the same code
 * can't be used twice (backend-plan.md, Security model: "reuse blocked").
 */
import { createHmac, randomBytes } from "node:crypto";

const STEP_SECONDS = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new secret: 160 bits, as RFC 4226 recommends, in base32 as apps expect. */
export const newTotpSecret = () => base32Encode(randomBytes(20));

export const stepAt = (at: Date) => Math.floor(at.getTime() / 1000 / STEP_SECONDS);

/** The code for one time step. */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return n.toString().padStart(DIGITS, "0");
}

/**
 * The step a code belongs to, if it is valid now, one step early or one step late, and newer than the last step
 * used; otherwise null.
 */
export function matchTotp(secret: string, code: string, at: Date, lastUsedStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = stepAt(at);
  for (const step of [now - 1, now, now + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    if (totpCode(secret, step) === code) return step;
  }
  return null;
}

/** What an authenticator app scans: otpauth://totp/Issuer:account?secret=…&issuer=… */
export function otpauthUri(secret: string, account: string, issuer = "ExcursiaConnect"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}
