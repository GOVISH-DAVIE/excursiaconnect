/**
 * The Deal Room badge (M2.1): its holder reads it and corrects the name and title on it until the organiser locks
 * them for printing; no one else sees it; the desk corrects and reissues it, the old code leaving the badge table;
 * a revoked badge is stamped as revoked; the email about it opens the badge page.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { MyBadges, StaffBadge } from "@excursia/contracts/badge";
import { ErrorBody } from "@excursia/contracts/http";
import { ReviewView } from "@excursia/contracts/review";
import { createDb } from "@excursia/db";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { createSeedRepo } from "../src/modules/seed/seed.repo";
import { demoRows, demoUserId } from "../src/modules/seed/seed.service";
import { toInstant } from "../src/persistence/time";
import { hashToken, newToken } from "../src/security/secrets";

const WEB = "https://events.example.co.ke";
const SLUG = "connected-africa-3";
const EV = "ev_ca3";
const SEEKER = "dr_cs39";
const PROVIDER = "dr_fp18";
const run = Date.now().toString(36);

describe.skipIf(!process.env.TEST_DATABASE_URL)("the Deal Room badge", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 4);
  const seedRepo = createSeedRepo(db);
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: Buffer.alloc(32, 5).toString("base64") });
  const clock = toInstant("2027-02-10 09:00");
  let server: Server;
  let base = "";
  const cookies: Record<string, string> = {};
  const users: string[] = [];

  async function call(method: string, path: string, who: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Cookie: cookies[who], ...(method !== "GET" ? { Origin: WEB } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  }
  async function signedIn(userId: string) {
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId, createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 86_400_000), stepUpAt: clock } });
    return `sid=${token}`;
  }
  async function participant(who: string, email: string) {
    const u = await db.user.upsert({ where: { email }, create: { kind: "participant", email, name: who }, update: {} });
    users.push(u.id);
    cookies[who] = await signedIn(u.id);
  }
  const emailOf = async (appId: string) => (await db.drApplication.findUniqueOrThrow({ where: { id: appId }, select: { contactEmail: true } })).contactEmail!;
  const mine = async (who: string) => MyBadges.parse((await call("GET", `/v1/badges/${SLUG}`, who)).json);
  const desk = (appId: string, path = "") => `/v1/dealroom/${EV}/applications/${appId}/badge${path}`;
  const setLock = async (locked: boolean) => {
    const e = await db.event.findUniqueOrThrow({ where: { id: EV } });
    await db.event.update({ where: { id: EV }, data: { record: { ...(e.record as object), profileLocked: locked } } });
  };

  beforeAll(async () => {
    await seedRepo.replaceDemo(demoRows());
    for (const id of ["st_lead", "st_rev1", "st_coord1"]) cookies[id] = await signedIn(demoUserId(id));
    await participant("holder", await emailOf(SEEKER));
    await participant("provider", await emailOf(PROVIDER));
    await participant("stranger", `stranger.${run}@example.com`);
    const app = createApp({ config, db, mailer: memoryMailer(), now: () => clock, logError: (e) => console.error(e) });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await db.session.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users }, demo: false } });
    await seedRepo.removeDemo();
    await db.$disconnect();
  }, 60_000);

  test("its holder sees it, with the code in the badge table; no one else does", async () => {
    const [badge] = await mine("holder");
    expect(badge).toMatchObject({ appId: SEEKER, status: "valid", category: "Deal Room", locked: false, event: { name: expect.any(String) } });
    const row = await db.badge.findUniqueOrThrow({ where: { code: badge.code } });
    expect(row).toMatchObject({ delegateId: `d_dr_${SEEKER}`, revokedAt: null });
    expect(await mine("stranger")).toEqual([]);
    expect((await call("GET", `/v1/badges/${SLUG}`, "st_lead")).status).toBe(403);
    expect((await call("GET", `/v1/badges/${SLUG}`, "nobody")).status).toBe(401);
  });

  test("its holder corrects the name and title; someone else's is refused; the change is audited", async () => {
    const r = await call("PATCH", `/v1/badges/${SLUG}/${SEEKER}`, "holder", { name: "Ibrahim K. Boateng", jobTitle: "Founder and CEO" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ name: "Ibrahim K. Boateng", jobTitle: "Founder and CEO" });
    expect((await call("PATCH", `/v1/badges/${SLUG}/${SEEKER}`, "stranger", { name: "Someone Else", jobTitle: "" })).status).toBe(404);
    expect((await call("PATCH", `/v1/badges/${SLUG}/${SEEKER}`, "holder", { name: "I", jobTitle: "" })).status).toBe(400);
    expect(await db.auditEntry.findFirst({ where: { entity: "dr_application", entityId: SEEKER, action: "dr/badgeDetails" } })).toMatchObject({ actorKind: "applicant" });
  });

  test("locked for printing: the holder is refused with the reason, the desk is not, a reviewer never", async () => {
    await setLock(true);
    expect((await mine("holder"))[0].locked).toBe(true);
    const r = await call("PATCH", `/v1/badges/${SLUG}/${SEEKER}`, "holder", { name: "Ibrahim Boateng", jobTitle: "CEO" });
    expect(r.status).toBe(409);
    expect(ErrorBody.parse(r.json).error.message).toMatch(/locked for printing/);
    expect(StaffBadge.parse((await call("PATCH", desk(SEEKER), "st_coord1", { name: "Ibrahim Boateng", jobTitle: "CEO" })).json).name).toBe("Ibrahim Boateng");
    expect((await call("PATCH", desk(SEEKER), "st_rev1", { name: "Ibrahim B.", jobTitle: "CEO" })).status).toBe(409);
    await setLock(false);
  });

  test("reissued by the desk with a reason: a new code, the old one gone, the holder emailed to the badge page", async () => {
    const [before] = await mine("holder");
    expect((await call("POST", desk(SEEKER, "/reissue"), "st_rev1", { reason: "Lost" })).status).toBe(409);
    expect((await call("POST", desk(SEEKER, "/reissue"), "st_coord1", { reason: "" })).status).toBe(400);
    const r = await call("POST", desk(SEEKER, "/reissue"), "st_coord1", { reason: "Lost on the first morning" });
    expect(r.status).toBe(200);
    const after = StaffBadge.parse(r.json);
    expect(after.code).not.toBe(before.code);
    expect(await db.badge.findUnique({ where: { code: before.code } })).toBeNull();
    expect(await db.badge.findUniqueOrThrow({ where: { code: after.code } })).toMatchObject({ delegateId: `d_dr_${SEEKER}`, revokedAt: null });
    expect((await mine("holder"))[0].code).toBe(after.code);
    expect(await db.outboxMessage.findFirst({ where: { recipient: SEEKER, subject: "Your Deal Room badge was reissued: use the new one" } })).toMatchObject({ link: `/dr/${SEEKER}?badge=1` });
    // the lead's review page shows it, and that the lead may act on it
    const view = ReviewView.parse((await call("GET", `/v1/dealroom/${EV}/applications/${SEEKER}`, "st_lead")).json);
    expect(view.badge).toMatchObject({ code: after.code, status: "valid" });
    expect(view.can.badge).toBe(true);
    expect(ReviewView.parse((await call("GET", `/v1/dealroom/${EV}/applications/${SEEKER}`, "st_rev1")).json).can.badge).toBe(false);
  });

  test("revoked by a decision: stamped in the badge table, shown as revoked, and no longer changed", async () => {
    const [before] = await mine("provider");
    expect(before.status).toBe("valid");
    expect((await call("POST", `/v1/dealroom/${EV}/applications/${PROVIDER}/verification`, "st_lead", { outcome: "Declined", reason: "Sanctions match found on review" })).status).toBe(200);
    expect((await db.badge.findUniqueOrThrow({ where: { code: before.code } })).revokedAt).toBeInstanceOf(Date);
    expect((await mine("provider"))[0]).toMatchObject({ code: before.code, status: "revoked" });
    const r = await call("PATCH", `/v1/badges/${SLUG}/${PROVIDER}`, "provider", { name: "Ruth Diallo", jobTitle: "Partner" });
    expect(r.status).toBe(409);
    expect(ErrorBody.parse(r.json).error.message).toBe("This badge is revoked");
  });
});
