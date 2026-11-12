/**
 * M0.5: the write path end to end, through the real app and the test database. Assigning a reviewer goes route →
 * controller → service (runCommand: team check, event lock, ownership, the prototype's own rule, save, audit) →
 * repository, and every refusal leaves the database as it was.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ErrorBody } from "@excursia/contracts/http";
import { ApplicationSummary, TeamView } from "@excursia/contracts/dealroom";
import { createDb } from "@excursia/db";
import { seed } from "@excursia/domain/seed";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { createSeedRepo } from "../src/modules/seed/seed.repo";
import { demoRows, demoUserId } from "../src/modules/seed/seed.service";
import { hashToken, newToken } from "../src/security/secrets";
import { json } from "../src/modules/events/events.mapper";

const WEB = "https://events.example.co.ke";
const EV = "ev_ca3";
const OTHER = "ev_dr_other";

describe.skipIf(!process.env.TEST_DATABASE_URL)("the Deal Room's write path", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 6);
  const seedRepo = createSeedRepo(db);
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: Buffer.alloc(32, 3).toString("base64") });
  let server: Server;
  let base = "";
  const cookies: Record<string, string> = {};
  let participantId = "";

  /** A signed-in session for a user, as if they had just finished signing in. */
  async function signedIn(userId: string, opts: { pending?: boolean } = {}) {
    const token = newToken();
    const at = new Date();
    await db.session.create({
      data: { tokenHash: hashToken(token), userId, createdAt: at, lastSeenAt: at, expiresAt: new Date(at.getTime() + 3_600_000), stepUpAt: opts.pending ? null : at },
    });
    return `sid=${token}`;
  }

  async function call(method: string, path: string, who?: string, body?: unknown, origin = WEB) {
    const headers: Record<string, string> = {};
    if (who) headers.Cookie = cookies[who];
    if (method !== "GET") headers.Origin = origin;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  }
  const assign = (who: string, body: unknown, event = EV) => call("POST", `/v1/dealroom/${event}/applications/assign`, who, body);
  const row = (id: string) => db.drApplication.findUniqueOrThrow({ where: { id }, select: { assigneeId: true, version: true, record: true } });
  const audits = (id: string) => db.auditEntry.count({ where: { entity: "dr_application", entityId: id } });

  beforeAll(async () => {
    await seedRepo.replaceDemo(demoRows());

    // another organiser's Deal Room, with one application, that this event's team must not reach
    const cfg = { ...seed.dealRoom.configs[EV], eventId: OTHER };
    const app = { ...seed.dealRoom.apps.find((a) => a.id === "dr_cs12")!, id: "dr_other1", eventId: OTHER, assignee: undefined };
    await db.organiser.create({ data: { id: "org_dr_other", name: "Another organiser", demo: true, record: json({ id: "org_dr_other", name: "Another organiser" }) } });
    await db.event.create({
      data: { id: OTHER, organiserId: "org_dr_other", slug: "dr-other-test", name: "Another summit", startDate: new Date("2027-03-01"), endDate: new Date("2027-03-02"), state: "Live", demo: true, record: json({ id: OTHER }) },
    });
    await db.drConfig.create({ data: { eventId: OTHER, record: json({ config: cfg, grants: [], adminLog: [] }) } });
    await db.drApplication.create({ data: { id: "dr_other1", eventId: OTHER, type: "seeker", status: "Submitted", record: json(app) } });

    for (const id of ["st_lead", "st_rev2", "st_ops1"]) cookies[id] = await signedIn(demoUserId(id));
    cookies.pending = await signedIn(demoUserId("st_rev1"), { pending: true });
    const participant = await db.user.create({ data: { kind: "participant", email: `applicant-${Date.now()}@dr.example`, name: "Applicant" } });
    participantId = participant.id;
    cookies.applicant = await signedIn(participant.id);

    const app_ = createApp({ config, db, mailer: memoryMailer(), logError: (e) => console.error(e) });
    server = await new Promise<Server>((resolve) => {
      const s = app_.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await seedRepo.removeDemo(); // the other organiser's event is demo-flagged, so it goes too
    await db.user.delete({ where: { id: participantId } });
    await db.$disconnect();
  }, 60_000);

  test("the lead sees their team and may assign", async () => {
    const team = TeamView.parse((await call("GET", `/v1/dealroom/${EV}/team`, "st_lead")).json);
    expect(team.me).toMatchObject({ id: "st_lead", role: "Lead" });
    expect(team.event).toEqual({ id: EV, name: "Connected Africa 3.0" });
    expect(team.canAssign).toBe(true);
    expect(team.staff.find((s) => s.id === "st_ops1")?.canReview).toBe(false);
    expect(team.staff.find((s) => s.id === "st_rev2")?.canReview).toBe(true);
  });

  test("the queue lists submitted work, and filters by assignee", async () => {
    const all = (await call("GET", `/v1/dealroom/${EV}/applications`, "st_lead")).json.map((a: unknown) => ApplicationSummary.parse(a));
    expect(all.length).toBeGreaterThan(20);
    expect(all.some((a: ApplicationSummary) => a.status === "Draft")).toBe(false);
    // each says its registration pathway, worked out for records made before pathways were stored
    const pathways = new Set(all.map((a: ApplicationSummary) => a.pathway));
    for (const p of ["seeker", "capital", "partner", "challenge"]) expect(pathways).toContain(p);
    expect(all.every((a: ApplicationSummary) => (a.type === "seeker") === (a.pathway === "seeker"))).toBe(true);
    const none = (await call("GET", `/v1/dealroom/${EV}/applications?assignee=none`, "st_lead")).json;
    expect(none.every((a: ApplicationSummary) => a.assigneeId === null)).toBe(true);
    expect(none.map((a: ApplicationSummary) => a.id)).toContain("dr_cs12");
  });

  test("assigning saves the rule's result, bumps the version and audits each record", async () => {
    const [v12, v13, v14] = await Promise.all(["dr_cs12", "dr_cs13", "dr_cs14"].map(row));
    const before = await audits("dr_cs12");
    const r = await assign("st_lead", { appIds: ["dr_cs12", "dr_cs13"], staffId: "st_rev2" });
    expect(r.status).toBe(200);
    expect(r.json.map((a: ApplicationSummary) => [a.id, a.assigneeId]).sort()).toEqual([
      ["dr_cs12", "st_rev2"],
      ["dr_cs13", "st_rev2"],
    ]);

    const [a12, a13, a14] = await Promise.all(["dr_cs12", "dr_cs13", "dr_cs14"].map(row));
    expect(a12.assigneeId).toBe("st_rev2");
    expect(a12.version).toBe(v12.version + 1);
    expect(a13.version).toBe(v13.version + 1);
    expect(a14.version).toBe(v14.version); // untouched records aren't rewritten
    const history = (a12.record as { history: { what: string; by: string }[] }).history;
    expect(history.at(-1)).toMatchObject({ by: "st_lead", what: expect.stringMatching(/^Assigned to /) });

    expect(await audits("dr_cs12")).toBe(before + 1);
    const entry = await db.auditEntry.findFirstOrThrow({ where: { entity: "dr_application", entityId: "dr_cs12" }, orderBy: { at: "desc" } });
    expect(entry).toMatchObject({ actorKind: "staff", actorId: demoUserId("st_lead"), eventId: EV, action: "dr/assign" });
    expect(entry.detail).toMatchObject({ appIds: ["dr_cs12", "dr_cs13"], staffId: "st_rev2" });
  });

  test("a reviewer may not assign: the rule's own reason, and nothing written", async () => {
    const before = await row("dr_cs15");
    const r = await assign("st_rev2", { appIds: ["dr_cs15"], staffId: "st_rev2" });
    expect(r.status).toBe(409);
    expect(ErrorBody.parse(r.json).error.message).toBe("Your role cannot assign reviewers");
    expect(await row("dr_cs15")).toEqual(before);
  });

  test("operations staff can't be given applications to review", async () => {
    const r = await assign("st_lead", { appIds: ["dr_cs15"], staffId: "st_ops1" });
    expect(r.status).toBe(409);
    expect(ErrorBody.parse(r.json).error.message).toBe("That person cannot review applications");
  });

  test("another organiser's application is refused, through either event", async () => {
    const viaOurs = await assign("st_lead", { appIds: ["dr_cs12", "dr_other1"], staffId: "st_rev2" });
    expect(viaOurs.status).toBe(404);
    expect(ErrorBody.parse(viaOurs.json).error.message).toContain("dr_other1");
    const viaTheirs = await assign("st_lead", { appIds: ["dr_other1"], staffId: "st_rev2" }, OTHER);
    expect(viaTheirs.status).toBe(403);
    expect((await call("GET", `/v1/dealroom/${OTHER}/applications`, "st_lead")).status).toBe(403);
    expect((await row("dr_other1")).assigneeId).toBeNull();
  });

  test("an applicant, a half-finished staff sign-in and nobody are all refused", async () => {
    expect((await call("GET", `/v1/dealroom/${EV}/applications`, "applicant")).status).toBe(403);
    expect((await assign("applicant", { appIds: ["dr_cs12"], staffId: "st_rev2" })).status).toBe(403);
    expect((await call("GET", `/v1/dealroom/${EV}/applications`, "pending")).status).toBe(401);
    expect((await call("GET", `/v1/dealroom/${EV}/applications`)).status).toBe(401);
  });

  test("a write from another site is refused before anything runs", async () => {
    const r = await call("POST", `/v1/dealroom/${EV}/applications/assign`, "st_lead", { appIds: ["dr_cs12"], staffId: "st_rev4" }, "https://evil.example");
    expect(r.status).toBe(403);
    expect((await row("dr_cs12")).assigneeId).toBe("st_rev2");
  });

  test("a bad request names the field", async () => {
    const r = await assign("st_lead", { appIds: [], staffId: "st_rev2" });
    expect(r.status).toBe(400);
    expect(ErrorBody.parse(r.json).error.fields).toEqual(["appIds"]);
  });

  test("ten assignments at once are applied one after another, none lost", async () => {
    const before = await row("dr_cs13");
    const auditsBefore = await audits("dr_cs13");
    const reviewers = ["st_rev1", "st_rev2", "st_rev3", "st_rev4"];
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => assign("st_lead", { appIds: ["dr_cs13"], staffId: reviewers[i % 4] })));
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
    const after = await row("dr_cs13");
    // a reassignment to the same reviewer changes only the history, still a write: every one counted
    expect(after.version).toBe(before.version + 10);
    expect(await audits("dr_cs13")).toBe(auditsBefore + 10);
    const assigned = (after.record as { history: { what: string }[] }).history.filter((h) => h.what.startsWith("Assigned to"));
    expect(assigned.length).toBeGreaterThanOrEqual(11);
  }, 30_000);
});
