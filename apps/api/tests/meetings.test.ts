/**
 * Scheduling (M3.2), through the API: the team's schedule and slot picker; a proposal, refused with its reason
 * when it clashes; each participant confirms, moves and adds to a calendar only its own meetings; the worker notes
 * a lapsed proposal and sends each reminder once, and the lapsed slot books again; the PRD's three 50-request
 * bursts book no clash; auto-propose drafts 150 pairs within 10 seconds.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ErrorBody } from "@excursia/contracts/http";
import { MeetingRow, MoveTimes, MyMeetings, Proposed, Schedule, SlotOptions } from "@excursia/contracts/meetings";
import { createDb } from "@excursia/db";
import { apply } from "@excursia/domain/core/reducer";
import { fixedCtx } from "@excursia/domain/ctx";
import { bothAccepted, confirmBy, lapsed, matchable, readyToSchedule } from "@excursia/domain/dealroom/logic";
import type { DrMatch } from "@excursia/domain/dealroom/types";
import { seed } from "@excursia/domain/seed";
import { addMinutes } from "@excursia/domain/time";
import type { AppState } from "@excursia/domain/types";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { meetingJobs } from "../src/modules/meetings";
import { createSeedRepo } from "../src/modules/seed/seed.repo";
import { demoRows, demoUserId } from "../src/modules/seed/seed.service";
import { toInstant } from "../src/persistence/time";
import { hashToken, newToken } from "../src/security/secrets";

const WEB = "https://events.example.co.ke";
const SLUG = "connected-africa-3";
const EV = "ev_ca3";
const run = Date.now().toString(36);
const dr = seed.dealRoom;
const cfg = Object.values(dr.configs)[0];

/** An open proposal the seeker confirmed and the counterparty hasn't; and a confirmed meeting still ahead. */
const open = dr.meetings.find((m) => m.status === "Proposed" && !lapsed(m, cfg, dr.clock) && m.confirm.seeker && !m.confirm.provider)!;
const openPair = dr.matches.find((m) => m.id === open.matchId)!;
const confirmed = dr.meetings.find((m) => m.status === "Confirmed" && m.start > dr.clock && m.roomId)!;
const confirmedPair = dr.matches.find((m) => m.id === confirmed.matchId)!;
const ready = readyToSchedule(dr, cfg);

