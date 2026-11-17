/**
 * The live board (M3.4), through the API: who may see it; two staff phones polling with the board's version agree
 * within the poll after any change (an outcome on one, an arrival at the desk), and are told "nothing changed"
 * (304) otherwise; an outcome sent twice is recorded once; a no-show's slot goes to a pair waiting for one; the
 * 19:00 report goes to the lead once.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ErrorBody } from "@excursia/contracts/http";
import { LiveBoard } from "@excursia/contracts/live";
import { createDb } from "@excursia/db";
import { seed } from "@excursia/domain/seed";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { dailyReports } from "../src/modules/live";
import { createSeedRepo } from "../src/modules/seed/seed.repo";
import { demoRows, demoUserId } from "../src/modules/seed/seed.service";
import { toDay, toInstant } from "../src/persistence/time";
import { hashToken, newToken } from "../src/security/secrets";

const WEB = "https://events.example.co.ke";
const EV = "ev_ca3";
const dr = seed.dealRoom;
const today = dr.clock.slice(0, 10);

describe.skipIf(!process.env.TEST_DATABASE_URL)("the live board", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 4);
  const seedRepo = createSeedRepo(db);
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: Buffer.alloc(32, 7).toString("base64") });
  let clock = toInstant(dr.clock);
  let server: Server;
  let base = "";
  const cookies: Record<string, string> = {};

  async function call(method: string, path: string, who: string, body?: unknown, etag?: string) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Cookie: cookies[who] ?? "", ...(method !== "GET" ? { Origin: WEB } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(etag ? { "If-None-Match": etag } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, etag: res.headers.get("etag"), json: text ? JSON.parse(text) : undefined };
  }
  const reason = (r: { json: unknown }) => ErrorBody.parse(r.json).error.message;
  async function signedIn(userId: string) {
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId, createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 86_400_000), stepUpAt: clock } });
    return `sid=${token}`;
  }
  const L = `/v1/live/${EV}`;
  const board = async (who: string) => {
    const r = await call("GET", L, who);
    return { board: LiveBoard.parse(r.json), etag: r.etag! };
  };

  beforeAll(async () => {
    await seedRepo.replaceDemo(demoRows());
    // two phones of the same team: operations, and a coordinator
    for (const id of ["st_ops1", "st_coord1", "st_mom1", "st_lead"]) cookies[id] = await signedIn(demoUserId(id));
    const app = createApp({ config, db, mailer: memoryMailer(), now: () => clock, logError: (e) => console.error(e) });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await seedRepo.removeDemo();
    await db.$disconnect();
  }, 60_000);

  test("the board for today: every meeting with its room and who has checked in; oversight is refused", async () => {
    const { board: b } = await board("st_ops1");
    expect(b).toMatchObject({ day: today, inSummit: true });
    expect(b.counts.live).toBeGreaterThan(0);
    expect(b.meetings.every((m) => m.start.startsWith(today))).toBe(true);
    expect(b.meetings.find((m) => m.where.startsWith("Boardroom"))).toBeDefined();
    expect(b.closeOut.checklist.length).toBeGreaterThan(0);
    const o = await call("GET", L, "st_mom1");
    expect(o.status).toBe(403);
    expect(reason(o)).toBe("Your role, Oversight, doesn't run the live board.");
  });

  test("two phones agree: unchanged, a poll is answered 304; after an outcome on one, the other's next poll has it", async () => {
    const a = await board("st_ops1");
    const b = await board("st_coord1");
    expect(a.etag).toBe(b.etag);
    expect((await call("GET", L, "st_coord1", undefined, b.etag)).status).toBe(304);
    const target = a.board.meetings.find((m) => m.can.record && m.status === "In progress")!;
    const t0 = Date.now();
    const after = LiveBoard.parse(
      (await call("POST", `${L}/${target.id}/outcome`, "st_ops1", { attendance: "Held", outcome: { category: "Follow-up meeting", nextAction: "Send the term sheet", owner: "st_lead", due: "2027-02-23" }, clientId: "phone-a-1" })).json,
    );
    expect(after.meetings.find((m) => m.id === target.id)!.status).toBe("Held");
    const poll = await call("GET", L, "st_coord1", undefined, b.etag);
    expect(poll.status).toBe(200);
    expect(LiveBoard.parse(poll.json).meetings.find((m) => m.id === target.id)).toMatchObject({ status: "Held", outcome: { category: "Follow-up meeting", owner: dr.staff.find((x) => x.id === "st_lead")!.name } });
    // the change and the other phone's next poll, well inside the 5 seconds: one 3-second poll is the most it waits
    expect(Date.now() - t0).toBeLessThan(2_000);
    // the same record again (a retry, a double tap) changes nothing
    const again = await call("POST", `${L}/${target.id}/outcome`, "st_ops1", { attendance: "Held", outcome: { category: "No fit" }, clientId: "phone-a-1" });
    expect(again.status).toBe(200);
    expect(LiveBoard.parse(again.json).meetings.find((m) => m.id === target.id)!.outcome!.category).toBe("Follow-up meeting");
    expect(await db.drOpportunity.count({ where: { eventId: EV, record: { path: ["meetingId"], equals: target.id } } })).toBe(1);
  });

  test("a check-in at the desk shows on every phone at the next poll", async () => {
    const a = await board("st_coord1");
    const m = a.board.meetings.find((x) => x.status === "Confirmed" && (!x.seeker.arrived || !x.provider.arrived))!;
    const side = m.seeker.arrived ? m.provider : m.seeker;
    const delegateId = dr.apps.find((x) => x.id === side.id)!.delegateId!;
    await db.arrival.create({ data: { delegateId, day: toDay(today), eventId: EV, at: clock, userId: demoUserId("st_ops1"), deviceId: "dev_test" } });
    const poll = await call("GET", L, "st_coord1", undefined, a.etag);
    expect(poll.status).toBe(200);
    const seen = LiveBoard.parse(poll.json).meetings.find((x) => x.id === m.id)!;
    expect((side.id === m.seeker.id ? seen.seeker : seen.provider).arrived).toBe(dr.clock);
  });

  test("an outcome on record says why it isn't replaced, and a no-show's slot goes to a pair waiting for one", async () => {
    const { board: b } = await board("st_ops1");
    const held = b.meetings.find((m) => m.status === "Held")!;
    expect(reason(await call("POST", `${L}/${held.id}/outcome`, "st_ops1", { attendance: "Held", outcome: { category: "No fit" }, clientId: "phone-a-2" }))).toBe(
      "This meeting already has an outcome: give the reason the paper sheet replaces it",
    );
    const noShow = b.meetings.find((m) => m.status === "No-show" && m.can.refill)!;
    expect(noShow.refill.length).toBeGreaterThan(0);
    const before = b.meetings.length;
    const after = LiveBoard.parse((await call("POST", `${L}/${noShow.id}/refill`, "st_ops1", { matchId: noShow.refill[0].matchId })).json);
    expect(after.meetings.length).toBe(before + 1);
    expect(after.meetings.some((m) => m.status === "Proposed" || m.status === "Confirmed")).toBe(true);
  });

  test("the 19:00 report goes to the lead once a summit evening", async () => {
    const reports = dailyReports({ db, now: () => clock });
    expect(await reports()).toBe(0); // 10:40: not yet
    clock = toInstant(`${today} 19:02`);
    expect(await reports()).toBe(1);
    expect(await reports()).toBe(0);
    expect(await db.outboxMessage.findFirst({ where: { recipient: "st_lead", subject: { startsWith: "Daily Deal Room report" } }, orderBy: { createdAt: "desc" } })).toMatchObject({ link: `/dealroom/reports?day=${today}` });
    // a staff sign-in goes idle after 30 minutes: the lead signs in again at the evening's clock
    cookies.st_lead = await signedIn(demoUserId("st_lead"));
    const { board: b } = await board("st_lead");
    expect(b.closeOut.reportSentAt).toBe(`${today} 19:02`);
    clock = toInstant(dr.clock);
  });
});
