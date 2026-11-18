/**
 * Paying the Deal Room fee by M-Pesa (backend-plan.md, M1.7, "Payments" and "Webhooks"):
 * - `startMpesa`: the applicant asks; the shillings are locked and the STK push goes to their phone. The callback
 *   address carries a random token, stored hashed: it is how Daraja's callback finds its payment.
 * - `callback`: Daraja's answer, kept on the payment as a hint. It settles nothing.
 * - `confirm` (the worker): asks Daraja how each push ended. Paid, and the callback's amount, phone and receipt
 *   match the request: the fee is settled through the rules (dr/payFee, as the system), the badge issued and the
 *   emails queued, in one transaction with the payment's confirmation, once. A push with no answer is given up after
 *   15 minutes; one paid with no callback is left for reconciliation, loudly.
 */
import { createHash, randomBytes } from "node:crypto";
import type { PaymentView } from "@excursia/contracts/pay";
import { nairobiNow } from "@excursia/domain/ctx";
import { feeInKes, feeOwed, qualified } from "@excursia/domain/dealroom/logic";
import { feeReminderDue } from "@excursia/domain/dealroom/reducer";
import type { DrApplication } from "@excursia/domain/dealroom/types";
import { HttpError } from "../../http/errors";
import { MpesaError, msisdn, readCallback, type Mpesa, type QueryResult } from "../../payments/mpesa";
import type { Resolved } from "../auth/auth.service";
import type { Commands } from "../dealroom/dealroom.commands";
import type { PaymentRow, PaymentsRepo } from "./payments.repo";

/** A push still on the payer's phone: asking again within this sends nothing new. */
const PENDING_MS = 120_000;
const PUSHES_AN_HOUR = 5;
/** The first status check, unless the callback comes sooner; then every RECHECK_MS. */
const FIRST_CHECK_MS = 20_000;
const RECHECK_MS = 30_000;
/** Daraja gives the payer about a minute; after this a push with no answer has failed. */
const GIVE_UP_MS = 15 * 60_000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const shillings = (n: number) => `KES ${n.toLocaleString("en")}`;
/** 254712345678 → 07•• ••• 678 */
const masked = (phone: string | null) => (phone ? `0${phone.slice(3, 4)}•• ••• ${phone.slice(-3)}` : "");
type Raw = { push?: object; callback?: unknown; query?: QueryResult; failed?: string };
const rawOf = (p: PaymentRow) => (p.rawPayload ?? {}) as Raw;

/** One attempt, as its payer sees it. */
export function paymentView(p: PaymentRow): PaymentView {
  const kes = p.kesAmount ?? 0;
  const why = rawOf(p).failed ?? "";
  const message =
    p.status === "confirmed"
      ? `Paid${p.receipt ? `, M-Pesa receipt ${p.receipt}` : ""}.`
      : p.status === "pending"
        ? `Check your phone (${masked(p.phone)}): enter your M-Pesa PIN to pay ${shillings(kes)}.`
        : /cancel/i.test(why)
          ? "You cancelled the request on your phone. Send it again when you're ready."
          : `The payment didn't go through: ${why || "M-Pesa didn't confirm it"}. You can try again.`;
  return { id: p.id, method: "M-Pesa", status: p.status === "refunded" ? "failed" : p.status, kes, phone: masked(p.phone), message, at: p.createdAt.toISOString() };
}

export type PaymentsDeps = {
  repo: PaymentsRepo;
  commands: Commands;
  /** null when M-Pesa isn't offered (production without keys) */
  mpesa: Mpesa | null;
  /** the API's public address, which Daraja calls back */
  callbackBase: () => string;
  /** the rules' clock, for the reminder's due time */
  now: () => Date;
  log?: Pick<Console, "error" | "log">;
};

