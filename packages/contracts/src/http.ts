/**
 * The shapes every API response shares. A refusal or failure always comes back as an ErrorBody, so the web app's
 * API client can show the reason without knowing which route answered (docs/architecture.md, Errors).
 */
import { z } from "zod";

/** Stable codes the client may branch on; the message is for people. */
export const ErrorCode = z.enum([
  "bad_request", // the body or query did not match the contract
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict", // the rules refused: the reason says why
  "payload_too_large",
  "rate_limited",
  "unavailable",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    /** For bad_request: which fields were wrong, by path. Never the values sent. */
    fields: z.array(z.string()).optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

/** GET /health/live and /health/ready. Ready also says whether the database answered. */
export const Health = z.object({
  status: z.enum(["ok", "unavailable"]),
  db: z.enum(["ok", "down"]).optional(),
});
export type Health = z.infer<typeof Health>;
