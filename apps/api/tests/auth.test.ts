/**
 * M0.4: sign-in and sessions, end to end through the real app and the test database, with a clock the tests move.
 * Each run uses its own emails and its own client addresses (X-Forwarded-For, trusted from loopback), so the
 * rate limits of one test never reach another.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ErrorBody } from "@excursia/contracts/http";
import { RecoveryCodes, SessionView, SignInNext, TotpEnrolment } from "@excursia/contracts/auth";
import { createDb } from "@excursia/db";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { errorHandler } from "../src/http/errors";
import { requireSession } from "../src/http/session";
import { memoryMailer } from "../src/mail/mailer";
import { stepAt, totpCode } from "../src/security/totp";

const WEB = "https://events.example.co.ke";
const run = Date.now().toString(36);
const MIN = 60_000;

describe.skipIf(!process.env.TEST_DATABASE_URL)("sign-in and sessions", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 4);
  const mailer = memoryMailer();
  let clock = new Date();
  const advance = (ms: number) => (clock = new Date(clock.getTime() + ms));
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: Buffer.alloc(32, 9).toString("base64") });
  let server: Server;
  let base = "";
  const madeUsers: string[] = [];

  beforeAll(async () => {
    const app = createApp({ config, db, mailer, now: () => clock, logError: (e) => console.error(e) });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    const emails = { contains: `.${run}.example` };
    const users = await db.user.findMany({ where: { email: emails }, select: { id: true } });
    await db.user.deleteMany({ where: { id: { in: [...users.map((u) => u.id), ...madeUsers] } } });
    await db.otpCode.deleteMany({ where: { destination: emails } });
    await db.$disconnect();
  });

  /** A browser: its own address, its cookie, and the web app's Origin on every write. */
  function browser(ip: string) {
    let cookie: string | undefined;
    let lastSetCookie = "";
    async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
      const headers: Record<string, string> = { "X-Forwarded-For": ip, ...extra };
      if (method !== "GET") headers.Origin ??= WEB;
      if (extra.Origin === "") delete headers.Origin;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (cookie) headers.Cookie = `sid=${cookie}`;
      const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const c of res.headers.getSetCookie()) {
        lastSetCookie = c;
        const value = /^sid=([^;]*)/.exec(c)?.[1];
        if (value !== undefined) cookie = value || undefined;
      }
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : undefined };
    }
    return {
      call,
      get cookie() {
        return cookie;
      },
      set cookie(v: string | undefined) {
        cookie = v;
      },
      get setCookie() {
        return lastSetCookie;
      },
    };
  }

  const lastCodeTo = (email: string) => {
    const mail = [...mailer.sent].reverse().find((m) => m.to === email);
    return mail ? /\b(\d{6})\b/.exec(mail.text)![1] : undefined;
  };
  const errorOf = (r: { json: unknown }) => ErrorBody.parse(r.json).error;

  describe("an applicant, with a code by email", () => {
    const email = `amina.${run}.example`.replace(/^/, "applicant@") as string;

    test("asking for a code answers the same for anyone, and sends one", async () => {
      const b = browser("10.0.1.1");
      expect((await b.call("POST", "/v1/auth/code", { email: email.toUpperCase() })).status).toBe(202);
      expect(lastCodeTo(email)).toMatch(/^\d{6}$/);
      expect((await b.call("POST", "/v1/auth/code", { email: `nobody@${run}.example` })).status).toBe(202);
    });

    test("the database keeps only a keyed hash of the code", async () => {
      const code = lastCodeTo(email)!;
      const rows = await db.otpCode.findMany({ where: { destination: email } });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => !r.codeHash.includes(code))).toBe(true);
    });

    test("a wrong code says how many tries are left; the right one signs in, once", async () => {
      const b = browser("10.0.1.2");
      const wrong = await b.call("POST", "/v1/auth/code/verify", { email, code: lastCodeTo(email) === "000000" ? "111111" : "000000" });
      expect(wrong.status).toBe(401);
      expect(errorOf(wrong).message).toMatch(/4 tries left/);

      const right = await b.call("POST", "/v1/auth/code/verify", { email, code: lastCodeTo(email) });
      expect(SignInNext.parse(right.json)).toEqual({ next: "done" });
      expect(b.setCookie).toMatch(/HttpOnly/);
      expect(b.setCookie).toMatch(/SameSite=Lax/);
      expect(b.setCookie).toMatch(/Max-Age=2592000/); // 30 days

      const me = SessionView.parse((await b.call("GET", "/v1/session")).json);
      expect(me.user).toMatchObject({ email, kind: "participant" });
      expect(me.mfa).toBe("not_required");

      const again = await browser("10.0.1.3").call("POST", "/v1/auth/code/verify", { email, code: lastCodeTo(email) });
      expect(again.status).toBe(401);
    });

    test("five wrong guesses kill the code, even for the right one after", async () => {
      const b = browser("10.0.1.4");
      const who = `five@${run}.example`;
      await b.call("POST", "/v1/auth/code", { email: who });
      const code = lastCodeTo(who)!;
      const bad = code === "123456" ? "654321" : "123456";
      for (let i = 0; i < 5; i++) await b.call("POST", "/v1/auth/code/verify", { email: who, code: bad });
      expect((await b.call("POST", "/v1/auth/code/verify", { email: who, code })).status).toBe(401);
    });

    test("a new code kills the old one, and a code lasts ten minutes", async () => {
      const b = browser("10.0.1.5");
      const who = `twice@${run}.example`;
      await b.call("POST", "/v1/auth/code", { email: who });
      const first = lastCodeTo(who)!;
      await b.call("POST", "/v1/auth/code", { email: who });
      const second = lastCodeTo(who)!;
      if (first !== second) expect((await b.call("POST", "/v1/auth/code/verify", { email: who, code: first })).status).toBe(401);

      await b.call("POST", "/v1/auth/code", { email: who });
      const third = lastCodeTo(who)!;
      advance(10 * MIN + 1000);
      expect((await b.call("POST", "/v1/auth/code/verify", { email: who, code: third })).status).toBe(401);
    });

    test("a fourth code within fifteen minutes is refused", async () => {
      const b = browser("10.0.1.6");
      const who = `flood@${run}.example`;
      for (let i = 0; i < 3; i++) expect((await b.call("POST", "/v1/auth/code", { email: who })).status).toBe(202);
      const fourth = await b.call("POST", "/v1/auth/code", { email: who });
      expect(fourth.status).toBe(429);
      expect(errorOf(fourth).code).toBe("rate_limited");
    });

    test("seven days without a visit end the session; signing out ends it at once", async () => {
      const b = browser("10.0.1.7");
      const who = `idle@${run}.example`;
      await b.call("POST", "/v1/auth/code", { email: who });
      await b.call("POST", "/v1/auth/code/verify", { email: who, code: lastCodeTo(who) });
      advance(6 * 24 * 60 * MIN);
      expect((await b.call("GET", "/v1/session")).status).toBe(200); // a visit keeps it alive
      advance(7 * 24 * 60 * MIN + MIN);
      expect((await b.call("GET", "/v1/session")).status).toBe(401);

      await b.call("POST", "/v1/auth/code", { email: who });
      await b.call("POST", "/v1/auth/code/verify", { email: who, code: lastCodeTo(who) });
      const token = b.cookie;
      expect((await b.call("POST", "/v1/auth/signout")).status).toBe(204);
      b.cookie = token; // the old cookie, kept by someone
      expect((await b.call("GET", "/v1/session")).status).toBe(401);
    });
  });

  describe("a staff member, with a password and an authenticator", () => {
    const email = `lead@${run}.example`;
    const password = "correct horse battery staple";
    let secret = "";
    let recovery: string[] = [];

    beforeAll(async () => {
      const u = await db.user.create({ data: { kind: "staff", email, name: "Test Lead" } });
      madeUsers.push(u.id);
    });

    test("a password code goes only to a staff account, but the answer is the same either way", async () => {
      const b = browser("10.0.2.1");
      const before = mailer.sent.length;
      expect((await b.call("POST", "/v1/auth/staff/password/code", { email: `ghost@${run}.example` })).status).toBe(202);
      expect(mailer.sent.length).toBe(before);
      expect((await b.call("POST", "/v1/auth/staff/password/code", { email })).status).toBe(202);
      expect(lastCodeTo(email)).toMatch(/^\d{6}$/);
    });

    test("the code sets the password; a short one is refused first", async () => {
      const b = browser("10.0.2.2");
      const short = await b.call("POST", "/v1/auth/staff/password", { email, code: lastCodeTo(email), password: "short" });
      expect(errorOf(short).fields).toEqual(["password"]);
      expect((await b.call("POST", "/v1/auth/staff/password", { email, code: lastCodeTo(email), password })).status).toBe(204);
      const stored = await db.user.findUnique({ where: { email }, select: { passwordHash: true } });
      expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    });

    test("a wrong password and an unknown email get the same refusal", async () => {
      const b = browser("10.0.2.3");
      const wrongPassword = await b.call("POST", "/v1/auth/staff/signin", { email, password: "not the password" });
      const unknown = await b.call("POST", "/v1/auth/staff/signin", { email: `ghost@${run}.example`, password });
      expect(wrongPassword.status).toBe(401);
      expect(unknown).toEqual(wrongPassword);
    });

    test("staff can't sign in with an emailed code", async () => {
      const b = browser("10.0.2.4");
      await b.call("POST", "/v1/auth/code", { email });
      const r = await b.call("POST", "/v1/auth/code/verify", { email, code: lastCodeTo(email) });
      expect(r.status).toBe(403);
    });

    test("the first sign-in sets up the authenticator; the session is pending until it is confirmed", async () => {
      const b = browser("10.0.2.5");
      const first = await b.call("POST", "/v1/auth/staff/signin", { email, password });
      expect(SignInNext.parse(first.json)).toEqual({ next: "totp_enrol" });
      expect(b.setCookie).toMatch(/SameSite=Strict/);
      expect(SessionView.parse((await b.call("GET", "/v1/session")).json).mfa).toBe("pending");

      const enrol = TotpEnrolment.parse((await b.call("POST", "/v1/auth/totp/setup")).json);
      secret = enrol.secret;
      expect(enrol.uri).toContain(`secret=${secret}`);
      const stored = await db.totpSecret.findFirst({ where: { user: { email } } });
      expect(stored?.secretEncrypted).not.toContain(secret);

      const pendingToken = b.cookie;
      const wrong = await b.call("POST", "/v1/auth/totp/confirm", { code: totpCode(secret, stepAt(clock) + 5) });
      expect(wrong.status).toBe(401);
      const ok = await b.call("POST", "/v1/auth/totp/confirm", { code: totpCode(secret, stepAt(clock)) });
      recovery = RecoveryCodes.parse(ok.json).recoveryCodes;
      expect(recovery).toHaveLength(10);
      expect(b.cookie).not.toBe(pendingToken); // a new token at the step-up
      expect(SessionView.parse((await b.call("GET", "/v1/session")).json).mfa).toBe("complete");

      b.cookie = pendingToken;
      expect((await b.call("GET", "/v1/session")).status).toBe(401); // the pending token died with the step-up
    });

    test("the next sign-in asks for a code; a code already used is refused, the next one works", async () => {
      const b = browser("10.0.2.6");
      expect(SignInNext.parse((await b.call("POST", "/v1/auth/staff/signin", { email, password })).json)).toEqual({ next: "totp" });
      const used = await b.call("POST", "/v1/auth/totp/verify", { code: totpCode(secret, stepAt(clock)) });
      expect(used.status).toBe(401);
      advance(30_000);
      expect((await b.call("POST", "/v1/auth/totp/verify", { code: totpCode(secret, stepAt(clock)) })).status).toBe(200);
      expect(SessionView.parse((await b.call("GET", "/v1/session")).json).mfa).toBe("complete");
    });

    test("a recovery code works once", async () => {
      const b = browser("10.0.2.7");
      await b.call("POST", "/v1/auth/staff/signin", { email, password });
      expect((await b.call("POST", "/v1/auth/totp/verify", { recoveryCode: recovery[0].toUpperCase() })).status).toBe(200);
      advance(5 * MIN); // past the five tries per five minutes the earlier tests used
      const c = browser("10.0.2.8");
      await c.call("POST", "/v1/auth/staff/signin", { email, password });
      expect((await c.call("POST", "/v1/auth/totp/verify", { recoveryCode: recovery[0] })).status).toBe(401);
    });

    test("a pending sign-in lapses after ten minutes", async () => {
      const b = browser("10.0.2.9");
      await b.call("POST", "/v1/auth/staff/signin", { email, password });
      advance(10 * MIN + 1000);
      expect((await b.call("POST", "/v1/auth/totp/verify", { code: totpCode(secret, stepAt(clock)) })).status).toBe(401);
    });

    test("thirty minutes idle end a staff session, and twelve hours end it whatever", async () => {
      const signedIn = async (ip: string) => {
        const b = browser(ip);
        await b.call("POST", "/v1/auth/staff/signin", { email, password });
        advance(30_000);
        await b.call("POST", "/v1/auth/totp/verify", { code: totpCode(secret, stepAt(clock)) });
        return b;
      };
      const idle = await signedIn("10.0.3.1");
      advance(31 * MIN);
      expect((await idle.call("GET", "/v1/session")).status).toBe(401);

      const busy = await signedIn("10.0.3.2");
      let visits = 0;
      for (; visits < 30; visits++) {
        advance(29 * MIN); // never idle for 30 minutes
        if ((await busy.call("GET", "/v1/session")).status !== 200) break;
      }
      expect(visits).toBe(24); // 24 × 29 min after the step-up passes 12 hours on the 25th visit
      expect((await busy.call("GET", "/v1/session")).status).toBe(401);
    });

    test("a new password ends every session the person had", async () => {
      const b = browser("10.0.3.3");
      await b.call("POST", "/v1/auth/staff/signin", { email, password });
      advance(30_000);
      await b.call("POST", "/v1/auth/totp/verify", { code: totpCode(secret, stepAt(clock)) });
      expect((await b.call("GET", "/v1/session")).status).toBe(200);
      advance(16 * MIN); // past the code-request window used earlier
      await browser("10.0.3.4").call("POST", "/v1/auth/staff/password/code", { email });
      await browser("10.0.3.4").call("POST", "/v1/auth/staff/password", { email, code: lastCodeTo(email), password: `${password} again` });
      expect((await b.call("GET", "/v1/session")).status).toBe(401);
    });
  });

  describe("cross-site writes", () => {
    test("a write from another site is refused before anything runs", async () => {
      const r = await browser("10.0.4.1").call("POST", "/v1/auth/code", { email: `x@${run}.example` }, { Origin: "https://evil.example" });
      expect(r.status).toBe(403);
    });

    test("a write that carries the cookie must say where it came from", async () => {
      const b = browser("10.0.4.2");
      b.cookie = "anything";
      expect((await b.call("POST", "/v1/auth/signout", undefined, { Origin: "" })).status).toBe(403);
    });
  });
});

describe("requireSession", () => {
  test("a pending staff session reaches only the routes that allow it", async () => {
    const app = express();
    app.use((_req, res, next) => {
      res.locals.auth = { pending: true, user: { kind: "staff" } };
      next();
    });
    app.get("/full", requireSession({ staff: true }), (_req, res) => void res.send("ok"));
    app.get("/finish", requireSession({ staff: true, pending: true }), (_req, res) => void res.send("ok"));
    app.use(errorHandler(() => {}));
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await fetch(`${base}/full`)).status).toBe(401);
    expect((await fetch(`${base}/finish`)).status).toBe(200);
    await new Promise<void>((r) => server.close(() => r()));
  });
});
