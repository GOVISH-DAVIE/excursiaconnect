/**
 * The Deal Room desk (M2.2): PINs and their lockout, enrolled devices, a scanner's session that opens nothing but
 * scanning, the badge list with its ETag, and scans: the server's verdict, recorded once however often or however
 * concurrently they are sent, one arrival a day, a device's clock kept only when it is plausible.
 */
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ErrorBody } from "@excursia/contracts/http";
import { BadgeList, DevicesView, ScannerHome, ScanResults } from "@excursia/contracts/scan";
import { createDb } from "@excursia/db";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { createSeedRepo } from "../src/modules/seed/seed.repo";
import { demoRows, demoUserId } from "../src/modules/seed/seed.service";
import { toInstant } from "../src/persistence/time";
import { hashToken, newToken } from "../src/security/secrets";

const WEB = "https://events.example.co.ke";
const EV = "ev_ca3";
const DAY = "2027-02-16";

describe.skipIf(!process.env.TEST_DATABASE_URL)("the Deal Room desk", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 6);
  const seedRepo = createSeedRepo(db);
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: Buffer.alloc(32, 6).toString("base64") });
  const clock = toInstant(`${DAY} 09:00`);
  let server: Server;
  let base = "";
  /** each "browser": its session cookie and its scanner device cookie */
  const jar: Record<string, { sid?: string; scanner?: string }> = {};
  let fresh = "";
  let revoked = "";

  async function call(method: string, path: string, who: string, body?: unknown, headers: Record<string, string> = {}) {
    const c = jar[who] ?? {};
    const cookie = [c.sid && `sid=${c.sid}`, c.scanner && `scanner=${c.scanner}`].filter(Boolean).join("; ");
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method !== "GET" ? { Origin: WEB } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const set of res.headers.getSetCookie()) {
      const m = /^(sid|scanner)=([^;]*)/.exec(set);
      if (m) jar[who] = { ...jar[who], [m[1]]: m[2] || undefined };
    }
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined, headers: res.headers };
  }
  async function staffSession(who: string, staffId: string) {
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId: demoUserId(staffId), createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 86_400_000), stepUpAt: clock } });
    jar[who] = { ...jar[who], sid: token };
  }
  const scan = (who: string, code: string, extra: { id?: string; at?: string; offline?: boolean } = {}) =>
    call("POST", `/v1/scan/${EV}/scans`, who, { scans: [{ id: extra.id ?? randomUUID(), code, at: extra.at ?? clock.toISOString(), offline: extra.offline ?? false }] });
  const message = (r: { json: unknown }) => ErrorBody.parse(r.json).error.message;

  beforeAll(async () => {
    await seedRepo.replaceDemo(demoRows());
    for (const [who, id] of [["ops", "st_ops1"], ["coord", "st_coord1"], ["lead", "st_lead"], ["rev", "st_rev1"]]) await staffSession(who, id);
    // a badge never through the desk, and one revoked
    const valid = await db.badge.findMany({ where: { eventId: EV, revokedAt: null, delegate: { accredited: false } }, take: 2, orderBy: { code: "asc" } });
    fresh = valid[0].code;
    revoked = valid[1].code;
    await db.badge.update({ where: { code: revoked }, data: { revokedAt: clock } });
    const app = createApp({ config, db, mailer: memoryMailer(), now: () => clock, logError: (e) => console.error(e) });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await db.scannerPin.deleteMany({ where: { userId: { in: ["st_ops1", "st_coord1", "st_lead"].map(demoUserId) } } });
    await seedRepo.removeDemo();
    await db.$disconnect();
  }, 60_000);

  test("PINs: six digits, not an obvious one; only the desk team enrols a device", async () => {
    expect((await call("PUT", "/v1/scan/pin", "ops", { pin: "123456" })).status).toBe(400);
    expect((await call("PUT", "/v1/scan/pin", "ops", { pin: "4417" })).status).toBe(400);
    expect((await call("PUT", "/v1/scan/pin", "ops", { pin: "480913" })).status).toBe(204);
    expect((await call("PUT", "/v1/scan/pin", "coord", { pin: "602318" })).status).toBe(204);
    expect((await call("POST", `/v1/scan/${EV}/devices`, "rev", { name: "Desk 1" })).status).toBe(403);
    const r = await call("POST", `/v1/scan/${EV}/devices`, "ops", { name: "Desk tablet 1" });
    expect(r.status).toBe(201);
    expect(jar.ops.scanner).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    const list = DevicesView.parse((await call("GET", `/v1/scan/${EV}/devices`, "ops")).json);
    expect(list.devices.find((d) => d.name === "Desk tablet 1")).toMatchObject({ here: true, retired: false });
    expect(list.pinSet).toBe(true);
    // a second device, the coordinator's phone, for the concurrency test
    expect((await call("POST", `/v1/scan/${EV}/devices`, "coord", { name: "Coordinator's phone" })).status).toBe(201);
  });

  test("the device lists the desk team, not the reviewers; no device, no PIN pad", async () => {
    expect((await call("GET", "/v1/scan/device", "rev")).status).toBe(404);
    const home = ScannerHome.parse((await call("GET", "/v1/scan/device", "ops")).json);
    expect(home.event.id).toBe(EV);
    expect(home.operators.map((o) => o.role).sort()).toEqual(expect.arrayContaining(["Lead", "Operations", "Coordinator"]));
    expect(home.operators.some((o) => o.role === "Reviewer")).toBe(false);
    expect(home.operators.find((o) => o.id === "st_lead")?.pinSet).toBe(false);
  });

  test("five wrong PINs lock that person's PIN; the right one then waits too; another person still signs in", async () => {
    const pad = { ...jar.coord };
    jar.guess = { scanner: pad.scanner };
    for (let i = 0; i < 5; i++) expect((await call("POST", "/v1/scan/device/signin", "guess", { staffId: "st_coord1", pin: "111112" })).status).toBe(401);
    const locked = await call("POST", "/v1/scan/device/signin", "guess", { staffId: "st_coord1", pin: "602318" });
    expect(locked.status).toBe(429);
    expect(message(locked)).toMatch(/locked/);
    await db.scannerPin.update({ where: { userId: demoUserId("st_coord1") }, data: { lockedUntil: null } });
    const ok = await call("POST", "/v1/scan/device/signin", "ops", { staffId: "st_ops1", pin: "480913" });
    expect(ok.status).toBe(200);
    expect(ScannerHome.parse(ok.json).signedIn?.name).toBeTruthy();
    expect((await call("POST", "/v1/scan/device/signin", "coord", { staffId: "st_coord1", pin: "602318" })).status).toBe(200);
  });

  test("a scanner's session opens nothing but scanning", async () => {
    expect(message(await call("GET", `/v1/dealroom/${EV}/applications`, "ops"))).toMatch(/only scans/);
    expect((await call("GET", "/v1/session", "ops")).status).toBe(403);
    expect((await call("GET", `/v1/scan/ev_other/badges`, "ops")).status).toBe(403);
  });

  test("the badge list, and 304 when it hasn't changed", async () => {
    const r = await call("GET", `/v1/scan/${EV}/badges`, "ops");
    const list = BadgeList.parse(r.json);
    expect(list.day).toBe(DAY);
    expect(list.badges.find((b) => b.code === fresh)).toMatchObject({ accredited: false, revoked: false, arrivedAt: null });
    expect(list.badges.find((b) => b.code === revoked)?.revoked).toBe(true);
    expect((await call("GET", `/v1/scan/${EV}/badges`, "ops", undefined, { "If-None-Match": r.headers.get("etag")! })).status).toBe(304);
  });

  test("the first scan accredits and records the arrival; the same scan again changes nothing; a later one says so", async () => {
    const id = randomUUID();
    const first = ScanResults.parse((await scan("ops", fresh.toLowerCase(), { id })).json);
    expect(first.results[0]).toMatchObject({ verdict: "allow", outcome: "accredited", reason: "Accredited and checked in for day 2", duplicate: false });
    const d = await db.delegate.findFirstOrThrow({ where: { badge: { code: fresh } } });
    expect(d.accredited).toBe(true);
    expect((d.record as { checkIns: { day: number }[] }).checkIns.some((c) => c.day === 2)).toBe(true);
    // the audit log is append-only and outlives earlier runs: this scan's own entry
    expect(await db.auditEntry.count({ where: { entityId: d.id, action: "desk/accredit", detail: { path: ["scan"], equals: id } } })).toBe(1);
    const again = ScanResults.parse((await scan("ops", fresh, { id })).json);
    expect(again.results[0]).toMatchObject({ duplicate: true, verdict: "allow" });
    expect(await db.scan.count({ where: { id } })).toBe(1);
    const later = ScanResults.parse((await scan("ops", fresh)).json);
    expect(later.results[0]).toMatchObject({ outcome: "again", reason: "Already checked in today at 09:00" });
    expect(await db.arrival.count({ where: { delegateId: d.id } })).toBe(1);
    expect(later.summary).toMatchObject({ day: DAY, arrivedToday: expect.any(Number) });
  });

  test("an unknown or revoked badge is refused, and recorded as refused", async () => {
    expect(ScanResults.parse((await scan("ops", "EXC-DR-NOPE0000")).json).results[0]).toMatchObject({ verdict: "deny", outcome: "unknown" });
    expect(ScanResults.parse((await scan("ops", revoked)).json).results[0]).toMatchObject({ verdict: "deny", outcome: "revoked" });
    expect(await db.scan.count({ where: { code: revoked, verdict: "deny" } })).toBe(1);
  });

  test("two devices scanning one badge at once: one arrival; one id sent five times at once: one scan", async () => {
    const code = (await db.badge.findFirstOrThrow({ where: { eventId: EV, revokedAt: null, delegate: { accredited: false } }, orderBy: { code: "desc" } })).code;
    const all = await Promise.all(Array.from({ length: 10 }, (_, i) => scan(i % 2 ? "ops" : "coord", code)));
    const outcomes = all.map((r) => ScanResults.parse(r.json).results[0].outcome);
    expect(outcomes.filter((o) => o === "accredited")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "again")).toHaveLength(9);
    const delegateId = (await db.badge.findUniqueOrThrow({ where: { code } })).delegateId;
    expect(await db.arrival.count({ where: { delegateId } })).toBe(1);
    const id = randomUUID();
    const same = await Promise.all(Array.from({ length: 5 }, () => scan("ops", code, { id })));
    expect(same.every((r) => r.status === 200)).toBe(true);
    expect(await db.scan.count({ where: { id } })).toBe(1);
  });

  test("the offline queue: out of order, flagged offline, a device clock that is days out replaced by the server's", async () => {
    const code = (await db.badge.findFirstOrThrow({ where: { eventId: EV, revokedAt: null, delegate: { accredited: false } }, orderBy: { code: "asc" } })).code;
    const a = randomUUID();
    const b = randomUUID();
    const stale = randomUUID();
    const r = await call("POST", `/v1/scan/${EV}/scans`, "ops", {
      scans: [
        { id: b, code, at: new Date(clock.getTime() - 60_000).toISOString(), offline: true },
        { id: a, code, at: new Date(clock.getTime() - 5 * 60_000).toISOString(), offline: true },
        { id: stale, code: "EXC-DR-NOPE0000", at: new Date(clock.getTime() - 3 * 86_400_000).toISOString(), offline: true },
      ],
    });
    const res = ScanResults.parse(r.json).results;
    // answered in the order sent, decided in the order scanned
    expect(res.map((x) => x.id)).toEqual([b, a, stale]);
    expect(res[1].outcome).toBe("accredited");
    expect(res[0]).toMatchObject({ outcome: "again", reason: "Already checked in today at 08:55" });
    expect((await db.scan.findUniqueOrThrow({ where: { id: stale } })).scannedAt).toEqual(clock);
    expect((await db.scan.findUniqueOrThrow({ where: { id: a } })).offline).toBe(true);
  });

  test("retiring a device signs out whoever is on it", async () => {
    const devices = DevicesView.parse((await call("GET", `/v1/scan/${EV}/devices`, "lead")).json).devices;
    const phone = devices.find((d) => d.name === "Coordinator's phone")!;
    expect((await call("POST", `/v1/scan/${EV}/devices/${phone.id}/retire`, "lead")).status).toBe(204);
    expect((await call("GET", `/v1/scan/${EV}/badges`, "coord")).status).toBe(401);
    expect((await call("POST", "/v1/scan/device/signin", "coord", { staffId: "st_coord1", pin: "602318" })).status).toBe(404);
  });
});
