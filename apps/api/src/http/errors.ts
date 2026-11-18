/**
 * How the API fails: every error leaves as an ErrorBody (@excursia/contracts/http) with a status that matches its
 * code. Routes throw HttpError for refusals they expect; anything else is a bug, logged here and answered with
 * "internal" and no detail, so a stack trace or a SQL fragment never reaches a browser.
 */
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import type { ErrorBody, ErrorCode } from "@excursia/contracts/http";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
};

export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: string[],
  ) {
    super(message);
    this.name = "HttpError";
  }
  get status() {
    return STATUS[this.code];
  }
}

const body = (code: ErrorCode, message: string, fields?: string[]): ErrorBody => ({ error: { code, message, ...(fields ? { fields } : {}) } });

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json(body("not_found", `No route for ${req.method} ${req.path}`));
};

/** Errors raised by express.json() carry a type; the two a client can cause are answered as theirs. */
function parserError(err: unknown): HttpError | undefined {
  const type = (err as { type?: unknown }).type;
  if (type === "entity.too.large") return new HttpError("payload_too_large", "The request body is too large");
  if (type === "entity.parse.failed") return new HttpError("bad_request", "The request body is not valid JSON");
  if (type === "encoding.unsupported" || type === "charset.unsupported") return new HttpError("bad_request", "The request body's encoding is not supported");
  return undefined;
}

export function errorHandler(log: (err: unknown, req: { method: string; path: string }) => void): ErrorRequestHandler {
  // Express knows an error handler by its four parameters, so `next` stays even though it is unused
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err, req, res, next) => {
    const known =
      err instanceof HttpError
        ? err
        : err instanceof ZodError
          ? new HttpError("bad_request", "The request does not match the contract", err.issues.map((i) => i.path.join(".") || "(body)"))
          : parserError(err);
    if (known) {
      res.status(known.status).json(body(known.code, known.message, known.fields));
      return;
    }
    log(err, req);
    res.status(500).json(body("internal", "Something went wrong on our side"));
  };
}
