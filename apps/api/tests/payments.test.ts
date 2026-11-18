/**
 * M1.7, the fee, through the real app and the test database, with a stand-in M-Pesa the test controls: the request
 * to the phone for the fee in shillings, once; the callback that settles nothing on its own; the worker's check that
 * settles it, the badge and the email, once, however often the callback comes; a cancelled, a mismatched and a
 * waived-meanwhile payment; the lead's waiver; and the one reminder.
 */
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { MyApplication } from "@excursia/contracts/apply";
import { ErrorBody } from "@excursia/contracts/http";
import { PaymentView } from "@excursia/contracts/pay";
import { createDb } from "@excursia/db";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { paymentsService } from "../src/modules/payments";
import { createSeedRepo } from "../src/modules/seed/seed.repo";
import { demoRows, demoUserId } from "../src/modules/seed/seed.service";
import type { Mpesa, PushRequest, QueryResult } from "../src/payments/mpesa";
import { toInstant } from "../src/persistence/time";
import { hashToken, newToken } from "../src/security/secrets";

const WEB = "https://events.example.co.ke";
const SLUG = "connected-africa-3";
const EV = "ev_ca3";
const run = Date.now().toString(36);

describe.skipIf(!process.env.TEST_DATABASE_URL)("paying the Deal Room fee", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 6);
  const seedRepo = createSeedRepo(db);
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: Buffer.alloc(32, 9).toString("base64") });
  const clock = toInstant("2026-12-16 09:00");
  let server: Server;
  let base = "";
  const cookies: Record<string, string> = {};
  const users: string[] = [];
  const errors: string[] = [];

  // the stand-in M-Pesa: every push is kept, and the query says what the test says
  const pushes: PushRequest[] = [];
  let answer: QueryResult = { state: "pending", code: "", description: "" };
  const mpesa: Mpesa = {
    name: "test",
    push: async (r) => {
      pushes.push(r);
      return { checkoutRequestId: `ws_CO_${run}_${pushes.length}`, customerMessage: "Success. Request accepted for processing" };
    },
    query: async () => answer,
  };
  const worker = (m: Mpesa | null = mpesa) => paymentsService({ db, now: () => clock, mpesa: m, callbackBase: () => base, log: { error: (x: string) => errors.push(x), log: () => {} } });
  // the worker's round, as if a minute had passed since the push
  const confirm = () => worker().confirm(Date.now() + 60_000);

  async function signedIn(userId: string) {
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId, createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 86_400_000), stepUpAt: clock } });
    return `sid=${token}`;
  }
  async function call(method: string, path: string, who?: string, body?: unknown, opts: { origin?: boolean } = {}) {
    const headers: Record<string, string> = {};
    if (who) headers.Cookie = cookies[who];
    if (method !== "GET" && opts.origin !== false) headers.Origin = WEB;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  }
  const errorOf = (r: { json: unknown }) => ErrorBody.parse(r.json).error;
  const pay = (who: string, id: string, phone = "0712 345 678") => call("POST", `/v1/pay/${SLUG}/${id}/mpesa`, who, { phone });
  const mine = (who: string, id: string) => call("GET", `/v1/apply/${SLUG}/mine/${id}`, who).then((r) => MyApplication.parse(r.json));
  const record = async (id: string) => (await db.drApplication.findUniqueOrThrow({ where: { id } })).record as { fee?: { paid?: { reference: string }; waived?: object; reminderAt?: string; sentAt: string }; delegateId?: string; history: { what: string }[] };
  const paymentOf = (id: string) => db.payment.findFirstOrThrow({ where: { subjectId: id }, orderBy: { createdAt: "desc" } });
  const tokenOf = (r: PushRequest) => r.callbackUrl.split("/").pop()!;
  const callback = (r: PushRequest, outcome: { code?: number; amount?: number; receipt?: string; phone?: string } = {}) =>
    call(
      "POST",
      `/v1/hooks/mm/${tokenOf(r)}`,
      undefined,
      {
        Body: {
          stkCallback: {
            MerchantRequestID: "m", CheckoutRequestID: `ws_CO_${run}_${pushes.indexOf(r) + 1}`, ResultCode: outcome.code ?? 0, ResultDesc: outcome.code ? "Request cancelled by user" : "The service request is processed successfully.",
            ...(outcome.code
              ? {}
              : { CallbackMetadata: { Item: [{ Name: "Amount", Value: outcome.amount ?? r.amount }, { Name: "MpesaReceiptNumber", Value: outcome.receipt ?? `SLK${run.slice(-4).toUpperCase()}${pushes.indexOf(r)}` }, { Name: "PhoneNumber", Value: Number(outcome.phone ?? r.phone) }] } }),
          },
        },
      },
      { origin: false },
    );

  /** A seeker of the test's own, submitted and in review, approved by the lead: the USD 250 fee is owed. */
  async function approvedSeeker(name: string, approve = true) {
    const u = await db.user.create({ data: { kind: "participant", email: `${name}-${run}@pay.example`, name } });
    users.push(u.id);
    cookies[name] = await signedIn(u.id);
    const id = MyApplication.parse((await call("POST", `/v1/apply/${SLUG}/mine`, name, { mode: "seeker" })).json).id;
    const row = await db.drApplication.findUniqueOrThrow({ where: { id } });
    await db.drApplication.update({ where: { id }, data: { status: "In review", record: { ...(row.record as object), status: "In review", ref: `CA3-CS-9${pushes.length}${name.length}`, contact: { name, email: u.email, phone: "+254712345678" } } } });
    if (approve) expect((await call("POST", `/v1/dealroom/${EV}/applications/${id}/decisions`, "st_lead", { decision: "Qualified", reason: "Bankable" })).status).toBe(200);
    return id;
  }

  beforeAll(async () => {
    await seedRepo.replaceDemo(demoRows());
    for (const id of ["st_lead", "st_rev1"]) cookies[id] = await signedIn(demoUserId(id));
    const app = createApp({ config, db, mailer: memoryMailer(), now: () => clock, mpesa, callbackBase: () => base, logError: (e) => console.error(e) });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await db.payment.deleteMany({ where: { eventId: EV } });
    await seedRepo.removeDemo();
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }, 60_000);

  test("nothing to pay before an approval; a number that isn't Kenyan mobile is refused", async () => {
    const id = await approvedSeeker("early", false);
    const r = await pay("early", id);
    expect(r.status).toBe(409);
    expect(errorOf(r).message).toBe("No fee is owed on this application.");
    const appr = await approvedSeeker("badphone");
    const bad = await pay("badphone", appr, "0212 345 678");
    expect(bad.status).toBe(400);
    expect(errorOf(bad).fields).toEqual(["phone"]);
    expect(pushes).toHaveLength(0);
  });

  describe("an approved seeker pays", () => {
    let id = "";
    beforeAll(async () => {
      id = await approvedSeeker("amina");
    });

    test("the request goes to their phone, for the fee in shillings, once; the token is stored hashed", async () => {
      const before = await mine("amina", id);
      expect(before.fee).toMatchObject({ amount: 250, currency: "USD", kes: 32_500, methods: ["M-Pesa"], payment: null, paid: false });
      const r = await pay("amina", id);
      expect(r.status).toBe(201);
      expect(PaymentView.parse(r.json)).toMatchObject({ status: "pending", kes: 32_500, phone: "07•• ••• 678" });
      expect(pushes).toHaveLength(1);
      expect(pushes[0]).toMatchObject({ phone: "254712345678", amount: 32_500, description: "Deal Room fee" });
      expect(pushes[0].reference).toMatch(/^[A-Za-z0-9]+$/);
      const token = tokenOf(pushes[0]);
      expect(token).toMatch(/^[a-f0-9]{48}$/);
      const row = await paymentOf(id);
      expect(row).toMatchObject({ status: "pending", provider: "mpesa", kesAmount: 32_500, providerTxnId: `ws_CO_${run}_1`, callbackToken: createHash("sha256").update(token).digest("hex") });
      // asking again while it's on the phone sends nothing new
      expect(PaymentView.parse((await pay("amina", id)).json).id).toBe(row.id);
      expect(pushes).toHaveLength(1);
      expect((await mine("amina", id)).fee!.payment).toMatchObject({ status: "pending" });
    });

    test("the callback, from anywhere, is acknowledged; it settles nothing on its own", async () => {
      const wrong = await call("POST", `/v1/hooks/mm/${"0".repeat(48)}`, undefined, { Body: { stkCallback: { CheckoutRequestID: "x", ResultCode: 0 } } }, { origin: false });
      expect(wrong).toEqual({ status: 200, json: { ResultCode: 0, ResultDesc: "Accepted" } });
      expect((await callback(pushes[0])).status).toBe(200);
      expect((await paymentOf(id)).status).toBe("pending");
      expect((await record(id)).fee!.paid).toBeUndefined();
    });

    test("the worker's check settles it: the fee, the badge and the email, with the payment, in one go", async () => {
      answer = { state: "paid", code: "0", description: "The service request is processed successfully." };
      expect(await confirm()).toMatchObject({ paid: 1 });
      const p = await paymentOf(id);
      expect(p.status).toBe("confirmed");
      const app = await record(id);
      expect(app.fee!.paid!.reference).toBe(p.receipt);
      expect(app.delegateId).toBe(`d_dr_${id}`);
      expect(await db.badge.count({ where: { delegateId: `d_dr_${id}` } })).toBe(1);
      expect(await db.outboxMessage.count({ where: { recipient: id, subject: { startsWith: "Payment received" } } })).toBe(1);
      expect(await db.auditEntry.findFirst({ where: { entity: "dr_application", entityId: id, action: "dr/payFee" } })).toMatchObject({ actorKind: "system", actorId: null });
      expect((await mine("amina", id)).fee).toMatchObject({ paid: true, payment: { status: "confirmed" } });
    });

    test("however often the callback comes, it's paid once", async () => {
      for (let i = 0; i < 3; i++) expect((await callback(pushes[0])).status).toBe(200);
      expect(await confirm()).toMatchObject({ checked: 0, paid: 0 });
      expect((await record(id)).history.filter((h) => h.what.startsWith("Paid ")).length).toBe(1);
      expect((await pay("amina", id)).status).toBe(409);
    });
  });

  test("a request cancelled on the phone fails, says so, and can be sent again", async () => {
    const id = await approvedSeeker("cancels");
    await pay("cancels", id);
    const push = pushes.at(-1)!;
    await callback(push, { code: 1032 });
    answer = { state: "failed", code: "1032", description: "Request cancelled by user" };
    expect(await confirm()).toMatchObject({ failed: 1 });
    expect((await mine("cancels", id)).fee!.payment).toMatchObject({ status: "failed", message: "You cancelled the request on your phone. Send it again when you're ready." });
    expect((await pay("cancels", id)).status).toBe(201);
    expect(pushes.at(-1)).not.toBe(push);
  });

  test("a confirmation that doesn't match the request is held for the team, not settled", async () => {
    const id = await approvedSeeker("short");
    await pay("short", id);
    await callback(pushes.at(-1)!, { amount: 1 });
    answer = { state: "paid", code: "0", description: "ok" };
    await confirm();
    expect((await paymentOf(id)).status).toBe("failed");
    expect((await record(id)).fee!.paid).toBeUndefined();
    expect(errors.some((e) => e.includes(id) && /doesn't match/.test(e))).toBe(true);
  });

  test("the lead waives a fee with a reason, and the badge is issued; a reviewer can't", async () => {
    const id = await approvedSeeker("sponsored");
    const refused = await call("POST", `/v1/dealroom/${EV}/applications/${id}/fee/waive`, "st_rev1", { reason: "Sponsored place" });
    expect(errorOf(refused).message).toBe("Only the lead can waive a fee");
    expect((await call("POST", `/v1/dealroom/${EV}/applications/${id}/fee/waive`, "st_lead", { reason: " " })).status).toBe(400);
    expect((await call("POST", `/v1/dealroom/${EV}/applications/${id}/fee/waive`, "st_lead", { reason: "Sponsored place: mission partner pays" })).status).toBe(200);
    expect((await record(id)).delegateId).toBe(`d_dr_${id}`);
    expect((await mine("sponsored", id)).fee).toMatchObject({ waived: true });
    expect((await pay("sponsored", id)).status).toBe(409);
  });

  test("paid on the phone after the lead waived it: recorded, not applied, and flagged for a refund", async () => {
    const id = await approvedSeeker("both");
    await pay("both", id);
    await call("POST", `/v1/dealroom/${EV}/applications/${id}/fee/waive`, "st_lead", { reason: "Sponsored place" });
    await callback(pushes.at(-1)!);
    answer = { state: "paid", code: "0", description: "ok" };
    await confirm();
    const p = await paymentOf(id);
    expect(p.status).toBe("confirmed");
    expect((p.rawPayload as { failed?: string }).failed).toMatch(/^not applied: No fee is owed/);
    expect((await record(id)).fee!.paid).toBeUndefined();
    expect(errors.some((e) => e.includes(id) && /Refund it/.test(e))).toBe(true);
  });

  test("one reminder, three days after the link, and only while the fee can be paid", async () => {
    const id = await approvedSeeker("slow");
    const row = await db.drApplication.findUniqueOrThrow({ where: { id } });
    const rec = row.record as { fee: object };
    await db.drApplication.update({ where: { id }, data: { record: { ...(row.record as object), fee: { ...rec.fee, sentAt: "2026-12-12 09:00" } } } });
    expect(await worker(null).remindFees()).toBe(0);
    expect(await worker().remindFees()).toBeGreaterThanOrEqual(1);
    expect((await record(id)).fee!.reminderAt).toBe("2026-12-16 09:00");
    expect(await db.outboxMessage.count({ where: { recipient: id, subject: { startsWith: "Reminder: pay the USD 250" } } })).toBe(1);
    await worker().remindFees();
    expect(await db.outboxMessage.count({ where: { recipient: id, subject: { startsWith: "Reminder: pay" } } })).toBe(1);
  });
});
