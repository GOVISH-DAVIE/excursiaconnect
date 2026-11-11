/**
 * Sign-in and sessions (backend-plan.md, Security model; M0.4).
 *
 * - Applicants: a 6-digit code by email. Ten minutes, one use, five wrong guesses and it is dead; asking again
 *   kills the previous code. The first sign-in makes their account.
 * - Staff: a password (argon2id), then a code from their authenticator. A session is "pending" between the two and
 *   can do nothing but finish. A password is set, or reset, with a code sent to the staff email.
 * - Sessions: a 256-bit token in an HttpOnly cookie, kept as a hash. Staff: 30 minutes idle, 12 hours at most.
 *   Applicants: 7 days idle, 30 days at most. A new token at every step-up; a new password ends every session.
 * - Nothing says whether an account exists: asking for a code always answers the same, and a wrong email or a wrong
 *   password are one refusal, taking the same time.
 * - Attempts are counted in PostgreSQL, per address and per network address, in fixed windows.
 */
import type { SessionView, SignInNext } from "@excursia/contracts/auth";
import { HttpError } from "../../http/errors";
import type { Mailer } from "../../mail/mailer";
import { checkPassword, hashPassword } from "../../security/passwords";
import { decrypt, encrypt, hashCode, hashRecoveryCode, hashToken, newCode, newRecoveryCodes, newToken, sameDigest, type Keys } from "../../security/secrets";
import { matchTotp, newTotpSecret, otpauthUri } from "../../security/totp";
import type { AuthRepo, SessionRow, UserRow } from "./auth.repo";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** How long a session lasts, by who holds it (backend-plan.md, Security model). */
export const POLICY = {
  staff: { idleMs: 30 * MIN, absoluteMs: 12 * HOUR },
  participant: { idleMs: 7 * DAY, absoluteMs: 30 * DAY },
  /** between a right password and the authenticator code */
  pending: { idleMs: 10 * MIN, absoluteMs: 10 * MIN },
} as const;

const CODE_TTL = { sign_in: 10 * MIN, set_password: 30 * MIN } as const;

/** D14: staff may put off setting up the authenticator for this long after their first sign-in. */
export const MFA_GRACE_MS = 7 * DAY;
const CODE_ATTEMPTS = 5;

/** Attempts allowed per window. nginx limits per address too; these are the real ones (deploy.md). */
const LIMITS = {
  codeRequestPerEmail: { max: 3, windowMs: 15 * MIN },
  codeRequestPerIp: { max: 20, windowMs: 15 * MIN },
  codeVerifyPerEmail: { max: 10, windowMs: 15 * MIN },
  /** one machine guessing codes across many addresses */
  codeVerifyPerIp: { max: 30, windowMs: 15 * MIN },
  passwordPerEmail: { max: 5, windowMs: 15 * MIN },
  passwordPerIp: { max: 30, windowMs: 15 * MIN },
  totpPerUser: { max: 5, windowMs: 5 * MIN },
} as const;

export type ClientMeta = { ip: string | null; userAgent: string | null };
export type Resolved = { session: SessionRow; user: UserRow; pending: boolean };
/** A new session for the controller to put in the cookie. The token never leaves through a body. */
export type Issued = { token: string; expiresAt: Date; staff: boolean };

const isStaff = (u: Pick<UserRow, "kind">) => u.kind === "staff" || u.kind === "admin";

export type AuthDeps = { repo: AuthRepo; mailer: Mailer; keys: Keys; now?: () => Date };

