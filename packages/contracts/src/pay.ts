/**
 * Paying the Deal Room's participation fee (backend-plan.md, M1.7): by M-Pesa first, with a card when D4 is decided.
 * The browser only starts a payment and watches it: the provider's confirmation, checked by the server, settles it.
 */
import { z } from "zod";

export const PayParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,80}$/), appId: z.string().regex(/^dr_[a-z0-9_]{2,60}$/) });

/** The number the payment request goes to; the server reads 07…, 01…, +254… and 254…. */
export const PayMpesaInput = z.object({ phone: z.string().trim().min(9, "give your M-Pesa number").max(20) });
export type PayMpesaInput = z.infer<typeof PayMpesaInput>;

/** One payment attempt, as its payer sees it. */
export const PaymentView = z.object({
  id: z.string(),
  method: z.enum(["M-Pesa"]),
  status: z.enum(["pending", "confirmed", "failed"]),
  /** the shillings asked for, locked when the request went out */
  kes: z.number().int(),
  /** the number it went to, mostly hidden: 07•• ••• 123 */
  phone: z.string(),
  /** what to do now, or why it failed */
  message: z.string(),
  at: z.string(),
});
export type PaymentView = z.infer<typeof PaymentView>;

/** The callback Daraja expects back: anything else and it retries. */
export const MpesaAck = z.object({ ResultCode: z.literal(0), ResultDesc: z.string() });
