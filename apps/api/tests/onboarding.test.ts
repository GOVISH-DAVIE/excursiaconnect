/**
 * A new summit from nothing, through the real app and the test database (backend-plan.md, M2.3 brought forward):
 * an organiser signs itself up, sends KYC with its documents and the signed agreement, Algotech returns it and
 * then verifies it; the organiser drafts an event and submits it; Algotech approves it with the Deal Room add-on
 * and gives the Deal Room its lead and a reviewer; the organiser publishes; the lead sets the missions and dates;
 * and only then do applications open. No demo data is used.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { UploadTarget } from "@excursia/contracts/apply";
import { ErrorBody } from "@excursia/contracts/http";
import { AdminQueue, DealRoomSettings, EventView, OrganiserView } from "@excursia/contracts/onboarding";
import { createDb } from "@excursia/db";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { createPlatformRepo } from "../src/modules/platform/platform.repo";
import { hashToken, newToken } from "../src/security/secrets";
import { createLocalStorage } from "../src/storage/local";
import { deriveKeys } from "../src/security/secrets";
import { toInstant } from "../src/persistence/time";

const WEB = "https://events.example.co.ke";
const run = Date.now().toString(36);
const at = (who: string) => `${who}@${run}.onboarding.example`;
const pdf = (label: string) => Buffer.concat([Buffer.from(`%PDF-1.4\n% ${label}\n`), Buffer.alloc(400, 0x20)]);
const PASSWORD = `pw-${run}-long-enough`;
const net = [1 + Math.floor(Math.random() * 250), 1 + Math.floor(Math.random() * 250)];
const ips = new Map<string, string>();
const ipOf = (who: string) => ips.get(who) ?? (ips.set(who, `10.${net[0]}.${net[1]}.${ips.size + 1}`), ips.get(who)!);

describe.skipIf(!process.env.TEST_DATABASE_URL)("a new summit from nothing", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 6);
  const mailer = memoryMailer();
  const secret = Buffer.alloc(32, 7).toString("base64");
  const clock = toInstant("2026-12-16 09:00");
  let server: Server;
  let base = "";
  let dir = "";
  const jar: Record<string, string> = {};
  let organiserId = "";
  let eventId = "";
  let slug = "";

  async function call(method: string, path: string, who?: string, body?: unknown, extra: Record<string, string> = {}) {
    // each person has their own network address, new each run, so rate limits count them apart
    const headers: Record<string, string> = { "X-Forwarded-For": ipOf(who ?? "anon"), ...extra };
    if (who && jar[who]) headers.Cookie = `sid=${jar[who]}`;
    if (method !== "GET") headers.Origin = WEB;
    if (body !== undefined && !Buffer.isBuffer(body)) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) {
      const value = /^sid=([^;]*)/.exec(c)?.[1];
      if (who && value !== undefined) jar[who] = value;
    }
    const text = await res.text();
    return { status: res.status, json: text && (res.headers.get("content-type") ?? "").includes("json") ? JSON.parse(text) : undefined };
  }
  const errorOf = (r: { json: unknown }) => ErrorBody.parse(r.json).error;
  const codeTo = (email: string) => {
    const mail = [...mailer.sent].reverse().find((m) => m.to === email);
    return /\b(\d{6})\b/.exec(mail!.text)![1];
  };
  /** A session made directly, as after a full sign-in (or one that skipped the authenticator). */
  async function sessionFor(userId: string, opts: { skipped?: boolean } = {}) {
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId, createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 3_600_000), stepUpAt: opts.skipped ? null : clock, mfaSkipped: !!opts.skipped } });
    return token;
  }
  async function signUp(who: string, organisation: string) {
    const email = at(who);
    expect((await call("POST", "/v1/organisers/signup/code", who, { email })).status).toBe(202);
    const r = await call("POST", "/v1/organisers/signup", who, { email, code: codeTo(email), name: `${who} Owner`, organisation, country: "Kenya", password: PASSWORD });
    return r;
  }
  async function uploadKyc(who: string, kind: string) {
    const t = UploadTarget.parse((await call("POST", `/v1/organisers/${organiserId}/kyc/documents`, who, { kind, name: `${kind}.pdf`, contentType: "application/pdf", size: pdf(kind).length })).json);
    expect((await call("PUT", t.url, undefined, pdf(kind), t.headers)).status).toBe(204);
    return call("POST", `/v1/organisers/${organiserId}/kyc/documents/${t.fileId}/complete`, who);
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "excursia-onboarding-"));
    const storage = createLocalStorage({ dir, key: deriveKeys(secret).upload });
    const app = createApp({ config: loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: secret }), db, mailer, now: () => clock, storage, logError: (e) => console.error(e) });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Algotech's first admin, made by the command line: one with the authenticator, one who skipped it
    const platform = createPlatformRepo(db);
    for (const who of ["admin", "lazyadmin"]) {
      const r = await platform.createAdmin(at(who), `${who} Algotech`);
      if (!("id" in r)) throw new Error("admin not made");
      jar[who] = await sessionFor(r.id!, { skipped: who === "lazyadmin" });
    }
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    const users = await db.user.findMany({ where: { email: { contains: `@${run}.onboarding.example` } }, select: { id: true } });
    const orgIds = (await db.organiser.findMany({ where: { name: { contains: run } }, select: { id: true } })).map((o) => o.id);
    const events = (await db.event.findMany({ where: { organiserId: { in: orgIds } }, select: { id: true } })).map((e) => e.id);
    await db.drApplication.deleteMany({ where: { eventId: { in: events } } });
    await db.drCounter.deleteMany({ where: { eventId: { in: events } } });
    await db.file.deleteMany({ where: { eventId: { in: events } } });
    await db.drStaff.deleteMany({ where: { eventId: { in: events } } });
    await db.drConfig.deleteMany({ where: { eventId: { in: events } } });
    await db.membership.deleteMany({ where: { OR: [{ eventId: { in: events } }, { organiserId: { in: orgIds } }] } });
    await db.event.deleteMany({ where: { id: { in: events } } });
    await db.organiser.deleteMany({ where: { id: { in: orgIds } } });
    await db.file.deleteMany({ where: { ownerKind: "organiser", ownerId: { in: orgIds } } });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.otpCode.deleteMany({ where: { destination: { contains: `@${run}.onboarding.example` } } });
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }, 30_000);

  test("an organiser signs itself up with an emailed code; the authenticator comes next", async () => {
    const r = await signUp("owner", `Savanna Summits ${run}`);
    expect(r.status).toBe(201);
    expect(r.json.next).toBe("totp_enrol");
    expect(r.json.skipUntil).toBeTruthy();
    // half signed in: nothing else answers until the authenticator step
    expect((await call("GET", "/v1/organisers/mine", "owner")).status).toBe(401);
    expect((await call("POST", "/v1/auth/totp/skip", "owner", {})).status).toBe(200);
    const mine = OrganiserView.array().parse((await call("GET", "/v1/organisers/mine", "owner")).json);
    expect(mine).toHaveLength(1);
    expect(mine[0].kycStatus).toBe("Not submitted");
    organiserId = mine[0].id;
    // the password and the code are kept as hashes only
    const user = await db.user.findUnique({ where: { email: at("owner") } });
    expect(user?.kind).toBe("staff");
    expect(user?.passwordHash).not.toContain(PASSWORD);
  });

  test("an email can't sign up twice, nor an applicant's; a wrong code makes nothing", async () => {
    const again = await signUp("owner", `Again ${run}`);
    expect(again.status).toBe(409);
    expect(errorOf(again).message).toMatch(/already has an account/);
    await db.user.create({ data: { kind: "participant", email: at("founder"), name: "Founder" } });
    const applicant = await signUp("founder", `Founder Co ${run}`);
    expect(applicant.status).toBe(409);
    expect(errorOf(applicant).message).toMatch(/used to apply/);
    const email = at("guesser");
    await call("POST", "/v1/organisers/signup/code", "guesser", { email });
    const wrong = await call("POST", "/v1/organisers/signup", "guesser", { email, code: codeTo(email) === "000000" ? "111111" : "000000", name: "G", organisation: `Guess ${run}`, country: "Kenya", password: PASSWORD });
    expect(wrong.status).toBe(400); // the name is too short: the contract refuses before the code is spent
    const wrongCode = await call("POST", "/v1/organisers/signup", "guesser", { email, code: codeTo(email) === "000000" ? "111111" : "000000", name: "Guess Er", organisation: `Guess ${run}`, country: "Kenya", password: PASSWORD });
    expect(wrongCode.status).toBe(401);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  test("KYC: details, three documents and the agreement signed by the signatory, then sent", async () => {
    const early = await call("POST", `/v1/organisers/${organiserId}/kyc/submit`, "owner", {});
    expect(early.status).toBe(409);
    expect(errorOf(early).message).toMatch(/Still needed: Registration number/);
    await call("PATCH", `/v1/organisers/${organiserId}/kyc`, "owner", { registrationNo: "PVT-2024-1234", kraPin: "p051234567x", address: "Westlands, Nairobi", payoutAccount: "KCB ****4410", signatory: { name: "Wanjiru Kamau", title: "Director" } });
    for (const kind of ["Registration certificate", "Tax PIN certificate", "Signatory ID"]) expect((await uploadKyc("owner", kind)).status).toBe(200);
    const wrongName = await call("POST", `/v1/organisers/${organiserId}/kyc/dpa`, "owner", { by: "Someone Else" });
    expect(errorOf(wrongName).message).toMatch(/Wanjiru Kamau/);
    expect((await call("POST", `/v1/organisers/${organiserId}/kyc/dpa`, "owner", { by: "wanjiru kamau" })).status).toBe(200);
    const sent = OrganiserView.parse((await call("POST", `/v1/organisers/${organiserId}/kyc/submit`, "owner", {})).json);
    expect(sent.kycStatus).toBe("Pending");
    expect(sent.kraPin).toBe("P051234567X");
    // with Algotech now: no more changes
    expect((await call("PATCH", `/v1/organisers/${organiserId}/kyc`, "owner", { address: "Elsewhere" })).status).toBe(409);
  });

  test("another organiser, and anyone signed out, see nothing of it", async () => {
    expect((await signUp("other", `Other Org ${run}`)).status).toBe(201);
    await call("POST", "/v1/auth/totp/skip", "other", {});
    expect((await call("GET", `/v1/organisers/${organiserId}`, "other")).status).toBe(404);
    expect((await call("PATCH", `/v1/organisers/${organiserId}/kyc`, "other", { address: "x" })).status).toBe(404);
    expect((await call("GET", `/v1/organisers/${organiserId}`)).status).toBe(401);
    expect((await call("GET", "/v1/admin/queue", "owner")).status).toBe(403);
  });

  test("Algotech returns KYC with a reason, the organiser fixes it, and Algotech verifies it", async () => {
    const queue = AdminQueue.parse((await call("GET", "/v1/admin/queue", "admin")).json);
    expect(queue.organisers.find((o) => o.id === organiserId)?.kycStatus).toBe("Pending");
    // a document opens for Algotech through a short link
    const docId = OrganiserView.parse((await call("GET", `/v1/organisers/${organiserId}`, "admin")).json).docs[0].id;
    const link = await call("GET", `/v1/organisers/${organiserId}/kyc/documents/${docId}`, "admin");
    expect(link.status).toBe(200);
    const file = await fetch(`${base}${link.json.url}`);
    expect(Buffer.from(await file.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    // deciding needs the authenticator; a return needs a reason
    expect((await call("POST", `/v1/admin/organisers/${organiserId}/kyc`, "lazyadmin", { verdict: "Verified" })).status).toBe(403);
    expect((await call("POST", `/v1/admin/organisers/${organiserId}/kyc`, "admin", { verdict: "Returned" })).status).toBe(409);
    const back = OrganiserView.parse((await call("POST", `/v1/admin/organisers/${organiserId}/kyc`, "admin", { verdict: "Returned", note: "The signatory ID is unreadable." })).json);
    expect(back.kycStatus).toBe("Returned");
    expect(back.kycNote).toBe("The signatory ID is unreadable.");
    // fixed and sent again
    const old = back.docs.find((d) => d.kind === "Signatory ID")!;
    await call("DELETE", `/v1/organisers/${organiserId}/kyc/documents/${old.id}`, "owner");
    await uploadKyc("owner", "Signatory ID");
    expect((await call("POST", `/v1/organisers/${organiserId}/kyc/submit`, "owner", {})).status).toBe(200);
    const ok = OrganiserView.parse((await call("POST", `/v1/admin/organisers/${organiserId}/kyc`, "admin", { verdict: "Verified" })).json);
    expect(ok.kycStatus).toBe("Verified");
    expect(ok.history.map((h) => h.what).join(" / ")).toMatch(/returned .* verified/i);
  });

  test("an event goes from draft to approved with the Deal Room add-on, then live", async () => {
    const input = {
      name: `Savanna Capital Summit ${run}`,
      tagline: "Two days on capital for East African growth companies.",
      venue: "",
      city: "Nairobi",
      startDate: "2027-03-10",
      endDate: "2027-03-11",
      expectedAttendance: 400,
      brand: { primary: "#1f6f5c", logoText: "SCS" },
      dealRoomRequest: { lead: { name: "Otieno Lead", email: at("lead") } },
    };
    const made = await call("POST", `/v1/organisers/${organiserId}/events`, "owner", input);
    expect(made.status).toBe(201);
    const draft = EventView.parse(made.json);
    eventId = draft.id;
    // a draft is the organiser's alone: Algotech doesn't see it until it is sent
    expect((await call("GET", `/v1/events/${eventId}`, "admin")).status).toBe(404);
    expect(AdminQueue.parse((await call("GET", "/v1/admin/queue", "admin")).json).events.some((e) => e.id === eventId)).toBe(false);
    slug = draft.slug;
    expect(slug).toBe(`savanna-capital-summit-${run}`);
    expect(draft.gaps).toEqual(["The venue"]);
    expect((await call("POST", `/v1/events/${eventId}/submit`, "owner", {})).status).toBe(409);
    const fixed = EventView.parse((await call("PUT", `/v1/events/${eventId}`, "owner", { ...input, venue: "KICC" })).json);
    expect(fixed.can.submit).toBe(true);
    expect(EventView.parse((await call("POST", `/v1/events/${eventId}/submit`, "owner", {})).json).state).toBe("Submitted");
    // the web address is the event's alone
    expect((await call("POST", `/v1/organisers/${organiserId}/events`, "owner", { ...input, venue: "KICC" })).status).toBe(409);
    // the organiser can't approve its own event; Algotech must give terms
    expect((await call("POST", `/v1/admin/events/${eventId}/decision`, "owner", { to: "Approved" })).status).toBe(400);
    const approved = EventView.parse(
      (await call("POST", `/v1/admin/events/${eventId}/decision`, "admin", {
        to: "Approved",
        terms: { commissionPct: 5, oneOffFee: 0, licenceFee: 120000, gatewayFeesBorneBy: "Organiser", dealRoom: { enabled: true, addOnPrice: 450000, deskStaff: 3 } },
      })).json,
    );
    expect(approved.state).toBe("Approved");
    expect(approved.terms?.commissionPct).toBe(5);
    expect(approved.dealRoom?.gaps).toContain("Name at least one mission");
    expect(EventView.parse((await call("POST", `/v1/events/${eventId}/publish`, "owner", {})).json).state).toBe("Live");
  });

  test("Algotech gives the Deal Room its lead and a reviewer; an applicant's email can't be staff", async () => {
    const add = (body: object) => call("POST", `/v1/admin/events/${eventId}/dealroom/staff`, "admin", body);
    expect((await add({ name: "Founder", email: at("founder"), role: "Reviewer" })).status).toBe(409);
    expect((await add({ name: "Otieno Lead", email: at("lead"), role: "Lead" })).status).toBe(201);
    expect((await add({ name: "Second Lead", email: at("lead2"), role: "Lead" })).status).toBe(409);
    const view = EventView.parse((await add({ name: "Rehema Reviewer", email: at("reviewer"), role: "Reviewer", canDecide: true })).json);
    expect(view.dealRoom?.staff.map((s) => [s.role, s.signedUp])).toEqual(
      expect.arrayContaining([
        ["Lead", false],
        ["Reviewer", false],
      ]),
    );
    const lead = await db.user.findUnique({ where: { email: at("lead") }, include: { memberships: true } });
    expect(lead?.kind).toBe("staff");
    expect(lead?.passwordHash).toBeNull();
    expect(lead?.memberships.map((m) => [m.role, m.eventId])).toEqual([["dr_lead", eventId]]);
  });

  test("the lead sets a password, signs in and opens the Deal Room; applications then open", async () => {
    // closed until the lead has set it up
    expect((await call("GET", `/v1/apply/${slug}/form`)).status).toBe(404);
    const email = at("lead");
    await call("POST", "/v1/auth/staff/password/code", "lead", { email });
    expect((await call("POST", "/v1/auth/staff/password", "lead", { email, code: codeTo(email), password: PASSWORD })).status).toBe(204);
    expect((await call("POST", "/v1/auth/staff/signin", "lead", { email, password: PASSWORD })).json.next).toBe("totp_enrol");
    await call("POST", "/v1/auth/totp/skip", "lead", {});
    const before = DealRoomSettings.parse((await call("GET", `/v1/dealroom/${eventId}/settings`, "lead")).json);
    expect(before.canEdit).toBe(true);
    expect(before.gaps).toEqual(["Name at least one mission"]);
    const settings = {
      missions: [{ id: "m1", code: "M1", name: "Growth capital for East African companies", description: "" }],
      tracks: [{ id: "t1", code: "T1", name: "Agritech and food", missionId: "m1", description: "" }],
      appOpen: "2026-12-16",
      appClose: "2027-02-20",
      rfiDays: 7,
    };
    // a track must belong to a mission
    expect((await call("PUT", `/v1/dealroom/${eventId}/settings`, "lead", { ...settings, tracks: [{ ...settings.tracks[0], missionId: "m9" }] })).status).toBe(400);
    const after = DealRoomSettings.parse((await call("PUT", `/v1/dealroom/${eventId}/settings`, "lead", settings)).json);
    expect(after.gaps).toEqual([]);
    expect(after.log[0].what).toMatch(/1 mission, 1 track/);
    const form = await call("GET", `/v1/apply/${slug}/form`);
    expect(form.status).toBe(200);
    expect(form.json.eventName).toBe(`Savanna Capital Summit ${run}`);
  });

  test("an application gets this summit's own reference, not the demo's", async () => {
    const applicant = await db.user.create({ data: { kind: "participant", email: at("applicant"), name: "Neema" } });
    jar.applicant = await sessionFor(applicant.id);
    const mine = (path = "") => `/v1/apply/${slug}/mine${path}`;
    const appId = (await call("POST", mine(), "applicant", { mode: "seeker" })).json.id as string;
    await call("PATCH", mine(`/${appId}`), "applicant", {
      changes: {
        "org.name": "Kilimo Fresh Ltd", "org.regNo": "PVT-2020-1", "org.country": "Kenya", "org.sector": "Agritech & Food Technology",
        "ask.amount": 2_500_000, "ask.instrument": "Debt and credit", "ask.useOfFunds": "Cold-chain hubs", "ask.stage": "Growth",
        "traction.revenueBand": "USD 1m to 5m",
        "decisionMaker.name": "Neema Achieng", "decisionMaker.title": "CEO", "decisionMaker.email": at("applicant"), "decisionMaker.phone": "+254700000000",
        mission: "m1", source: "Partner",
      },
    });
    for (const kind of ["Pitch deck", "Financial statements", "Registration certificate"]) {
      const t = UploadTarget.parse((await call("POST", mine(`/${appId}/documents`), "applicant", { kind, name: `${kind}.pdf`, contentType: "application/pdf", size: pdf(kind).length })).json);
      await call("PUT", t.url, undefined, pdf(kind), t.headers);
      await call("POST", mine(`/${appId}/documents/${t.fileId}/complete`), "applicant");
    }
    const submitted = await call("POST", mine(`/${appId}/submit`), "applicant", {});
    expect(submitted.status).toBe(200);
    expect(submitted.json.ref).toBe("SCS-CS-00001");
  });

  test("a reviewer reads the settings but can't change them", async () => {
    const reviewer = await db.user.findUnique({ where: { email: at("reviewer") } });
    jar.reviewer = await sessionFor(reviewer!.id);
    const s = DealRoomSettings.parse((await call("GET", `/v1/dealroom/${eventId}/settings`, "reviewer")).json);
    expect(s.canEdit).toBe(false);
    const r = await call("PUT", `/v1/dealroom/${eventId}/settings`, "reviewer", { missions: s.missions, tracks: s.tracks, appOpen: s.appOpen, appClose: s.appClose, rfiDays: 3 });
    expect(r.status).toBe(409);
    expect(errorOf(r).message).toMatch(/Only the lead/);
  });
});
