/**
 * Sign-in and sessions (backend-plan.md, M0.4). Applicants sign in with a code sent by email; staff with a
 * password and then an authenticator code. The session itself travels only in an HttpOnly cookie, never in a
 * response body.
 */
import { z } from "zod";

/** Emails compare without case or surrounding spaces. */
export const Email = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((e) => e.toLowerCase());

const SixDigits = z.string().trim().regex(/^\d{6}$/, "six digits");

export const CodeRequest = z.object({ email: Email });
export const CodeVerify = z.object({ email: Email, code: SixDigits });
export const StaffSignIn = z.object({ email: Email, password: z.string().min(1).max(128) });
export const PasswordCodeRequest = z.object({ email: Email });
export const PasswordSet = z.object({ email: Email, code: SixDigits, password: z.string().min(12, "at least 12 characters").max(128) });
export const TotpConfirm = z.object({ code: SixDigits });
export const TotpVerify = z.union([z.object({ code: SixDigits }), z.object({ recoveryCode: z.string().trim().min(10).max(20) })]);

/** What to do after a sign-in step: nothing more, or prove the authenticator, or set one up first. */
export const SignInNext = z.object({ next: z.enum(["done", "totp", "totp_enrol"]) });
export type SignInNext = z.infer<typeof SignInNext>;

/** Shown once: the secret to type or the URI to scan. */
export const TotpEnrolment = z.object({ secret: z.string(), uri: z.string() });
export type TotpEnrolment = z.infer<typeof TotpEnrolment>;

/** Shown once, when the authenticator is confirmed. */
export const RecoveryCodes = z.object({ recoveryCodes: z.array(z.string()) });
export type RecoveryCodes = z.infer<typeof RecoveryCodes>;

export const SessionView = z.object({
  user: z.object({ id: z.string(), name: z.string(), email: z.string().nullable(), kind: z.enum(["admin", "staff", "participant"]) }),
  /** pending: the password was right, the authenticator is still to come; only the TOTP routes answer. */
  mfa: z.enum(["complete", "pending", "not_required"]),
  memberships: z.array(z.object({ role: z.string(), eventId: z.string().nullable(), organiserId: z.string().nullable(), canDecide: z.boolean() })),
  expiresAt: z.string(),
});
export type SessionView = z.infer<typeof SessionView>;
