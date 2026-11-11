/**
 * Sign-in's handlers: parse the body with the contract, call the service, set or clear the cookie, answer. The
 * session token goes only into the cookie, never into a body.
 */
import type { Request, RequestHandler } from "express";
import {
  CodeRequest,
  CodeVerify,
  PasswordCodeRequest,
  PasswordSet,
  StaffSignIn,
  TotpConfirm,
  TotpVerify,
  type RecoveryCodes,
  type SignInNext,
  type TotpEnrolment,
} from "@excursia/contracts/auth";
import type { Config } from "../../config";
import { clearSessionCookie, sessionOf, setSessionCookie } from "../../http/session";
import type { AuthService, ClientMeta } from "./auth.service";

const meta = (req: Request): ClientMeta => ({ ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });

export function createAuthController(service: AuthService, config: Config, now: () => Date = () => new Date()) {
  const handlers = {
    requestCode: (async (req, res) => {
      const { email } = CodeRequest.parse(req.body);
      await service.requestSignInCode(email, meta(req));
      res.status(202).end();
    }) satisfies RequestHandler,

    verifyCode: (async (req, res) => {
      const { email, code } = CodeVerify.parse(req.body);
      const issued = await service.signInWithCode(email, code, meta(req));
      setSessionCookie(res, config, issued, now());
      res.json({ next: "done" } satisfies SignInNext);
    }) satisfies RequestHandler,

    staffSignIn: (async (req, res) => {
      const { email, password } = StaffSignIn.parse(req.body);
      const { next, skipUntil, ...issued } = await service.signInStaff(email, password, meta(req));
      setSessionCookie(res, config, issued, now());
      res.json({ next, ...(skipUntil ? { skipUntil } : {}) } satisfies SignInNext);
    }) satisfies RequestHandler,

    requestPasswordCode: (async (req, res) => {
      const { email } = PasswordCodeRequest.parse(req.body);
      await service.requestPasswordCode(email, meta(req));
      res.status(202).end();
    }) satisfies RequestHandler,

    setPassword: (async (req, res) => {
      const { email, code, password } = PasswordSet.parse(req.body);
      await service.setPassword(email, code, password, meta(req));
      clearSessionCookie(res, config);
      res.status(204).end();
    }) satisfies RequestHandler,

    startTotp: (async (_req, res) => {
      res.set("Cache-Control", "no-store").json((await service.startTotp(sessionOf(res))) satisfies TotpEnrolment);
    }) satisfies RequestHandler,

    confirmTotp: (async (req, res) => {
      const { code } = TotpConfirm.parse(req.body);
      const { issued, recoveryCodes } = await service.confirmTotp(sessionOf(res), code, meta(req));
      setSessionCookie(res, config, issued, now());
      res.set("Cache-Control", "no-store").json({ recoveryCodes } satisfies RecoveryCodes);
    }) satisfies RequestHandler,

    verifyTotp: (async (req, res) => {
      const proof = TotpVerify.parse(req.body);
      const issued = await service.verifyTotp(sessionOf(res), proof, meta(req));
      setSessionCookie(res, config, issued, now());
      res.json({ next: "done" } satisfies SignInNext);
    }) satisfies RequestHandler,

    skipTotp: (async (req, res) => {
      const issued = await service.skipTotp(sessionOf(res), meta(req));
      setSessionCookie(res, config, issued, now());
      res.json({ next: "done" } satisfies SignInNext);
    }) satisfies RequestHandler,

    signOut: (async (_req, res) => {
      const auth = res.locals.auth;
      if (auth) await service.signOut(auth);
      clearSessionCookie(res, config);
      res.status(204).end();
    }) satisfies RequestHandler,

    session: (async (_req, res) => {
      res.set("Cache-Control", "private, no-store").json(await service.view(sessionOf(res)));
    }) satisfies RequestHandler,
  };
  return handlers;
}
export type AuthController = ReturnType<typeof createAuthController>;
