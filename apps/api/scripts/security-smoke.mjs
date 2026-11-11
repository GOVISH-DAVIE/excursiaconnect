#!/usr/bin/env node
/**
 * A security smoke test against a running API: headers, CORS, CSRF, account enumeration, rate limits, the session
 * cookie, sign-out, tampered cookies and hostile input. It changes nothing but rate-limit counters, and signs in only
 * as the staff account you name, if you name one.
 *
 *   npm run security:smoke                                     # the local API
 *   API_URL=http://127.0.0.1:4100 WEB_ORIGIN=https://events.example.co.ke EXPECT=production npm run security:smoke
 *   STAFF_EMAIL=… STAFF_PASSWORD=… npm run security:smoke      # adds the checks that need a real staff password
 *
 * Each check uses its own made-up client address in X-Forwarded-For, which the API trusts only from loopback. Behind
 * nginx that header is overwritten, so on staging the rate-limit checks share your one address: run it once per
 * 15 minutes there.
 */
import { randomBytes } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:4000";
const WEB = process.env.WEB_ORIGIN ?? "http://localhost:3010";
const PRODUCTION = process.env.EXPECT === "production";
const STAFF = process.env.STAFF_EMAIL && process.env.STAFF_PASSWORD ? { email: process.env.STAFF_EMAIL, password: process.env.STAFF_PASSWORD } : null;
const EVIL = "https://evil.example";
const run = randomBytes(3).toString("hex");
const ip = (n) => `10.${(parseInt(run.slice(0, 2), 16) % 200) + 20}.${n}.${parseInt(run.slice(2, 4), 16)}`;
const email = (what) => `${what}-${run}@smoke.example`;

const results = [];
const check = (area, name, ok, detail = "") => results.push({ area, name, ok: !!ok, detail });

async function call(method, path, { body, origin = WEB, from, cookie, raw } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (from) headers["X-Forwarded-For"] = from;
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined || raw !== undefined) headers["Content-Type"] = "application/json";
  const t = performance.now();
  const res = await fetch(`${API}${path}`, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const ms = performance.now() - t;
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, ms, setCookie: res.headers.getSetCookie() };
}
const sessionCookie = (r) => r.setCookie.map((c) => c.split(";")[0]).find((c) => /^(__Secure-)?sid=./.test(c));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function headers() {
  const r = await call("GET", "/health/live");
  const h = (n) => r.headers.get(n) ?? "";
  check("Headers", "deny-all Content-Security-Policy", h("content-security-policy").includes("default-src 'none'"), h("content-security-policy"));
  check("Headers", "no MIME sniffing", h("x-content-type-options") === "nosniff");
  check("Headers", "can't be framed", /frame-ancestors 'none'/.test(h("content-security-policy")));
  check("Headers", "HSTS", h("strict-transport-security").includes("max-age="));
  check("Headers", "doesn't announce Express", !r.headers.has("x-powered-by"));
}

async function cors() {
  const pre = (origin) => call("OPTIONS", "/v1/auth/code", { origin, raw: undefined }).then(async () =>
    fetch(`${API}/v1/auth/code`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } }),
  );
  const good = await pre(WEB);
  check("CORS", "the web app may call with cookies", good.headers.get("access-control-allow-origin") === WEB && good.headers.get("access-control-allow-credentials") === "true");
  const bad = await pre(EVIL);
  check("CORS", "another site gets no CORS headers", !bad.headers.get("access-control-allow-origin"));
}

async function csrf() {
  const r = await call("POST", "/v1/auth/code", { origin: EVIL, body: { email: email("csrf") }, from: ip(1) });
  check("CSRF", "a write from another site is refused", r.status === 403, `${r.status}`);
  const c = await call("POST", "/v1/auth/signout", { origin: null, cookie: "sid=x; __Secure-sid=x", from: ip(1) });
  check("CSRF", "a write with the cookie but no Origin is refused", c.status === 403, `${c.status}`);
}

async function enumeration() {
  const a = await call("POST", "/v1/auth/code", { body: { email: email("nobody-a") }, from: ip(2) });
  const b = await call("POST", "/v1/auth/staff/password/code", { body: { email: email("nobody-b") }, from: ip(2) });
  const expected = PRODUCTION ? 503 : 202;
  check("Enumeration", `code requests answer ${expected} for an unknown address`, a.status === expected && b.status === expected, `${a.status}, ${b.status}`);
  if (STAFF) {
    const s = await call("POST", "/v1/auth/staff/password/code", { body: { email: STAFF.email }, from: ip(2) });
    check("Enumeration", "a staff address gets the same answer as an unknown one", s.status === b.status && s.text === b.text, `${s.status} vs ${b.status}`);
    const times = { unknown: [], wrong: [] };
    let bodies = new Set();
    for (let i = 0; i < 3; i++) {
      const u = await call("POST", "/v1/auth/staff/signin", { body: { email: email(`ghost${i}`), password: "not it at all" }, from: ip(3) });
      const w = await call("POST", "/v1/auth/staff/signin", { body: { email: STAFF.email, password: `wrong ${i} not it` }, from: ip(3) });
      times.unknown.push(u.ms);
      times.wrong.push(w.ms);
      bodies.add(`${u.status} ${u.text}`).add(`${w.status} ${w.text}`);
    }
    check("Enumeration", "unknown email and wrong password: one refusal", bodies.size === 1, [...bodies][0]);
    const [mu, mw] = [median(times.unknown), median(times.wrong)];
    check("Enumeration", "…taking the same time", Math.abs(mu - mw) < Math.max(40, 0.35 * Math.max(mu, mw)), `median ${mu.toFixed(0)} ms vs ${mw.toFixed(0)} ms`);
  }
}