export function createAuthService({ repo, mailer, keys, now = () => new Date() }: AuthDeps) {
  /** Counts the attempt and refuses once the window's allowance is spent. Keys hold a hash, not the address. */
  async function limit(scope: string, value: string, rule: { max: number; windowMs: number }) {
    const at = now().getTime();
    const windowStart = new Date(at - (at % rule.windowMs));
    const count = await repo.hit(`${scope}:${hashToken(value).slice(0, 32)}`, windowStart);
    if (count > rule.max) {
      const minutes = Math.ceil((windowStart.getTime() + rule.windowMs - at) / MIN);
      throw new HttpError("rate_limited", `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }
  }

  /**
   * Before anything that depends on the account: where email can't go out yet, every address gets the same 503,
   * so "can't send" never tells a staff address from an unknown one.
   */
  function mailOrRefuse() {
    if (!mailer.available) throw new HttpError("unavailable", "Sign-in codes can't be sent from this server yet. Try again later.");
  }

  async function sendCode(email: string, purpose: "sign_in" | "set_password") {
    const code = newCode();
    const at = now();
    await repo.issueOtp(email, purpose, hashCode(keys.otp, email, purpose, code), at, new Date(at.getTime() + CODE_TTL[purpose]));
    const minutes = CODE_TTL[purpose] / MIN;
    const subject = purpose === "sign_in" ? "Your ExcursiaConnect sign-in code" : "Set your ExcursiaConnect password";
    await mailer.send({
      to: email,
      subject,
      text: `Your code is ${code}. It works once, for ${minutes} minutes.\n\nIf you didn't ask for it, you can ignore this email: nothing changes until the code is used.`,
    });
  }

  /** Checks a code and spends it. Every failure reads the same apart from how many tries are left. */
  async function spendCode(email: string, purpose: "sign_in" | "set_password", code: string) {
    const otp = await repo.liveOtp(email, purpose, now());
    const expired = new HttpError("unauthenticated", "That code has expired or was already used. Ask for a new one.");
    if (!otp || otp.attempts >= CODE_ATTEMPTS) throw expired;
    if (!sameDigest(otp.codeHash, hashCode(keys.otp, email, purpose, code))) {
      const attempts = await repo.failOtp(otp.id);
      const left = CODE_ATTEMPTS - attempts;
      throw left > 0 ? new HttpError("unauthenticated", `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`) : expired;
    }
    if (!(await repo.consumeOtp(otp.id, now()))) throw expired;
  }

  async function issue(user: UserRow, meta: ClientMeta, kind: keyof typeof POLICY, stepUp: boolean, replacing?: string, mfaSkipped = false): Promise<Issued> {
    const token = newToken();
    const at = now();
    const next = {
      tokenHash: hashToken(token),
      userId: user.id,
      createdAt: at,
      lastSeenAt: at,
      expiresAt: new Date(at.getTime() + POLICY[kind].absoluteMs),
      stepUpAt: stepUp ? at : null,
      mfaSkipped,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    };
    const created = replacing ? await repo.rotateSession(replacing, next, at) : await repo.createSession(next);
    if (!created) throw new HttpError("unauthenticated", "This sign-in has ended. Start again.");
    return { token, expiresAt: created.expiresAt, staff: isStaff(user) };
  }

  /** The step-up that finishes a staff sign-in: a fresh token, the full 12 hours from now. */
  const stepUp = (r: Resolved, meta: ClientMeta) => issue(r.user, meta, "staff", true, r.session.id);

  async function totpSecretOf(userId: string) {
    const t = await repo.totpOf(userId);
    return t ? { ...t, secret: decrypt(keys.totp, t.secretEncrypted) } : null;
  }

  return {
    /** Always the same answer, whether or not the address has an account. */
    async requestSignInCode(email: string, meta: ClientMeta) {
      mailOrRefuse();
      await limit("code-request:email", email, LIMITS.codeRequestPerEmail);
      if (meta.ip) await limit("code-request:ip", meta.ip, LIMITS.codeRequestPerIp);
      await sendCode(email, "sign_in");
    },

    async signInWithCode(email: string, code: string, meta: ClientMeta): Promise<Issued> {
      await limit("code-verify:email", email, LIMITS.codeVerifyPerEmail);
      if (meta.ip) await limit("code-verify:ip", meta.ip, LIMITS.codeVerifyPerIp);
      const existing = await repo.userByEmail(email);
      // staff never sign in with an emailed code: their sign-in needs the authenticator
      if (existing && isStaff(existing)) {
        await spendCode(email, "sign_in", code);
        throw new HttpError("forbidden", "Staff accounts sign in with a password and an authenticator.");
      }
      await spendCode(email, "sign_in", code);
      const user = existing ?? (await repo.participantFor(email));
      if (user.disabledAt) throw new HttpError("forbidden", "This account is disabled.");
      return issue(user, meta, "participant", false);
    },

    /** A right password gives a pending session; the authenticator finishes it. */
    async signInStaff(email: string, password: string, meta: ClientMeta): Promise<Issued & SignInNext> {
      await limit("password:email", email, LIMITS.passwordPerEmail);
      if (meta.ip) await limit("password:ip", meta.ip, LIMITS.passwordPerIp);
      const user = await repo.userByEmail(email);
      const candidate = user && isStaff(user) && !user.disabledAt ? user : null;
      const ok = await checkPassword(candidate?.passwordHash, password);
      if (!ok || !candidate) throw new HttpError("unauthenticated", "That email or password is not right.");
      const totp = await repo.totpOf(candidate.id);
      const issued = await issue(candidate, meta, "pending", false);
      if (totp?.confirmedAt) return { ...issued, next: "totp" };
      // no authenticator yet: the first such sign-in starts the 7 days in which it may be put off
      const graceUntil = await repo.startGrace(candidate.id, new Date(now().getTime() + MFA_GRACE_MS));
      return { ...issued, next: "totp_enrol", ...(now() < graceUntil ? { skipUntil: graceUntil.toISOString() } : {}) };
    },

    /** Always the same answer; a code goes out only to an existing staff account. */
    async requestPasswordCode(email: string, meta: ClientMeta) {
      mailOrRefuse();
      await limit("code-request:email", email, LIMITS.codeRequestPerEmail);
      if (meta.ip) await limit("code-request:ip", meta.ip, LIMITS.codeRequestPerIp);
      const user = await repo.userByEmail(email);
      if (user && isStaff(user) && !user.disabledAt) await sendCode(email, "set_password");
    },

    async setPassword(email: string, code: string, password: string, meta: ClientMeta) {
      await limit("code-verify:email", email, LIMITS.codeVerifyPerEmail);
      if (meta.ip) await limit("code-verify:ip", meta.ip, LIMITS.codeVerifyPerIp);
      await spendCode(email, "set_password", code);
      const user = await repo.userByEmail(email);
      if (!user || !isStaff(user) || user.disabledAt) throw new HttpError("unauthenticated", "That code has expired or was already used. Ask for a new one.");
      await repo.setPassword(user.id, await hashPassword(password), now());
    },

    /** A new authenticator secret for a staff member who has none confirmed. Shown once. */
    async startTotp(r: Resolved) {
      if (!isStaff(r.user)) throw new HttpError("forbidden", "Only staff accounts use an authenticator.");
      const waiting = await repo.startTotp(r.user.id, encrypt(keys.totp, newTotpSecret()));
      if (!waiting) throw new HttpError("conflict", "An authenticator is already set up for this account. Ask an Algotech admin to reset it.");
      const secret = decrypt(keys.totp, waiting);
      return { secret, uri: otpauthUri(secret, r.user.email ?? r.user.name) };
    },

    /** The first code from the new authenticator: confirms it, issues the recovery codes, and finishes sign-in. */
    async confirmTotp(r: Resolved, code: string, meta: ClientMeta) {
      await limit("totp:user", r.user.id, LIMITS.totpPerUser);
      const t = await totpSecretOf(r.user.id);
      if (!t || t.confirmedAt) throw new HttpError("conflict", "There is no authenticator waiting to be confirmed. Start the setup again.");
      const step = matchTotp(t.secret, code, now(), null);
      if (step === null) throw new HttpError("unauthenticated", "That code doesn't match. Check the time on your phone and try the next code.");
      const recoveryCodes = newRecoveryCodes();
      if (!(await repo.confirmTotp(r.user.id, step, recoveryCodes.map(hashRecoveryCode), now())))
        throw new HttpError("conflict", "The authenticator was confirmed by another request. Sign in again.");
      return { issued: await stepUp(r, meta), recoveryCodes };
    },

    /** A code from the authenticator, or one recovery code, finishes a pending sign-in. */
    async verifyTotp(r: Resolved, proof: { code: string } | { recoveryCode: string }, meta: ClientMeta): Promise<Issued> {
      await limit("totp:user", r.user.id, LIMITS.totpPerUser);
      const wrong = new HttpError("unauthenticated", "That code is not right.");
      const t = await totpSecretOf(r.user.id);
      if (!t?.confirmedAt) throw new HttpError("conflict", "This account has no authenticator yet. Set one up first.");
      if ("code" in proof) {
        const step = matchTotp(t.secret, proof.code, now(), t.lastUsedStep === null ? null : Number(t.lastUsedStep));
        if (step === null || !(await repo.useTotpStep(r.user.id, step))) throw wrong;
      } else if (!(await repo.useRecoveryCode(r.user.id, hashRecoveryCode(proof.recoveryCode)))) throw wrong;
      return stepUp(r, meta);
    },

    /**
     * "Set up later" (D14): within the 7 days, a staff member with no authenticator finishes signing in without one.
     * The new session says so (mfa "skipped"); setting one up later steps it up like any other.
     */
    async skipTotp(r: Resolved, meta: ClientMeta): Promise<Issued> {
      if (!isStaff(r.user)) throw new HttpError("forbidden", "Only staff accounts use an authenticator.");
      const totp = await repo.totpOf(r.user.id);
      if (totp?.confirmedAt) throw new HttpError("conflict", "Your authenticator is set up: enter its code to sign in.");
      if (!r.user.mfaGraceUntil || now() >= r.user.mfaGraceUntil)
        throw new HttpError("forbidden", "The 7 days to set up your authenticator are over. Set it up now to continue.");
      return issue(r.user, meta, "staff", false, r.session.id, true);
    },

    /** The session behind a cookie, if it is still good; touching it keeps it from going idle. */
    async resolve(token: string | undefined): Promise<Resolved | null> {
      if (!token || token.length > 100) return null;
      const session = await repo.sessionByTokenHash(hashToken(token));
      if (!session || session.revokedAt || session.user.disabledAt) return null;
      const at = now();
      const pending = isStaff(session.user) && !session.stepUpAt && !session.mfaSkipped;
      const policy = POLICY[pending ? "pending" : isStaff(session.user) ? "staff" : "participant"];
      if (at >= session.expiresAt || at.getTime() - session.lastSeenAt.getTime() > policy.idleMs) {
        await repo.revokeSession(session.id, at);
        return null;
      }
      // one write a minute at most, not one per request
      if (at.getTime() - session.lastSeenAt.getTime() > MIN) await repo.touchSession(session.id, at);
      return { session, user: session.user, pending };
    },

    signOut: (r: Resolved) => repo.revokeSession(r.session.id, now()),

    async view(r: Resolved): Promise<SessionView> {
      const staff = isStaff(r.user);
      const [memberships, totp] = await Promise.all([repo.memberships(r.user.id), staff ? repo.totpOf(r.user.id) : null]);
      const skipped = staff && !r.pending && r.session.mfaSkipped;
      const enrolling = r.pending && !totp?.confirmedAt;
      const grace = r.user.mfaGraceUntil && now() < r.user.mfaGraceUntil ? r.user.mfaGraceUntil.toISOString() : undefined;
      return {
        user: { id: r.user.id, name: r.user.name, email: r.user.email, kind: r.user.kind },
        mfa: !staff ? "not_required" : r.pending ? "pending" : skipped ? "skipped" : "complete",
        ...(r.pending ? { pendingStep: totp?.confirmedAt ? ("totp" as const) : ("totp_enrol" as const) } : {}),
        ...((skipped || enrolling) && grace ? { mfaDueBy: grace } : {}),
        memberships: memberships.map((m) => ({ role: m.role, eventId: m.eventId, organiserId: m.organiserId, canDecide: m.canDecide })),
        expiresAt: r.session.expiresAt.toISOString(),
      };
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
