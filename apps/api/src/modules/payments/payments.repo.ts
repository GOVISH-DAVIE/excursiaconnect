/**
 * Payments in PostgreSQL (backend-plan.md, "Payments"): one row per attempt, from the push to its confirmation.
 * Settling the fee itself goes through runCommand, which confirms the row in the same transaction.
 */
import type { Db, Prisma } from "@excursia/db";

export type PaymentRow = Awaited<ReturnType<Db["payment"]["findUniqueOrThrow"]>>;

export function createPaymentsRepo(db: Db) {
  return {
    /** The application at this event's address, if it was started with this email. */
    async payerApp(slug: string, appId: string, email: string) {
      const event = await db.event.findUnique({ where: { slug }, select: { id: true } });
      if (!event) return null;
      return db.drApplication.findFirst({ where: { id: appId, eventId: event.id, contactEmail: email }, select: { id: true, eventId: true, ref: true, record: true } });
    },

    latestFor: (appId: string) => db.payment.findFirst({ where: { subjectId: appId, purpose: "dr_fee" }, orderBy: { createdAt: "desc" } }),
    since: (appId: string, at: Date) => db.payment.count({ where: { subjectId: appId, createdAt: { gt: at } } }),

    create: (p: { eventId: string; appId: string; amount: number; currency: string; kes: number; phone: string; callbackToken: string }) =>
      db.payment.create({
        data: {
          provider: "mpesa", purpose: "dr_fee", eventId: p.eventId, subjectId: p.appId, amount: p.amount, currency: p.currency, kesAmount: p.kes, phone: p.phone,
          callbackToken: p.callbackToken, status: "pending",
        },
      }),

    pushed: (id: string, checkoutRequestId: string, raw: object) =>
      db.payment.update({ where: { id }, data: { providerTxnId: checkoutRequestId, rawPayload: { push: raw } as Prisma.InputJsonValue } }),

    /** Failed or never confirmed: kept, with why, for the record and for reconciliation. */
    fail: (id: string, why: string, raw: object) =>
      db.payment.updateMany({ where: { id, status: "pending" }, data: { status: "failed", rawPayload: { ...raw, failed: why } as Prisma.InputJsonValue } }),

    byToken: (hash: string) => db.payment.findFirst({ where: { callbackToken: hash } }),

    /** Daraja's callback, kept on the row as a hint for the worker; it settles nothing on its own. */
    callback: (id: string, raw: object, checkoutRequestId: string) =>
      db.payment.updateMany({ where: { id, status: "pending" }, data: { rawPayload: raw as Prisma.InputJsonValue, providerTxnId: checkoutRequestId } }),

    /** M-Pesa pushes still waiting for their answer, oldest first. */
    pending: (n: number) => db.payment.findMany({ where: { provider: "mpesa", status: "pending", providerTxnId: { not: null } }, orderBy: { createdAt: "asc" }, take: n }),

    /** Approved seekers whose fee is still owed, with their Deal Room's config: for the reminder job. */
    async owedFees() {
      const apps = await db.drApplication.findMany({ where: { type: "seeker", feeState: "owed" }, select: { id: true, eventId: true, record: true } });
      const configs = await db.drConfig.findMany({ where: { eventId: { in: [...new Set(apps.map((a) => a.eventId))] } }, select: { eventId: true, record: true } });
      return { apps, configs: new Map(configs.map((c) => [c.eventId, c.record])) };
    },

    /** Paid, but the fee was no longer owed (waived meanwhile): confirmed for the record, to refund by hand. */
    confirmUnapplied: (id: string, receipt: string, raw: object) =>
      db.payment.updateMany({ where: { id, status: "pending" }, data: { status: "confirmed", receipt, confirmedAt: new Date(), rawPayload: raw as Prisma.InputJsonValue } }),
  };
}
export type PaymentsRepo = ReturnType<typeof createPaymentsRepo>;