/** Sends until refused; returns the attempt number of the first 429, or null. */
async function untilLimited(max, send) {
  for (let i = 1; i <= max; i++) if ((await send(i)).status === 429) return i;
  return null;
}

async function rateLimits() {
  if (PRODUCTION) {
    check("Rate limits", "code requests (skipped: email not set up in production mode)", true);
  } else {
    const perEmail = await untilLimited(6, () => call("POST", "/v1/auth/code", { body: { email: email("flood") }, from: ip(10) }));
    check("Rate limits", "4th code request for one address in 15 min", perEmail === 4, `refused at #${perEmail}`);
    const perIp = await untilLimited(25, (i) => call("POST", "/v1/auth/code", { body: { email: email(`spray${i}`) }, from: ip(11) }));
    check("Rate limits", "21st code request from one machine in 15 min", perIp === 21, `refused at #${perIp}`);
  }
  const verifyEmail = await untilLimited(14, () => call("POST", "/v1/auth/code/verify", { body: { email: email("guess"), code: "123456" }, from: ip(12) }));
  check("Rate limits", "11th code guess for one address in 15 min", verifyEmail === 11, `refused at #${verifyEmail}`);
  const verifyIp = await untilLimited(35, (i) => call("POST", "/v1/auth/code/verify", { body: { email: email(`guess${i}`), code: "123456" }, from: ip(13) }));
  check("Rate limits", "31st code guess from one machine, across addresses", verifyIp === 31, `refused at #${verifyIp}`);
  const pwEmail = await untilLimited(8, (i) => call("POST", "/v1/auth/staff/signin", { body: { email: email("pw"), password: `guess number ${i}` }, from: ip(14) }));
  check("Rate limits", "6th password guess for one address in 15 min", pwEmail === 6, `refused at #${pwEmail}`);
  const pwIp = await untilLimited(35, (i) => call("POST", "/v1/auth/staff/signin", { body: { email: email(`pw${i}`), password: "guess number one" }, from: ip(15) }));
  check("Rate limits", "31st password guess from one machine, across addresses", pwIp === 31, `refused at #${pwIp}`);
}

async function session() {
  const fake = await call("GET", "/v1/session", { cookie: `sid=${randomBytes(32).toString("base64url")}; __Secure-sid=${randomBytes(32).toString("base64url")}` });
  check("Session", "a made-up or tampered cookie is nobody", fake.status === 401, `${fake.status}`);
  if (!STAFF) return check("Session", "cookie and sign-out checks (skipped: set STAFF_EMAIL and STAFF_PASSWORD)", true);

  const r = await call("POST", "/v1/auth/staff/signin", { body: STAFF, from: ip(20) });
  if (r.status !== 200) return check("Session", "staff sign-in for the cookie checks", false, `${r.status} ${r.text}`);
  const set = r.setCookie.join(" | ");
  check("Session", "no token in the response body", !/sid|token/i.test(r.text) && JSON.parse(r.text).next !== undefined, r.text);
  check("Session", "cookie is HttpOnly", /HttpOnly/i.test(set));
  check("Session", "cookie is SameSite=Strict for staff", /SameSite=Strict/i.test(set));
  check("Session", "cookie has Path=/", /Path=\//.test(set));
  if (PRODUCTION) {
    check("Session", "cookie is Secure, named __Secure-sid", /^__Secure-sid=/.test(set) && /;\s*Secure/i.test(set), set.replace(/=[^;]{20,}/, "=…"));
    check("Session", "cookie is scoped to the parent domain", /Domain=\.?example\.co\.ke/i.test(set));
  }
  const cookie = sessionCookie(r);
  const before = await call("GET", "/v1/session", { cookie });
  check("Session", "the cookie works (a pending staff session)", before.status === 200 && /"mfa":"pending"/.test(before.text), `${before.status}`);
  const out = await call("POST", "/v1/auth/signout", { cookie, from: ip(20) });
  const after = await call("GET", "/v1/session", { cookie });
  check("Session", "after sign-out the same cookie is refused", out.status === 204 && after.status === 401, `${out.status}, then ${after.status}`);
}

async function hostileInput() {
  const sql = await call("POST", "/v1/auth/code/verify", { body: { email: "' OR 1=1 --@x.example", code: "123456" }, from: ip(30) });
  check("Input", "SQL-looking email is a 400, not an error", sql.status === 400, `${sql.status}`);
  const big = await call("POST", "/v1/auth/code", { raw: JSON.stringify({ email: "a".repeat(200_000) }), from: ip(30) });
  check("Input", "a 200 kB body is refused with 413", big.status === 413, `${big.status}`);
  const broken = await call("POST", "/v1/auth/code", { raw: "{not json", from: ip(30) });
  check("Input", "malformed JSON is a 400", broken.status === 400, `${broken.status}`);
  const leaks = [sql, big, broken].some((r) => /\bat \w+ \(|Error:|prisma|stack/i.test(r.text));
  check("Input", "no stack traces or internals in errors", !leaks);
  const proto = await call("POST", "/v1/auth/code", { raw: '{"email":"x@y.example","__proto__":{"admin":true}}', from: ip(31) });
  check("Input", "a __proto__ key is just ignored", proto.status === (PRODUCTION ? 503 : 202), `${proto.status}`);
}

const t = Date.now();
for (const part of [headers, cors, csrf, enumeration, rateLimits, session, hostileInput]) {
  try {
    await part();
  } catch (e) {
    check(part.name, "ran", false, String(e));
  }
}

const width = Math.max(...results.map((r) => r.name.length));
let area = "";
for (const r of results) {
  if (r.area !== area) console.log(`\n${(area = r.area)}`);
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(width)}  ${r.detail}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed, against ${API}${PRODUCTION ? " (production mode)" : ""} in ${((Date.now() - t) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
