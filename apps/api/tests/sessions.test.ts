/**
 * Sessions (M3.3), through the API: the team's board and who may see it; planning refused with its reasons; an
 * invitation answered from the participant's schedule, which then holds their time in the database too, so no
 * meeting is booked over it and the session can't be moved onto a meeting of theirs; a cancellation needs a reason
 * and frees the time; attendance and outcomes on the day.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ErrorBody } from "@excursia/contracts/http";
import { MyMeetings } from "@excursia/contracts/meetings";
import { InviteOptions, SessionRow, SessionsBoard } from "@excursia/contracts/sessions";
import { createDb } from "@excursia/db";
import { acceptProblems } from "@excursia/domain/dealroom/sessions";
import { seed } from "@excursia/domain/seed";
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
const dr = seed.dealRoom;

/** A session ahead with invitees still to answer: one of them is free to accept. */
const ahead = dr.sessions.find((s) => s.id === "ses_09")!;
const guest = ahead.invitees.find((id) => !ahead.responses[id] && !acceptProblems(dr, ahead, id).length)!;
/** Someone with no part in that session. */
const outsider = dr.apps.find((a) => a.type === "seeker" && a.id !== ahead.host && !ahead.invitees.includes(a.id) && a.contact?.email)!;
/** The session under way at the clock, for attendance and outcomes. */
const live = dr.sessions.find((s) => s.id === "ses_06")!;