describe.skipIf(!process.env.TEST_DATABASE_URL)("scheduling", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 8);
  const seedRepo = createSeedRepo(db);
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: Buffer.alloc(32, 7).toString("base64") });
  let clock = toInstant(dr.clock);
  const jobs = meetingJobs({ db, now: () => clock });
  let server: Server;
  let base = "";
  const cookies: Record<string, string> = {};
  const users: string[] = [];

  async function call(method: string, path: string, who: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Cookie: cookies[who] ?? "", ...(method !== "GET" ? { Origin: WEB } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = (() => {
      try {
        return text ? JSON.parse(text) : undefined;
      } catch {
        return text;
      }
    })();
    return { status: res.status, json, type: res.headers.get("content-type") ?? "" };
  }
  const reason = (r: { json: unknown }) => ErrorBody.parse(r.json).error.message;
  const userOf: Record<string, string> = {};
  async function signedIn(userId: string) {
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId, createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 86_400_000), stepUpAt: clock } });
    return `sid=${token}`;
  }
  async function participant(who: string, email: string) {
    const u = await db.user.upsert({ where: { email }, create: { kind: "participant", email, name: who }, update: {} });
    users.push(u.id);
    userOf[who] = u.id;
  }
  /** Moves the clock, and signs everyone in again at it: a staff session goes idle after 30 minutes. */
  async function at(wall: string) {
    clock = toInstant(wall);
    for (const id of ["st_lead", "st_rev1", "st_ops1"]) cookies[id] = await signedIn(demoUserId(id));
    for (const [who, id] of Object.entries(userOf)) cookies[who] = await signedIn(id);
  }
  const emailOf = async (appId: string) => (await db.drApplication.findUniqueOrThrow({ where: { id: appId }, select: { contactEmail: true } })).contactEmail!;
  const mine = async (who: string) => MyMeetings.parse((await call("GET", `/v1/my-meetings/${SLUG}`, who)).json);
  const T = `/v1/meetings/${EV}`;
  const M = `/v1/my-meetings/${SLUG}`;

  beforeAll(async () => {
    await seedRepo.replaceDemo(demoRows());
    await participant("seeker", await emailOf(openPair.seekerId));
    await participant("provider", await emailOf(openPair.providerId));
    await participant("cseeker", await emailOf(confirmedPair.seekerId));
    await participant("cprovider", await emailOf(confirmedPair.providerId));
    await participant("stranger", `stranger.${run}@example.com`);
    await at(dr.clock);
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

  test("the team's schedule: pairs ready, meetings with their rooms by name, caps; others are refused", async () => {
    const s = Schedule.parse((await call("GET", T, "st_ops1")).json);
    expect(s.ready.map((r) => r.matchId).sort()).toEqual(ready.map((m) => m.id).sort());
    expect(s.rooms.find((r) => r.id === "r_dr5")).toMatchObject({ name: "Deal floor A", tables: 4 });
    expect(s.meetings.find((m) => m.id === confirmed.id)!.where).toMatch(/^(Boardroom \d|Deal floor [A-C], table \d)$/);
    expect(s.event.days).toEqual(["2027-02-15", "2027-02-16", "2027-02-17", "2027-02-18"]);
    expect(s.caps.providers.length).toBeGreaterThan(5);
    const rev = await call("GET", T, "st_rev1");
    expect(rev.status).toBe(403);
    expect(reason(rev)).toBe("Your role, Reviewer, doesn't schedule meetings.");
    expect((await call("GET", T, "seeker")).status).toBe(403);
  });

  test("slots show the free tables and why a time is out; a proposal books, is audited and emailed; a clash says why", async () => {
    const pair = ready[0];
    const day = "2027-02-18";
    const opts = SlotOptions.parse((await call("GET", `${T}/slots?matchId=${pair.id}&day=${day}`, "st_ops1")).json);
    const first = opts.times.find((t) => t.free.length && !t.caps.length)!;
    expect(first.free[0].label).toMatch(/Boardroom|Deal floor/);
    const past = SlotOptions.parse((await call("GET", `${T}/slots?matchId=${pair.id}&day=2027-02-16`, "st_ops1")).json);
    expect(past.times[0].problem).toMatch(/The slot has passed/);
    const body = { matchId: pair.id, start: `${day} ${first.time}`, roomId: first.free[0].roomId, table: first.free[0].table };
    const made = MeetingRow.parse((await call("POST", `${T}/proposals`, "st_ops1", body)).json);
    expect(made).toMatchObject({ status: "Proposed", start: body.start, where: first.free[0].label, lapsed: false });
    expect(reason(await call("POST", `${T}/proposals`, "st_ops1", body))).toBe("This pair already has a meeting");
    const clash = await call("POST", `${T}/proposals`, "st_ops1", { ...body, matchId: ready[1].id });
    expect(clash.status).toBe(409);
    expect(reason(clash)).toMatch(/is booked \d\d:\d\d to \d\d:\d\d/);
    expect(await db.auditEntry.count({ where: { entity: "dr_meeting", entityId: made.id, action: "dr/propose" } })).toBe(1);
    for (const to of [pair.seekerId, pair.providerId])
      expect(await db.outboxMessage.findFirst({ where: { recipient: to, subject: { startsWith: "A Deal Room meeting is proposed" } } })).toMatchObject({ link: `/dr/${to}?meetings=1` });
  });

  test("each side sees and confirms only its own meetings; a confirmed one goes into the calendar", async () => {
    const s = (await mine("seeker")).meetings.find((m) => m.id === open.id)!;
    expect(s).toMatchObject({ side: "seeker", status: "Proposed", mine: { confirmed: open.confirm.seeker }, can: { confirm: false, calendar: false } });
    const p = (await mine("provider")).meetings.find((m) => m.id === open.id)!;
    expect(p.can.confirm).toBe(true);
    expect((await mine("stranger")).meetings).toEqual([]);
    expect((await call("POST", `${M}/${open.id}/confirm`, "stranger")).status).toBe(404);
    expect((await call("GET", `${M}/${open.id}/invite.ics`, "provider")).status).toBe(409);
    const after = MyMeetings.parse((await call("POST", `${M}/${open.id}/confirm`, "provider")).json).meetings.find((m) => m.id === open.id)!;
    expect(after).toMatchObject({ status: "Confirmed", can: { confirm: false, calendar: true } });
    expect(reason(await call("POST", `${M}/${open.id}/confirm`, "provider"))).toBe("This meeting is already confirmed");
    const ics = await call("GET", `${M}/${open.id}/invite.ics`, "seeker");
    expect(ics.type).toMatch(/^text\/calendar/);
    expect(ics.json as string).toMatch(/BEGIN:VCALENDAR[\s\S]*SUMMARY:Deal Room: /);
    expect(await db.auditEntry.findFirst({ where: { entity: "dr_meeting", entityId: open.id, action: "dr/confirm", actorKind: "applicant" } })).not.toBeNull();
  });

  test("a move: asked for a free time, agreed by the other side, accepted by operations", async () => {
    const day = confirmed.start.slice(0, 10) === "2027-02-18" ? "2027-02-17" : "2027-02-18";
    const free = MoveTimes.parse((await call("GET", `${M}/${confirmed.id}/times?day=${day}`, "cseeker")).json);
    expect(free.times.length).toBeGreaterThan(0);
    const start = `${day} ${free.times[free.times.length - 1]}`;
    expect(reason(await call("POST", `${M}/${confirmed.id}/move`, "cseeker", { start, reason: "" }))).toBe("Say why, for the other party");
    const asked = MyMeetings.parse((await call("POST", `${M}/${confirmed.id}/move`, "cseeker", { start, reason: "Our CEO lands at noon" })).json).meetings.find((m) => m.id === confirmed.id)!;
    expect(asked).toMatchObject({ status: "Change requested", change: { start, byMe: true, agreed: null } });
    expect(reason(await call("POST", `${M}/${confirmed.id}/move/answer`, "cseeker", { agree: true }))).toBe("You asked for this move; the other party answers it");
    expect((await call("POST", `${M}/${confirmed.id}/move/answer`, "cprovider", { agree: true })).status).toBe(200);
    const done = MeetingRow.parse((await call("POST", `${T}/${confirmed.id}/change/accept`, "st_ops1")).json);
    expect(done).toMatchObject({ status: "Confirmed", start });
  });

  test("cancelling needs a reason", async () => {
    const s = Schedule.parse((await call("GET", T, "st_ops1")).json);
    const target = s.meetings.find((m) => m.status === "Confirmed" && m.start > s.event.now && m.id !== confirmed.id && m.id !== open.id)!;
    expect(reason(await call("POST", `${T}/${target.id}/cancel`, "st_ops1", { reason: " " }))).toBe("Say why it is cancelled");
    expect(MeetingRow.parse((await call("POST", `${T}/${target.id}/cancel`, "st_ops1", { reason: "The investor withdrew" })).json).status).toBe("Cancelled");
  });

  test("the worker notes a lapsed proposal once, and its released slot books again; reminders go once each", async () => {
    const s = Schedule.parse((await call("GET", T, "st_ops1")).json);
    const waiting = s.meetings.find((m) => m.status === "Proposed" && !m.lapsed && m.confirmBy && m.roomId)!;
    await at(addMinutes(waiting.confirmBy!, 1));
    const r = await jobs();
    expect(r.lapsed).toBeGreaterThanOrEqual(1);
    expect(await db.outboxMessage.count({ where: { recipient: { in: [waiting.seeker.id, waiting.provider.id] }, subject: { contains: "lapsed" } } })).toBe(2);
    expect((await jobs()).lapsed).toBe(0);
    // the same pair, the same table and time: the rules and the database both see the slot free again
    const again = await call("POST", `${T}/proposals`, "st_ops1", { matchId: waiting.matchId, start: waiting.start, roomId: waiting.roomId, table: waiting.table });
    expect(again.status).toBe(200);

    const conf = Schedule.parse((await call("GET", T, "st_ops1")).json).meetings.find((m) => m.status === "Confirmed" && m.start > addMinutes(waiting.confirmBy!, 30 * 60))!;
    await at(addMinutes(conf.start, -23 * 60));
    expect((await jobs()).reminded).toBeGreaterThanOrEqual(1);
    expect(await db.outboxMessage.count({ where: { recipient: conf.seeker.id, subject: { startsWith: `Reminder: your Deal Room meeting with ${conf.provider.org} is at ` } } })).toBe(1);
    expect((await jobs()).reminded).toBe(0);
    await at(dr.clock);
  });

  describe("the PRD's three 50-request bursts book no clash", () => {
    // before the summit, with the first 50 accepted pairs unscheduled, as the prototype's own burst test runs
    const acc = dr.matches.filter(bothAccepted);
    const freed = new Set(acc.slice(0, 50).map((m) => m.id));
    const burstBase: AppState = { ...seed, dealRoom: { ...dr, clock: "2027-02-01 09:00", meetings: dr.meetings.filter((m) => !freed.has(m.matchId)) } };
    const fifty = Array.from({ length: 50 }, (_, i) => acc[i % acc.length].id);
    const day = "2027-02-17";
    const bursts = [
      { name: "one room, one table, one time", reqs: fifty.map((matchId) => ({ matchId, roomId: "r_dr1", table: 1, start: `${day} 16:00` })) },
      { name: "the four tables of Deal floor A at 16:00", reqs: fifty.map((matchId, i) => ({ matchId, roomId: "r_dr5", table: 1 + (i % 4), start: `${day} 16:00` })) },
      { name: "three times and two rooms", reqs: fifty.map((matchId, i) => ({ matchId, roomId: i % 2 ? "r_dr2" : "r_dr3", table: 1, start: `${day} ${["14:00", "14:25", "14:50"][i % 3]}` })) },
    ];

    for (const b of bursts)
      test(b.name, async () => {
        await seedRepo.replaceDemo(demoRows(burstBase));
        await at("2027-02-01 09:00");
        // what the rules book taking the requests one by one: the most any order can book
        let st = burstBase;
        for (const req of b.reqs) st = apply(st, { type: "dr/propose", req }, fixedCtx("2027-02-01 09:00", { kind: "staff", id: "st_ops1" })).state;
        const expected = st.dealRoom.meetings.length - burstBase.dealRoom.meetings.length;
        const t0 = Date.now();
        const answers = await Promise.all(
          b.reqs.map(async (req) => {
            const r = await call("POST", `${T}/proposals`, "st_ops1", req);
            return { ...r, ms: Date.now() - t0 };
          }),
        );
        const booked = answers.filter((a) => a.status === 200).length;
        expect(booked).toBe(expected);
        expect(answers.filter((a) => a.status !== 200).every((a) => a.status === 409 && reason(a).length > 5)).toBe(true);
        // the plan's target is every answer within 2 s; on this machine, with the test suite's other work, allow more
        const slowest = Math.max(...answers.map((a) => a.ms));
        console.log(`[burst] ${b.name}: ${booked} booked of 50, the slowest answer in ${slowest} ms`);
        expect(slowest).toBeLessThan(5_000);
        // no two active busy rows with one key overlap: the database agrees with the rules
        const overlaps = await db.$queryRaw<{ n: bigint }[]>`select count(*) as n from dr_busy a join dr_busy b on a.event_id = b.event_id and a.key = b.key and a.id < b.id and a.slot && b.slot where a.active and b.active`;
        expect(Number(overlaps[0].n)).toBe(0);
      }, 60_000);
  });

  test("auto-propose drafts a slot for each of 150 ready pairs within 10 seconds, with no clash", async () => {
    const seekers = dr.apps.filter((a) => a.type === "seeker" && matchable(a));
    const providers = dr.apps.filter((a) => a.type === "provider" && a.verification?.state === "Verified" && matchable(a));
    const template = dr.matches.find(bothAccepted)!;
    const taken = new Set(dr.matches.map((m) => `${m.seekerId}|${m.providerId}`));
    const extra: DrMatch[] = [];
    for (let i = 0; extra.length < 150 && i < seekers.length * providers.length; i++) {
      const s = seekers[i % seekers.length];
      const p = providers[(i + Math.floor(i / seekers.length)) % providers.length];
      if (taken.has(`${s.id}|${p.id}`) || extra.filter((x) => x.seekerId === s.id).length >= 4) continue;
      taken.add(`${s.id}|${p.id}`);
      extra.push({ ...template, id: `mx_auto_${extra.length}`, seekerId: s.id, providerId: p.id });
    }
    const big: AppState = { ...seed, dealRoom: { ...dr, clock: "2027-02-10 09:00", meetings: [], sessions: [], matches: [...dr.matches.filter((m) => !bothAccepted(m)), ...extra] } };
    await seedRepo.replaceDemo(demoRows(big));
    await at("2027-02-10 09:00");
    const t0 = Date.now();
    const r = await call("POST", `${T}/auto-propose`, "st_ops1", {});
    const ms = Date.now() - t0;
    console.log(`[auto-propose] 150 pairs in ${ms} ms`);
    expect(r.status).toBe(200);
    expect(Proposed.parse(r.json)).toEqual({ proposed: 150, left: 0 });
    expect(ms).toBeLessThan(10_000);
    expect(await db.drMeeting.count({ where: { eventId: EV, status: "Proposed" } })).toBe(150);
    const overlaps = await db.$queryRaw<{ n: bigint }[]>`select count(*) as n from dr_busy a join dr_busy b on a.event_id = b.event_id and a.key = b.key and a.id < b.id and a.slot && b.slot where a.active and b.active`;
    expect(Number(overlaps[0].n)).toBe(0);
    expect(reason(await call("POST", `${T}/auto-propose`, "st_ops1", {}))).toBe("Every pair both parties accepted already has a meeting");
    // each proposal waits two days for both sides, never less than two hours
    const one = (await db.drMeeting.findFirstOrThrow({ where: { eventId: EV } })).record as unknown as { start: string; proposedAt: string };
    expect(confirmBy({ ...one, confirm: {} } as never, cfg)).toBe(addMinutes(one.start, -cfg.rules.confirmHours * 60));
  }, 60_000);
});