export function createPaymentsService({ repo, commands, mpesa, callbackBase, now: rulesNow, log = console }: PaymentsDeps) {
  /** When the worker next asks about a payment, and those already reported as needing a person. */
  const nextCheck = new Map<string, number>();
  const reported = new Set<string>();

  async function payer(session: Resolved, slug: string, appId: string) {
    if (session.user.kind !== "participant" || !session.user.email) throw new HttpError("forbidden", "Fees are paid from the applicant's own account.");
    const row = await repo.payerApp(slug, appId, session.user.email.toLowerCase());
    if (!row) throw new HttpError("not_found", "No such application.");
    return { row, app: row.record as unknown as DrApplication };
  }

  /** Settles a confirmed payment through the rules; a fee no longer owed (waived meanwhile) is recorded for refund. */
  async function settle(p: PaymentRow, receipt: string, raw: Raw) {
    try {
      await commands.run({
        eventId: p.eventId,
        actor: { kind: "system" },
        userId: null,
        ip: null,
        payment: { id: p.id, receipt, raw },
        actions: () => [{ type: "dr/payFee", appId: p.subjectId, method: "M-Pesa", reference: receipt }],
      });
      return true;
    } catch (e) {
      if (!(e instanceof HttpError) || e.code !== "conflict") throw e;
      if (/already settled/.test(e.message)) return false;
      await repo.confirmUnapplied(p.id, receipt, { ...raw, failed: `not applied: ${e.message}` });
      log.error(`[payments] M-Pesa ${receipt} (${shillings(p.kesAmount ?? 0)}) for ${p.subjectId} was paid but not applied: ${e.message}. Refund it.`);
      return false;
    }
  }

  return {
    methods: (): "M-Pesa"[] => (mpesa ? ["M-Pesa"] : []),

    async latest(session: Resolved, slug: string, appId: string): Promise<PaymentView | null> {
      await payer(session, slug, appId);
      const p = await repo.latestFor(appId);
      return p ? paymentView(p) : null;
    },

    /** Puts the payment request on the applicant's phone, for the fee in shillings, locked now. */
    async startMpesa(session: Resolved, slug: string, appId: string, phoneInput: string): Promise<PaymentView> {
      const { row, app } = await payer(session, slug, appId);
      if (app.type !== "seeker" || !qualified(app) || !feeOwed(app)) throw new HttpError("conflict", "No fee is owed on this application.");
      if (!mpesa) throw new HttpError("unavailable", "Paying by M-Pesa isn't open yet. We'll email you when it is.");
      const phone = msisdn(phoneInput);
      if (!phone) throw new HttpError("bad_request", "That isn't a Kenyan mobile number. Use the number your M-Pesa is on, like 0712 345 678.", ["phone"]);
      const last = await repo.latestFor(appId);
      if (last?.status === "pending" && Date.now() - last.createdAt.getTime() < PENDING_MS) return paymentView(last);
      if ((await repo.since(appId, new Date(Date.now() - 3_600_000))) >= PUSHES_AN_HOUR)
        throw new HttpError("rate_limited", "Too many payment requests for this application in the last hour. Try again later.");

      const token = randomBytes(24).toString("hex");
      const kes = feeInKes(app.fee!);
      const p = await repo.create({ eventId: row.eventId, appId, amount: app.fee!.amount, currency: app.fee!.currency, kes, phone, callbackToken: sha256(token) });
      // the call out to M-Pesa happens outside any transaction
      try {
        const r = await mpesa.push({ phone, amount: kes, reference: (app.ref ?? appId).replace(/[^A-Za-z0-9]/g, ""), description: "Deal Room fee", callbackUrl: `${callbackBase()}/v1/hooks/mm/${token}` });
        await repo.pushed(p.id, r.checkoutRequestId, { customerMessage: r.customerMessage });
      } catch (e) {
        await repo.fail(p.id, e instanceof MpesaError ? e.message : "M-Pesa couldn't be reached", {});
        if (e instanceof MpesaError) throw new HttpError("unavailable", e.message);
        throw e;
      }
      return paymentView((await repo.latestFor(appId))!);
    },

    /** Daraja's callback: kept on its payment, found by the path's token. Always acknowledged. */
    async callback(token: string, body: unknown) {
      if (!/^[a-f0-9]{48}$/.test(token)) return;
      const p = await repo.byToken(sha256(token));
      const cb = readCallback(body);
      if (!p || !cb || p.status !== "pending") return;
      if (p.providerTxnId && p.providerTxnId !== cb.checkoutRequestId) {
        log.error(`[payments] a callback for ${p.id} names another request (${cb.checkoutRequestId}); ignored`);
        return;
      }
      await repo.callback(p.id, { ...rawOf(p), callback: body }, cb.checkoutRequestId);
      nextCheck.delete(p.id); // look at it on the worker's next round
    },

    /**
     * The worker's reminder job: one reminder, with the payment link, the configured days after the link went out
     * (dr/feeReminder). Only while the fee can be paid: approvals made before payments opened get theirs as soon as
     * they open, which is their payment link.
     */
    async remindFees() {
      if (!mpesa) return 0;
      const at = nairobiNow(rulesNow());
      const { apps, configs } = await repo.owedFees();
      let sent = 0;
      for (const a of apps) {
        const cfg = (configs.get(a.eventId) as { config?: Parameters<typeof feeReminderDue>[1] } | undefined)?.config;
        const due = feeReminderDue(a.record as unknown as DrApplication, cfg);
        if (!due || due > at) continue;
        try {
          await commands.run({ eventId: a.eventId, actor: { kind: "system" }, userId: null, ip: null, actions: () => [{ type: "dr/feeReminder", appId: a.id }] });
          sent++;
        } catch (e) {
          log.error(`[payments] the fee reminder for ${a.id} failed: ${(e as Error).message}`);
        }
      }
      return sent;
    },

    /** The worker's round: how did each push end? Settles the paid ones, marks the failed. */
    async confirm(now = Date.now()) {
      const out = { checked: 0, paid: 0, failed: 0 };
      if (!mpesa) return out;
      for (const p of await repo.pending(20)) {
        const raw = rawOf(p);
        const age = now - p.createdAt.getTime();
        if ((!raw.callback && age < FIRST_CHECK_MS) || (nextCheck.get(p.id) ?? 0) > now) continue;
        out.checked++;
        let q: QueryResult;
        try {
          q = await mpesa.query(p.providerTxnId!);
        } catch (e) {
          log.error(`[payments] status check for ${p.id} failed: ${(e as Error).message}`);
          nextCheck.set(p.id, now + 2 * RECHECK_MS);
          continue;
        }
        if (q.state === "pending") {
          if (age > GIVE_UP_MS) {
            await repo.fail(p.id, "no answer from M-Pesa", { ...raw, query: q });
            out.failed++;
          } else nextCheck.set(p.id, now + RECHECK_MS);
          continue;
        }
        if (q.state === "failed") {
          await repo.fail(p.id, q.description || `M-Pesa result ${q.code}`, { ...raw, query: q });
          out.failed++;
          continue;
        }
        // paid, by M-Pesa's own account: the callback carries the receipt, and must match what was asked for
        const cb = readCallback(raw.callback);
        if (!cb) {
          if (age > 30 * 60_000 && !reported.has(p.id)) {
            reported.add(p.id);
            log.error(`[payments] ${p.id} for ${p.subjectId} is paid by M-Pesa's account but its callback never came: reconcile it with the statement`);
          }
          nextCheck.set(p.id, now + RECHECK_MS);
          continue;
        }
        if (cb.resultCode !== 0 || cb.amount !== p.kesAmount || cb.phone !== p.phone || !cb.receipt) {
          log.error(`[payments] ${p.id} for ${p.subjectId}: the callback doesn't match the request (amount ${cb.amount} for ${p.kesAmount}, phone ${cb.phone === p.phone ? "same" : "different"}); held for the team`);
          await repo.fail(p.id, "held: M-Pesa's confirmation doesn't match the request, and the team will check it", { ...raw, query: q });
          out.failed++;
          continue;
        }
        if (await settle(p, cb.receipt, { ...raw, query: q })) out.paid++;
        nextCheck.delete(p.id);
      }
      return out;
    },
  };
}
export type PaymentsService = ReturnType<typeof createPaymentsService>;
