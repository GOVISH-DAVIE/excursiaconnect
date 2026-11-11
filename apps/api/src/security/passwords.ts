/**
 * Staff passwords: argon2id with OWASP's minimum parameters (19 MiB, 2 passes), through @node-rs/argon2, which
 * ships prebuilt binaries. A sign-in for an email with no password still runs one verification against a dummy
 * hash, so the time taken never tells whether the account exists.
 */
import { hash, verify } from "@node-rs/argon2";

const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** What a password must be: 12 characters or more, and not absurdly long (argon2 hashes it all). */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export const hashPassword = (password: string) => hash(password, OPTIONS);

let dummy: Promise<string> | undefined;

/** Whether the password matches; with no stored hash, the same work is done and the answer is no. */
export async function checkPassword(stored: string | null | undefined, password: string): Promise<boolean> {
  if (!stored) {
    dummy ??= hashPassword("not-a-real-password-just-to-spend-the-time");
    await verify(await dummy, password).catch(() => false);
    return false;
  }
  return verify(stored, password).catch(() => false);
}
