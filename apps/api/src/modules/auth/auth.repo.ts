/**
 * Sign-in's queries. Every check that two requests could race on is a single conditional statement, so the
 * database decides who wins: a code is consumed once, a TOTP step is used once, a recovery code is spent once,
 * and a rate-limit window counts every attempt.
 */
import type { Db } from "@excursia/db";

export type UserRow = { id: string; kind: "admin" | "staff" | "participant"; email: string | null; name: string; passwordHash: string | null; disabledAt: Date | null };
export type SessionRow = { id: string; userId: string; expiresAt: Date; lastSeenAt: Date; stepUpAt: Date | null; revokedAt: Date | null; user: UserRow };
export type OtpRow = { id: string; codeHash: string; attempts: number; expiresAt: Date };
export type TotpRow = { secretEncrypted: string; confirmedAt: Date | null; lastUsedStep: bigint | null; recoveryCodeHashes: string[] };
export type NewSession = { tokenHash: string; userId: string; createdAt: Date; lastSeenAt: Date; expiresAt: Date; stepUpAt: Date | null; ip: string | null; userAgent: string | null };

const userSelect = { id: true, kind: true, email: true, name: true, passwordHash: true, disabledAt: true } as const;

export function createAuthRepo(db: Db) {
  return {
    /** Counts one attempt in a fixed window and returns the count so far, all in one statement. */
    async hit(key: string, windowStart: Date): Promise<number> {
      const [row] = await db.$queryRaw<{ count: number }[]>`
        INSERT INTO rate_limit (key, window_start, count) VALUES (${key}, ${windowStart}, 1)
        ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit.count + 1
        RETURNING count`;
      return row.count;
    },

    /** A new code; any earlier unused code for the same address and purpose stops working. */
    issueOtp(destination: string, purpose: "sign_in" | "set_password", codeHash: string, now: Date, expiresAt: Date) {
      return db.$transaction([
        db.otpCode.updateMany({ where: { destination, purpose, consumedAt: null }, data: { consumedAt: now } }),
        db.otpCode.create({ data: { destination, purpose, codeHash, expiresAt } }),
      ]);
    },

    liveOtp: (destination: string, purpose: "sign_in" | "set_password", now: Date): Promise<OtpRow | null> =>
      db.otpCode.findFirst({
        where: { destination, purpose, consumedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
        select: { id: true, codeHash: true, attempts: true, expiresAt: true },
      }),

    /** One more wrong guess; returns the attempts so far. */
    async failOtp(id: string): Promise<number> {
      const row = await db.otpCode.update({ where: { id }, data: { attempts: { increment: 1 } }, select: { attempts: true } });
      return row.attempts;
    },

    /** Spends the code. False if another request spent it first. */
    async consumeOtp(id: string, now: Date): Promise<boolean> {
      const { count } = await db.otpCode.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: now } });
      return count === 1;
    },

    userByEmail: (email: string): Promise<UserRow | null> => db.user.findUnique({ where: { email }, select: userSelect }),

    /** The applicant's account, made at their first sign-in. */
    participantFor: (email: string): Promise<UserRow> =>
      db.user.upsert({ where: { email }, create: { kind: "participant", email, name: email.split("@")[0] }, update: {}, select: userSelect }),

    /** A new password ends every session the person had. */
    setPassword: (userId: string, passwordHash: string, now: Date) =>
      db.$transaction([
        db.user.update({ where: { id: userId }, data: { passwordHash } }),
        db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
      ]),

    createSession: (s: NewSession) => db.session.create({ data: s, select: { id: true, expiresAt: true } }),

    sessionByTokenHash: (tokenHash: string): Promise<SessionRow | null> =>
      db.session.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, lastSeenAt: true, stepUpAt: true, revokedAt: true, user: { select: userSelect } },
      }),

    touchSession: (id: string, at: Date) => db.session.updateMany({ where: { id, revokedAt: null }, data: { lastSeenAt: at } }),

    revokeSession: (id: string, at: Date) => db.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at } }),

    /** Ends the old session and starts its successor in one step: a token is never valid on both sides of a step-up. */
    async rotateSession(oldId: string, next: NewSession, at: Date) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.session.updateMany({ where: { id: oldId, revokedAt: null }, data: { revokedAt: at } });
        if (count !== 1) return null;
        return tx.session.create({ data: next, select: { id: true, expiresAt: true } });
      });
    },

    totpOf: (userId: string): Promise<TotpRow | null> =>
      db.totpSecret.findUnique({ where: { userId }, select: { secretEncrypted: true, confirmedAt: true, lastUsedStep: true, recoveryCodeHashes: true } }),

    /** A new, unconfirmed secret; refused (false) if one is already confirmed. */
    async startTotp(userId: string, secretEncrypted: string): Promise<boolean> {
      return db.$transaction(async (tx) => {
        const existing = await tx.totpSecret.findUnique({ where: { userId }, select: { confirmedAt: true } });
        if (existing?.confirmedAt) return false;
        await tx.totpSecret.upsert({
          where: { userId },
          create: { userId, secretEncrypted, recoveryCodeHashes: [] },
          update: { secretEncrypted, lastUsedStep: null, recoveryCodeHashes: [] },
        });
        return true;
      });
    },

    async confirmTotp(userId: string, step: number, recoveryCodeHashes: string[], at: Date): Promise<boolean> {
      const { count } = await db.totpSecret.updateMany({
        where: { userId, confirmedAt: null },
        data: { confirmedAt: at, lastUsedStep: BigInt(step), recoveryCodeHashes },
      });
      return count === 1;
    },

    /** Records the step a code was used in, only if it is newer than the last: the same code never works twice. */
    async useTotpStep(userId: string, step: number): Promise<boolean> {
      const n = await db.$executeRaw`UPDATE totp_secret SET last_used_step = ${BigInt(step)}
        WHERE user_id = ${userId} AND confirmed_at IS NOT NULL AND (last_used_step IS NULL OR last_used_step < ${BigInt(step)})`;
      return n === 1;
    },

    /** Spends one recovery code; false if it isn't one of theirs or was spent already. */
    async useRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
      const n = await db.$executeRaw`UPDATE totp_secret SET recovery_code_hashes = array_remove(recovery_code_hashes, ${codeHash})
        WHERE user_id = ${userId} AND confirmed_at IS NOT NULL AND ${codeHash} = ANY(recovery_code_hashes)`;
      return n === 1;
    },

    memberships: (userId: string) =>
      db.membership.findMany({
        where: { userId, revokedAt: null },
        select: { role: true, eventId: true, organiserId: true, canDecide: true },
        orderBy: { createdAt: "asc" },
      }),
  };
}
export type AuthRepo = ReturnType<typeof createAuthRepo>;