describe.skipIf(!process.env.TEST_DATABASE_URL)("sessions", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 4);
  const seedRepo = createSeedRepo(db);
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: Buffer.alloc(32, 7).toString("base64") });
  const clock = toInstant(dr.clock);
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
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  }
  const reason = (r: { json: unknown }) => ErrorBody.parse(r.json).error.message;
  async function signedIn(userId: string) {
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId, createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 86_400_000), stepUpAt: clock } });
    return `sid=${token}`;
  }
  async function participant(who: string, appId: string) {
    const email = (await db.drApplication.findUniqueOrThrow({ where: { id: appId }, select: { contactEmail: true } })).contactEmail!;
    const u = await db.user.upsert({ where: { email }, create: { kind: "participant", email, name: who }, update: {} });
    users.push(u.id);
    cookies[who] = await signedIn(u.id);
  }
  const T = `/v1/sessions/${EV}`;
  const mine = async (who: string) => MyMeetings.parse((await call("GET", `/v1/my-meetings/${SLUG}`, who)).json);
  const busyFor = (sessionId: string) => db.$queryRaw<{ key: string; active: boolean }[]>`select key, active from dr_busy where source_id = ${sessionId} order by key`;

  beforeAll(async () => {
    await seedRepo.replaceDemo(demoRows());
    for (const id of ["st_lead", "st_rev1", "st_ops1", "st_coord1", "st_mom1"]) cookies[id] = await signedIn(demoUserId(id));
    await participant("guest", guest);
    await participant("host", ahead.host!);
    await participant("stranger", outsider.id);
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

  test("the board: sessions with their rooms by name and people; the coordinator plans, a reviewer records, oversight is refused", async () => {
    const b = SessionsBoard.parse((await call("GET", T, "st_coord1")).json);
    expect(b.rooms).toEqual([
      { id: "r_dr8", name: "Presentation area" },
      { id: "r_dr9", name: "Roundtable room" },
    ]);
    expect(b.sessions.find((s) => s.id === live.id)).toMatchObject({ phase: "In progress", room: "Roundtable room" });
    expect(b.can).toEqual({ plan: true, attend: true, outcome: true });
    expect(SessionsBoard.parse((await call("GET", T, "st_rev1")).json).can).toEqual({ plan: false, attend: true, outcome: true });
    const o = await call("GET", T, "st_mom1");
    expect(o.status).toBe(403);
    expect(reason(o)).toBe("Your role, Oversight, doesn't work with sessions.");
    expect((await call("GET", T, "guest")).status).toBe(403);
  });

  test("planning says why it can't, then plans; a reviewer can't plan", async () => {
    const draft = { format: "Deal advisory and readiness clinic", title: "Data-room clinic", start: "2027-02-18 16:00", end: "2027-02-18 17:00", roomId: "r_dr9", host: null, track: null };
    expect(reason(await call("POST", T, "st_coord1", { ...draft, title: " " }))).toBe("Give it a title");
    expect(reason(await call("POST", T, "st_coord1", { ...draft, format: "Investment opportunity presentation" }))).toBe("This format needs a host");
    expect(reason(await call("POST", T, "st_coord1", { ...draft, start: "2027-02-18 09:45", end: "2027-02-18 10:15" }))).toMatch(/^The room holds "/);
    expect(reason(await call("POST", T, "st_rev1", draft))).toBe("Your role doesn't plan sessions");
    const made = SessionRow.parse((await call("POST", T, "st_coord1", draft)).json);
    expect(made).toMatchObject({ title: "Data-room clinic", phase: "Planned", room: "Roundtable room", host: null, people: [] });
    expect(await db.auditEntry.count({ where: { entity: "dr_session", entityId: made.id, action: "dr/sessionSave" } })).toBe(1);
    // its room is held in the database
    expect((await busyFor(made.id)).map((b) => b.key)).toEqual(["room:r_dr9:0"]);
    const options = InviteOptions.parse((await call("GET", `${T}/${made.id}/invitable`, "st_coord1")).json);
    expect(options.length).toBeGreaterThan(10);
    const invited = SessionRow.parse((await call("POST", `${T}/${made.id}/invite`, "st_coord1", { appIds: options.slice(0, 2).map((x) => x.id) })).json);
    expect(invited.counts).toMatchObject({ waiting: 2, accepted: 0 });
    for (const x of options.slice(0, 2)) expect(await db.outboxMessage.findFirst({ where: { recipient: x.id, subject: { startsWith: "Invitation: Data-room clinic" } } })).toMatchObject({ link: `/dr/${x.id}?tab=Programme` });
  });

  test("an invited participant sees it in their schedule and accepts, and the database holds their time", async () => {
    const s = (await mine("guest")).sessions.find((x) => x.id === ahead.id)!;
    expect(s).toMatchObject({ role: "invited", answer: null, can: { accept: true, decline: true }, blocked: null });
    expect((await mine("stranger")).sessions.some((x) => x.id === ahead.id)).toBe(false);
    expect((await call("POST", `/v1/my-meetings/${SLUG}/sessions/${ahead.id}/respond`, "stranger", { answer: "Accepted" })).status).toBe(404);
    const after = MyMeetings.parse((await call("POST", `/v1/my-meetings/${SLUG}/sessions/${ahead.id}/respond`, "guest", { answer: "Accepted" })).json);
    expect(after.sessions.find((x) => x.id === ahead.id)).toMatchObject({ answer: "Accepted", can: { accept: false, decline: true } });
    expect(reason(await call("POST", `/v1/my-meetings/${SLUG}/sessions/${ahead.id}/respond`, "guest", { answer: "Accepted" }))).toBe("You've already accepted");
    expect((await busyFor(ahead.id)).map((b) => b.key)).toContain(`app:${guest}`);
    // the host sees the session they host
    expect((await mine("host")).sessions.find((x) => x.id === ahead.id)).toMatchObject({ role: "host", can: { accept: false, decline: false } });
  });

  test("a session can't be moved onto a meeting of someone who accepted it", async () => {
    const board = SessionsBoard.parse((await call("GET", T, "st_coord1")).json);
    const session = board.sessions.find((x) => x.id === ahead.id)!;
    const people = new Set(session.people.filter((p) => p.answer === "Accepted").map((p) => p.id));
    const meeting = dr.meetings.find((m) => m.status === "Confirmed" && m.start > dr.clock && m.start.slice(0, 10) !== ahead.start.slice(0, 10) && dr.matches.some((x) => x.id === m.matchId && (people.has(x.seekerId) || people.has(x.providerId))))!;
    expect(meeting).toBeDefined();
    const r = await call("PUT", `${T}/${ahead.id}`, "st_coord1", { format: ahead.format, title: ahead.title, start: meeting.start, end: meeting.end, roomId: ahead.roomId, host: ahead.host ?? null, track: ahead.track ?? null });
    expect(r.status).toBe(409);
    expect(reason(r)).toMatch(/accepted it and has a meeting/);
  });

  test("cancelling needs a reason, tells those it held, and frees their time", async () => {
    const target = dr.sessions.find((s) => s.id === "ses_16")!;
    expect(reason(await call("POST", `${T}/${target.id}/cancel`, "st_coord1", { reason: " " }))).toBe("Say why, for everyone attending");
    expect((await busyFor(target.id)).length).toBeGreaterThan(1);
    const done = SessionRow.parse((await call("POST", `${T}/${target.id}/cancel`, "st_coord1", { reason: "The host's flight was cancelled" })).json);
    expect(done).toMatchObject({ phase: "Cancelled", cancelled: { reason: "The host's flight was cancelled" } });
    expect(await busyFor(target.id)).toEqual([]);
    expect(await db.outboxMessage.count({ where: { recipient: target.host!, subject: { startsWith: `Cancelled: ${target.title}` } } })).toBe(1);
  });

  test("on the day: attendance for those in the session, and an outcome for each attendee with its next step", async () => {
    const someone = live.invitees.find((id) => live.responses[id]?.answer === "Accepted" && !live.attended.includes(id))!;
    expect(reason(await call("POST", `${T}/${live.id}/outcomes`, "st_ops1", { appId: someone, category: "Follow-up meeting", note: "Call next week" }))).toBe("Mark them present first");
    const present = SessionRow.parse((await call("POST", `${T}/${live.id}/attendance`, "st_ops1", { appId: someone, present: true })).json);
    expect(present.people.find((p) => p.id === someone)!.attended).toBe(true);
    expect(reason(await call("POST", `${T}/${live.id}/outcomes`, "st_ops1", { appId: someone, category: "Follow-up meeting", note: "" }))).toBe("Say what happens next, and who owns it");
    const out = SessionRow.parse((await call("POST", `${T}/${live.id}/outcomes`, "st_ops1", { appId: someone, category: "Follow-up meeting", note: "Call next week, the fund's partner owns it" })).json);
    expect(out.people.find((p) => p.id === someone)!.outcome).toMatchObject({ category: "Follow-up meeting" });
    const notThere = await call("POST", `${T}/${ahead.id}/attendance`, "st_ops1", { appId: guest, present: true });
    expect(reason(notThere)).toBe("Attendance opens half an hour before the start, on the day");
  });
});
