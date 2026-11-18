/** Paying's handlers: the applicant's two (start, watch), and Daraja's callback, which is always acknowledged. */
import type { RequestHandler } from "express";
import { PayMpesaInput, PayParams } from "@excursia/contracts/pay";
import { sessionOf } from "../../http/session";
import type { PaymentsService } from "./payments.service";

export function createPaymentsController(service: PaymentsService, log: Pick<Console, "error"> = console) {
  return {
    latest: (async (req, res) => {
      const { slug, appId } = PayParams.parse(req.params);
      res.set("Cache-Control", "private, no-store").json(await service.latest(sessionOf(res), slug, appId));
    }) satisfies RequestHandler,

    startMpesa: (async (req, res) => {
      const { slug, appId } = PayParams.parse(req.params);
      const { phone } = PayMpesaInput.parse(req.body);
      res.status(201).json(await service.startMpesa(sessionOf(res), slug, appId, phone));
    }) satisfies RequestHandler,

    /** Daraja retries anything but this answer, so it gets it whatever we make of the callback. */
    mpesaCallback: (async (req, res) => {
      try {
        await service.callback(String(req.params.token ?? ""), req.body);
      } catch (e) {
        log.error("[payments] M-Pesa callback failed", e);
      }
      res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }) satisfies RequestHandler,
  };
}
export type PaymentsController = ReturnType<typeof createPaymentsController>;
