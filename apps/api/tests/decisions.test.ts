/**
 * M1.6, the second half of review, through the real app and the test database: recommendations and decisions with
 * their reasons, the second decider, conditions, readiness; and a provider's verification end to end, from the
 * applicant's KYC uploads and NDA to the team's checks, the verification and the Deal Room badge.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { MyApplication, UploadTarget } from "@excursia/contracts/apply";
import { ErrorBody } from "@excursia/contracts/http";
import { ReviewView } from "@excursia/contracts/review";
import { createDb } from "@excursia/db";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { createSeedRepo } from "../src/modules/seed/seed.repo";
import { demoRows, demoUserId } from "../src/modules/seed/seed.service";
import { deriveKeys, hashToken, newToken } from "../src/security/secrets";
import { createLocalStorage } from "../src/storage/local";
import { toInstant } from "../src/persistence/time";

const WEB = "https://events.example.co.ke";
const SLUG = "connected-africa-3";
const EV = "ev_ca3";
const run = Date.now().toString(36);
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(1500, 0x20)]);

type App = { status: string; decisions: { decision: string; needsSecond?: boolean; second?: object; conditions: { id: string; met?: object }[] }[]; recommendations: object[]; readiness: string; fee?: { amount: number }; delegateId?: string; decisionMaker: { confirmed?: object }; verification?: { state: string } };

describe.skipIf(!process.env.TEST_DATABASE_URL)("decisions and verification", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 6);
  const seedRepo = createSeedRepo(db);
  const secret = Buffer.alloc(32, 7).toString("base64");
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: secret, UPLOAD_MAX_MB: "1" });
  const clock = toInstant("2026-12-16 09:00");
  let server: Server;
  let base = "";
  let dir = "";
  const cookies: Record<string, string> = {};
  const users: string[] = [];

  async function signedIn(userId: string) {
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId, createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 86_400_000), stepUpAt: clock } });
    return `sid=${token}`;
  }
  async function call(method: string, path: string, who?: string, body?: unknown, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extra };
    if (who) headers.Cookie = cookies[who];
    if (method !== "GET") headers.Origin = WEB;
    if (body !== undefined && !Buffer.isBuffer(body)) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  }
  const one = (appId: string, path = "") => `/v1/dealroom/${EV}/applications/${appId}${path}`;
  const record = async (appId: string) => ((await db.drApplication.findUniqueOrThrow({ where: { id: appId } })).record as unknown) as App;
  const version = async (appId: string) => (await db.drApplication.findUniqueOrThrow({ where: { id: appId } })).version;
  const messageTo = (appId: string, subject: RegExp) => db.outboxMessage.findMany({ where: { recipient: appId } }).then((ms) => ms.filter((m) => subject.test(m.subject)));
  const errorOf = (r: { json: unknown }) => ErrorBody.parse(r.json).error;

  beforeAll(async () => {
    await seedRepo.replaceDemo(demoRows());
    dir = await mkdtemp(join(tmpdir(), "excursia-decisions-"));
    for (const id of ["st_lead", "st_rev1", "st_rev2", "st_rev3", "st_rev4", "st_ops1"]) cookies[id] = await signedIn(demoUserId(id));
    const storage = createLocalStorage({ dir, key: deriveKeys(secret).upload });
    const app = createApp({ config, db, mailer: memoryMailer(), now: () => clock, storage, logError: (e) => console.error(e) });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await db.file.deleteMany({ where: { eventId: EV } });
    await seedRepo.removeDemo();
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }, 60_000);

  describe("a capital seeker's decision", () => {
    // dr_cs20: in review, assigned to st_rev4 (who doesn't decide), asking USD 600,000: one decider settles it
    const id = "dr_cs20";

    test("the reviewer's view says who may decide, and when a second decider is needed", async () => {
      const v = ReviewView.parse((await call("GET", one(id), "st_rev4")).json);
      expect(v.can).toMatchObject({ review: true, decide: false, readiness: true });
      expect(v.config.secondReview).toEqual({ decline: true, askAbove: 10_000_000 });
      expect(ReviewView.parse((await call("GET", one(id), "st_rev1")).json).can.decide).toBe(true);
    });

    test("a reviewer without the right recommends; deciding is refused with the rule's reason", async () => {
      const refused = await call("POST", one(id, "/decisions"), "st_rev4", { decision: "Qualified", reason: "Strong fit" });
      expect(refused.status).toBe(409);
      expect(errorOf(refused).message).toBe("Your role cannot decide");
      expect((await call("POST", one(id, "/recommendations"), "st_rev4", { decision: "Conditional", reason: "Fit, once the audit is in" })).status).toBe(200);
      expect((await record(id)).recommendations).toHaveLength(1);
      expect((await call("POST", one(id, "/recommendations"), "st_rev4", { decision: "Qualified", reason: " " })).status).toBe(400);
    });

    test("a conditional decision needs a condition, due no earlier than today", async () => {
      expect((await call("POST", one(id, "/decisions"), "st_rev1", { decision: "Conditional", reason: "Fit" })).status).toBe(409);
      const past = await call("POST", one(id, "/decisions"), "st_rev1", { decision: "Conditional", reason: "Fit", conditions: [{ text: "Audited 2025 accounts", due: "2026-12-01" }] });
      expect(past.status).toBe(400);
      expect(errorOf(past).fields).toEqual(["conditions"]);
    });

    test("the decision takes effect: the applicant is told, and an approval asks for the fee before any badge", async () => {
      const r = await call("POST", one(id, "/decisions"), "st_rev1", { decision: "Conditional", reason: "Strong fit, once the audit is in", conditions: [{ text: "Audited 2025 accounts", due: "2027-01-15" }] });
      expect(r.status).toBe(200);
      const app = await record(id);
      expect(app).toMatchObject({ status: "Decided", fee: { amount: 250 } });
      expect(app.decisions.at(-1)).toMatchObject({ decision: "Conditional" });
      expect(app.delegateId).toBeUndefined();
      expect(await messageTo(id, /^A decision on your Deal Room application$/)).toHaveLength(1);
      expect(await messageTo(id, /pay the USD 250/)).toHaveLength(1);
      const audit = await db.auditEntry.findFirstOrThrow({ where: { entity: "dr_application", entityId: id }, orderBy: { id: "desc" } });
      expect(audit).toMatchObject({ actorKind: "staff", action: "dr/decide" });
    });

    test("conditions are met one by one; an unknown one is refused, and meeting one twice changes nothing", async () => {
      expect((await call("POST", one(id, "/conditions/cond_nope/met"), "st_rev4")).status).toBe(404);
      const cond = (await record(id)).decisions.at(-1)!.conditions[0];
      expect((await call("POST", one(id, `/conditions/${cond.id}/met`), "st_rev4")).status).toBe(200);
      expect((await record(id)).decisions.at(-1)!.conditions[0].met).toBeTruthy();
      const v = await version(id);
      expect((await call("POST", one(id, `/conditions/${cond.id}/met`), "st_rev4")).status).toBe(200);
      expect(await version(id)).toBe(v);
    });

    test("Deal Room Ready waits for the readiness scores and the decision-maker; then the applicant is told", async () => {
      const early = await call("POST", one(id, "/readiness"), "st_rev4", { readiness: "Deal Room Ready" });
      expect(early.status).toBe(409);
      expect(errorOf(early).message).toMatch(/^Not ready yet: .*Decision-maker not confirmed/);
      expect((await call("POST", one(id, "/decision-maker/confirm"), "st_rev4")).status).toBe(200);
      const v = ReviewView.parse((await call("GET", one(id), "st_rev4")).json);
      for (const c of v.config.rubric.readiness)
        expect((await call("POST", one(id, "/scores"), "st_rev4", { layer: "readiness", criterion: c.id, score: 70, note: "Seen at the pitch rehearsal" })).status).toBe(200);
      expect((await call("POST", one(id, "/readiness"), "st_rev4", { readiness: "Deal Room Ready" })).status).toBe(200);
      expect((await record(id)).readiness).toBe("Deal Room Ready");
      expect(await messageTo(id, /^You are Deal Room Ready$/)).toHaveLength(1);
      // operations staff don't set readiness
      expect((await call("POST", one(id, "/readiness"), "st_ops1", { readiness: "In preparation" })).status).toBe(403);
    });
  });

  test("a large ask needs a second, different decider; until then nothing takes effect or is sent", async () => {
    const id = "dr_cs17"; // USD 12 million, over the lead's 10 million
    expect((await call("POST", one(id, "/decisions"), "st_rev1", { decision: "Qualified", reason: "Bankable, strong sponsor" })).status).toBe(200);
    let app = await record(id);
    expect(app.status).toBe("In review");
    expect(app.decisions.at(-1)).toMatchObject({ needsSecond: true });
    expect(await messageTo(id, /^A decision on your Deal Room application$/)).toHaveLength(0);
    const self = await call("POST", one(id, "/decisions/confirm"), "st_rev1");
    expect(self.status).toBe(409);
    expect(errorOf(self).message).toBe("The second decider must be a different person");
    expect((await call("POST", one(id, "/decisions/confirm"), "st_rev2")).status).toBe(409); // st_rev2 doesn't decide
    expect((await call("POST", one(id, "/decisions/confirm"), "st_lead")).status).toBe(200);
    app = await record(id);
    expect(app.status).toBe("Decided");
    expect(app.decisions.at(-1)!.second).toBeTruthy();
    expect(await messageTo(id, /^A decision on your Deal Room application$/)).toHaveLength(1);
  });

  test("every decline waits for a second decider too", async () => {
    const id = "dr_cs21";
    expect((await call("POST", one(id, "/decisions"), "st_lead", { decision: "Declined", reason: "Outside the missions" })).status).toBe(200);
    expect((await record(id)).status).toBe("In review");
    expect((await call("POST", one(id, "/decisions/confirm"), "st_rev3")).status).toBe(200);
    expect((await record(id)).status).toBe("Decided");
  });

  describe("a capital provider's verification, end to end", () => {
    let id = "";
    let email = "";
    const mine = (path = "") => `/v1/apply/${SLUG}/mine/${id}${path}`;

    async function uploadKyc(item: "Registration" | "Beneficial owners" | "Signatory ID") {
      const kind = { Registration: "Registration certificate", "Beneficial owners": "Beneficial owners", "Signatory ID": "Signatory ID" }[item];
      const t = await call("POST", mine("/documents"), "fund", { kind, name: `${kind}.pdf`, contentType: "application/pdf", size: PDF.length });
      if (t.status !== 201) return t;
      const target = UploadTarget.parse(t.json);
      expect((await call("PUT", target.url, undefined, PDF, target.headers)).status).toBe(204);
      return call("POST", mine("/kyc"), "fund", { item, fileId: target.fileId });
    }

    beforeAll(async () => {
      email = `fund-${run}@verify.example`;
      const u = await db.user.create({ data: { kind: "participant", email, name: "Wanjiku Mwangi" } });
      users.push(u.id);
      cookies.fund = await signedIn(u.id);
      id = MyApplication.parse((await call("POST", `/v1/apply/${SLUG}/mine`, "fund", { mode: "capital" })).json).id;
      const filled = {
        "org.name": "Rift Capital", "org.country": "Kenya", providerKind: "Venture capital",
        "mandate.sectors": ["Fintech"], "mandate.countries": ["Kenya"], "mandate.stages": ["Growth"], "mandate.ticketMin": 250_000, "mandate.ticketMax": 2_000_000,
        "mandate.instruments": ["Equity"],
        "contact.name": "Wanjiku Mwangi", "decisionMaker.name": "Wanjiku Mwangi", "decisionMaker.title": "Partner", "decisionMaker.email": "w@rift.example", "decisionMaker.phone": "+254700000000",
        mission: "m1", source: "Partner",
      };
      expect((await call("POST", mine("/submit"), "fund", { changes: filled })).status).toBe(200);
    });

    test("before anything is in, verifying is refused with every blocker; KYC isn't for drafts or seekers", async () => {
      const r = await call("POST", one(id, "/verification"), "st_lead", { outcome: "Verified", reason: "All in order" });
      expect(r.status).toBe(409);
      expect(errorOf(r).message).toMatch(/^Not ready to verify: Registration not uploaded; .*NDA not signed; Decision-maker not confirmed/);
      const view = MyApplication.parse((await call("GET", mine(), "fund")).json);
      expect(view.verification).toMatchObject({ state: "Verification pending", nda: null, decided: false });
      expect(view.verification!.kyc.map((k) => k.doc)).toEqual([null, null, null]);
    });

    test("the applicant uploads the three KYC documents and signs the NDA", async () => {
      for (const item of ["Registration", "Beneficial owners", "Signatory ID"] as const) expect((await uploadKyc(item)).status).toBe(200);
      // a file of the wrong kind can't stand for an item
      const reg = MyApplication.parse((await call("GET", mine(), "fund")).json).verification!.kyc[0].doc!;
      expect((await call("POST", mine("/kyc"), "fund", { item: "Signatory ID", fileId: reg.id })).status).toBe(400);
      expect((await call("POST", mine("/nda"), "fund", { name: "Wanjiku Mwangi", title: "Partner" })).status).toBe(400); // not accepted
      expect((await call("POST", mine("/nda"), "fund", { name: "Wanjiku Mwangi", title: "Partner", accept: true })).status).toBe(200);
      expect((await call("POST", mine("/nda"), "fund", { name: "Someone Else", title: "Partner", accept: true })).status).toBe(409);
      const view = MyApplication.parse((await call("GET", mine(), "fund")).json);
      expect(view.verification!.kyc.every((k) => k.doc && !k.checked)).toBe(true);
      expect(view.verification!.nda).toMatchObject({ version: "CA3-NDA v1.2", name: "Wanjiku Mwangi" });
    });

    test("the team checks each item, enters the screening and confirms the decision-maker; a match blocks", async () => {
      for (const item of ["Registration", "Beneficial owners", "Signatory ID"]) expect((await call("POST", one(id, "/kyc/check"), "st_rev2", { item })).status).toBe(200);
      expect((await call("POST", one(id, "/sanctions"), "st_rev2", { result: "Match found", note: "Possible match on the UN list" })).status).toBe(200);
      expect((await call("POST", one(id, "/decision-maker/confirm"), "st_rev2")).status).toBe(200);
      const blocked = await call("POST", one(id, "/verification"), "st_lead", { outcome: "Verified", reason: "All in order" });
      expect(errorOf(blocked).message).toBe("Not ready to verify: Sanctions screening found a match");
      expect((await call("POST", one(id, "/sanctions"), "st_rev2", { result: "Clear", note: "False positive: different date of birth" })).status).toBe(200);
      // a reviewer who doesn't decide can't verify
      expect((await call("POST", one(id, "/verification"), "st_rev2", { outcome: "Verified", reason: "All in order" })).status).toBe(409);
    });

    test("verified: the Deal Room badge is issued on the event's tier, with a random code; the applicant is told", async () => {
      const tierBefore = await db.tier.findUniqueOrThrow({ where: { id: "t_ca3_dr" } });
      expect((await call("POST", one(id, "/verification"), "st_lead", { outcome: "Verified", reason: "KYC complete, screening clear" })).status).toBe(200);
      const app = await record(id);
      expect(app).toMatchObject({ status: "Decided", verification: { state: "Verified" }, delegateId: `d_dr_${id}` });
      const delegate = await db.delegate.findUniqueOrThrow({ where: { id: `d_dr_${id}` } });
      expect(delegate).toMatchObject({ tierId: "t_ca3_dr", email });
      const badge = await db.badge.findUniqueOrThrow({ where: { delegateId: delegate.id } });
      expect(badge.code).toMatch(/^EXC-DR-[0-9A-Z_]{8}$/);
      expect(((await db.tier.findUniqueOrThrow({ where: { id: "t_ca3_dr" } })).record as { sold: number }).sold).toBe((tierBefore.record as { sold: number }).sold + 1);
      expect(await messageTo(id, /^Your organisation is verified/)).toHaveLength(1);
      // and then it's settled: no more uploads, signing or verifying twice
      const view = MyApplication.parse((await call("GET", mine(), "fund")).json);
      expect(view.verification).toMatchObject({ state: "Verified", decided: true });
      expect((await uploadKyc("Signatory ID")).status).toBe(409);
      expect((await call("POST", one(id, "/verification"), "st_lead", { outcome: "Verified", reason: "Again" })).status).toBe(409);
    });
  });

  test("a seeker sees the decision in force and its conditions; never one waiting for a second decider", async () => {
    const email = `seeker-${run}@decide.example`;
    const u = await db.user.create({ data: { kind: "participant", email, name: "Mutale Banda" } });
    users.push(u.id);
    cookies.seeker = await signedIn(u.id);
    // a submitted seeker of the test's own, so its applicant can sign in
    const appId = MyApplication.parse((await call("POST", `/v1/apply/${SLUG}/mine`, "seeker", { mode: "seeker" })).json).id;
    await db.drApplication.update({ where: { id: appId }, data: { status: "In review", record: { ...((await db.drApplication.findUniqueOrThrow({ where: { id: appId } })).record as object), status: "In review", ref: "CA3-CS-99001", ask: { amount: 20_000_000, currency: "USD", instrument: "Equity", useOfFunds: "Growth", stage: "Growth" } } } });
    const mine = () => `/v1/apply/${SLUG}/mine/${appId}`;
    expect((await call("POST", one(appId, "/decisions"), "st_rev1", { decision: "Qualified", reason: "Bankable" })).status).toBe(200);
    expect(MyApplication.parse((await call("GET", mine(), "seeker")).json).decision).toBeNull();
    expect((await call("POST", one(appId, "/decisions/confirm"), "st_lead")).status).toBe(200);
    const view = MyApplication.parse((await call("GET", mine(), "seeker")).json);
    expect(view.decision).toMatchObject({ decision: "Qualified", reason: "Bankable", conditions: [] });
    expect(view.fee).toEqual({ amount: 250, currency: "USD", paid: false, waived: false });
    expect(view.verification).toBeNull();
  });
});
