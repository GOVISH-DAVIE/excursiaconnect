/** The desk's handlers: parse with the contracts, call the service, answer. The device's cookie is set and read here. */
import { createHash } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { DeviceParams, EnrolDeviceInput, ScanBatch, ScanEventParams, ScannerSignInInput, SetPinInput } from "@excursia/contracts/scan";
import type { Config } from "../../config";
import { readCookie, sessionOf, setSessionCookie, type SessionLocals } from "../../http/session";
import type { ScanningService } from "./scanning.service";

/** The enrolled device's cookie: HttpOnly, only ever sent to the scanning routes, for 90 days. */
const deviceCookieName = (config: Config) => (config.NODE_ENV === "production" ? "__Secure-scanner" : "scanner");
const DEVICE_COOKIE_DAYS = 90;

export function createScanningController(service: ScanningService, config: Config) {
  const device = (req: Request) => service.readDeviceCookie(readCookie(req, deviceCookieName(config)));
  const meta = (req: Request) => ({ ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });
  const auth = (res: Response) => (res.locals as SessionLocals).auth;
  const noStore = (res: Response) => res.set("Cache-Control", "private, no-store");

  return {
    devices: (async (req, res) => {
      const { eventId } = ScanEventParams.parse(req.params);
      noStore(res).json(await service.devices(sessionOf(res), eventId, device(req)));
    }) satisfies RequestHandler,

    enrol: (async (req, res) => {
      const { eventId } = ScanEventParams.parse(req.params);
      const { view, cookie } = await service.enrol(sessionOf(res), eventId, EnrolDeviceInput.parse(req.body));
      res.cookie(deviceCookieName(config), cookie, {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "strict",
        path: "/v1/scan",
        maxAge: DEVICE_COOKIE_DAYS * 86_400_000,
      });
      noStore(res).status(201).json(view);
    }) satisfies RequestHandler,

    retire: (async (req, res) => {
      const { eventId, deviceId } = DeviceParams.parse(req.params);
      await service.retire(sessionOf(res), eventId, deviceId);
      res.status(204).end();
    }) satisfies RequestHandler,

    setPin: (async (req, res) => {
      await service.setPin(sessionOf(res), SetPinInput.parse(req.body).pin);
      res.status(204).end();
    }) satisfies RequestHandler,

    home: (async (req, res) => {
      noStore(res).json(await service.home(device(req), auth(res)));
    }) satisfies RequestHandler,

    signIn: (async (req, res) => {
      const { issued, home } = await service.signIn(device(req), ScannerSignInInput.parse(req.body), meta(req));
      setSessionCookie(res, config, issued);
      noStore(res).json(home);
    }) satisfies RequestHandler,

    /** The badge list, with an ETag: a scanner that already has this list gets 304 and nothing else. */
    badges: (async (req, res) => {
      const { eventId } = ScanEventParams.parse(req.params);
      const body = JSON.stringify(await service.badges(sessionOf(res), eventId));
      const etag = `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
      noStore(res).set("ETag", etag);
      if (req.get("if-none-match") === etag) return void res.status(304).end();
      res.type("application/json").send(body);
    }) satisfies RequestHandler,

    scan: (async (req, res) => {
      const { eventId } = ScanEventParams.parse(req.params);
      noStore(res).json(await service.scan(sessionOf(res), eventId, ScanBatch.parse(req.body).scans));
    }) satisfies RequestHandler,
  };
}
export type ScanningController = ReturnType<typeof createScanningController>;
