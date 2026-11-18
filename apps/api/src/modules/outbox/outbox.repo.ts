/**
 * The outbox as a queue (M1.4). Messages are written in the same transaction as the change that causes them;
 * the worker claims a batch with FOR UPDATE SKIP LOCKED, so two workers never take the same message, sends each,
 * and records what happened. A message stuck "sending" (a worker that died mid-batch) is put back after 10 minutes.
 */
import type { Db } from "@excursia/db";

export type Claimed = { id: string; eventId: string | null; recipient: string; channel: string; subject: string; link: string; attempts: number };
export type Recipient = { email: string; name: string; kind: "applicant" | "staff" | "user"; eventId: string | null; slug: string | null; eventName: string | null; invite: string | null };

export function createOutboxRepo(db: Db) {
  return {
    /** Up to `n` messages due now, email only (SMS is M1.7), marked as being sent. */
    claim: (n: number) =>
      db.$queryRaw<Claimed[]>`
        UPDATE outbox_message SET status = 'sending', attempts = attempts + 1, next_attempt_at = now()
        WHERE id IN (
          SELECT id FROM outbox_message
          WHERE status = 'queued' AND channel IN ('email', 'email_and_sms') AND next_attempt_at <= now()
          ORDER BY created_at LIMIT ${n} FOR UPDATE SKIP LOCKED)
        RETURNING id, event_id AS "eventId", recipient, channel::text AS channel, subject, link, attempts`,

    /** Messages a dead worker left "sending" go back in the queue. */
    requeueStuck: () => db.$executeRaw`UPDATE outbox_message SET status = 'queued' WHERE status = 'sending' AND next_attempt_at < now() - interval '10 minutes'`,

    sent: (id: string, providerId: string | null) => db.outboxMessage.update({ where: { id }, data: { status: "sent", sentAt: new Date(), providerId } }),
    retryAt: (id: string, at: Date) => db.outboxMessage.update({ where: { id }, data: { status: "queued", nextAttemptAt: at } }),
    failed: (id: string) => db.outboxMessage.update({ where: { id }, data: { status: "failed" } }),

    /**
     * Who a message goes to, as the rules address them: an application (its contact), a Deal Room staff member,
     * or a user ("user:<id>", for organisers and Algotech). Null if there is no one to send to.
     */
    async recipient(to: string, eventId: string | null): Promise<Recipient | null> {
      const event = eventId ? await db.event.findUnique({ where: { id: eventId }, select: { slug: true, name: true } }) : null;
      const where = { eventId, slug: event?.slug ?? null, eventName: event?.name ?? null };
      if (to.startsWith("user:")) {
        const u = await db.user.findUnique({ where: { id: to.slice(5) }, select: { email: true, name: true, disabledAt: true } });
        return u?.email && !u.disabledAt ? { email: u.email, name: u.name, kind: "user", invite: null, ...where } : null;
      }
      if (to.startsWith("st_")) {
        const s = await db.drStaff.findUnique({ where: { id: to }, select: { record: true, active: true } });
        const r = s?.record as { email?: string; name?: string } | undefined;
        return s?.active && r?.email ? { email: r.email, name: r.name ?? "", kind: "staff", invite: null, ...where } : null;
      }
      const a = await db.drApplication.findUnique({ where: { id: to }, select: { record: true } });
      const r = a?.record as { contact?: { email?: string; name?: string }; invite?: { token?: string } } | undefined;
      return r?.contact?.email ? { email: r.contact.email, name: r.contact.name ?? "", kind: "applicant", invite: r.invite?.token ?? null, ...where } : null;
    },
  };
}
export type OutboxRepo = ReturnType<typeof createOutboxRepo>;
