/**
 * M1.4: the outbox, sent by the worker, against the test database. Each message goes once, even with two workers;
 * a failure is retried later, then given up; a message with no one to send to fails at once; the email names the
 * action only and links to the right page for who gets it.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDb } from "@excursia/db";
import { memoryMailer, type Mailer } from "../src/mail/mailer";
import { createOutboxRepo, type Recipient } from "../src/modules/outbox/outbox.repo";
import { createOutboxService, linkFor, render } from "../src/modules/outbox/outbox.service";

const WEB = "https://events.example.co.ke";
const run = Date.now().toString(36);

describe("the email around a message", () => {
  const applicant: Recipient = { email: "a@x.example", name: "Neema Achieng", kind: "applicant", eventId: "ev_x", slug: "savanna-summit", eventName: "Savanna Summit", invite: "tok123" };
  const staff: Recipient = { ...applicant, kind: "staff", name: "Amani Mutua", invite: null };

  test("links go where each person acts", () => {
    expect(linkFor(WEB, applicant, "/dr/dr_cs1")).toBe(`${WEB}/e/savanna-summit/deal-room/apply`);
    expect(linkFor(WEB, applicant, "/e/connected-africa-3/deal-room/apply?invite=old")).toBe(`${WEB}/e/savanna-summit/deal-room/apply?invite=tok123`);
    expect(linkFor(WEB, staff, "/dealroom/applications/dr_cs_ab12")).toBe(`${WEB}/team/applications/dr_cs_ab12`);
    expect(linkFor(WEB, staff, "/dealroom/meetings")).toBe(`${WEB}/team`);
    expect(linkFor(WEB, { ...staff, kind: "user" }, "/team/organisation")).toBe(`${WEB}/team/organisation`);
  });

  test("it greets by first name, names the action, and keeps the details on the page", () => {
    const mail = render(WEB, applicant, { subject: "Information requested on your application, reply by 2026-12-23", link: "/dr/dr_cs1" });
    expect(mail.subject).toBe("Information requested on your application, reply by 2026-12-23 · Savanna Summit");
    expect(mail.text).toMatch(/^Hello Neema,/);
    expect(mail.text).toContain(`${WEB}/e/savanna-summit/deal-room/apply`);
    expect(mail.text).toContain("Savanna Summit Deal Room, on ExcursiaConnect");
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("sending the outbox", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 6);
  const repo = createOutboxRepo(db);
  let userId = "";
  const ids: string[] = [];

  async function queue(recipient: string, subject: string) {
    const id = `msg_t${run}${ids.length}`;
    ids.push(id);
    await db.outboxMessage.create({ data: { id, recipient, channel: "email", subject, link: "/team/organisation", status: "queued" } });
    return id;
  }
  const row = (id: string) => db.outboxMessage.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    userId = (await db.user.create({ data: { kind: "staff", email: `owner-${run}@outbox.example`, name: "Wanjiru Kamau" } })).id;
  });
  afterAll(async () => {
    await db.outboxMessage.deleteMany({ where: { id: { in: ids } } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  test("a queued message is sent once, with the provider's id, even with two workers at once", async () => {
    const id = await queue(`user:${userId}`, "Your KYC is verified: you can send events for approval");
    const mailer = memoryMailer();
    const counting: Mailer = { available: true, send: async (m) => (await mailer.send(m), { id: `<${m.to}>` }) };
    const a = createOutboxService({ repo, mailer: counting, web: WEB, log: () => {} });
    const b = createOutboxService({ repo, mailer: counting, web: WEB, log: () => {} });
    await Promise.all([a.drain(), b.drain(), a.drain()]);
    const mine = mailer.sent.filter((m) => m.to === `owner-${run}@outbox.example`);
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toContain(`${WEB}/team/organisation`);
    expect(await row(id)).toMatchObject({ status: "sent", attempts: 1, providerId: `<owner-${run}@outbox.example>` });
  });

  test("a failure is tried again later, and given up after the last try", async () => {
    const id = await queue(`user:${userId}`, "An event to approve");
    const broken: Mailer = { available: true, send: async () => Promise.reject(new Error("421 try later")) };
    const worker = createOutboxService({ repo, mailer: broken, web: WEB, log: () => {} });
    await worker.drain();
    const after = await row(id);
    expect(after.status).toBe("queued");
    expect(after.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
    // the last of six tries gives up
    await db.outboxMessage.update({ where: { id }, data: { attempts: 5, nextAttemptAt: new Date(0) } });
    await worker.drain();
    expect((await row(id)).status).toBe("failed");
  });

  test("a message with no one to send to fails at once", async () => {
    const id = await queue("st_nobody", "A match is ready to schedule");
    await createOutboxService({ repo, mailer: memoryMailer(), web: WEB, log: () => {} }).drain();
    expect((await row(id)).status).toBe("failed");
  });

  test("a message stuck sending by a worker that died goes back in the queue", async () => {
    const id = await queue(`user:${userId}`, "Stuck");
    await db.outboxMessage.update({ where: { id }, data: { status: "sending", nextAttemptAt: new Date(Date.now() - 11 * 60_000) } });
    await repo.requeueStuck();
    expect((await row(id)).status).toBe("queued");
  });
});
