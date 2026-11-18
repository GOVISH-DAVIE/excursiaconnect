import { NextResponse, type NextRequest } from "next/server";
import { visitsDb } from "@/server/visits/db";
import { clientIp, viaHttps } from "@/server/visits/ip";
import { MAX_BODY, SESSION_COOKIE, SESSION_IDLE_MS, parseEvent, purgeHourly, recordEvent } from "@/server/visits/record";

/*
  The visitor log's one way in. The page beacon (src/components/visit-beacon.tsx) posts each page opened, a
  ping with the seconds it was visible, and batches of clicks. The session lives in the ec_sid cookie.
*/

const done = (status: number) => new NextResponse(null, { status, headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  // a page of this site only: a browser sends Origin on a POST, and it must be this host
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host")) return done(403);
    } catch {
      return done(403);
    }
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return done(413);
  const body = await req.text();
  if (body.length > MAX_BODY) return done(413);
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return done(400);
  }
  const ev = parseEvent(raw);
  if (typeof ev === "string") return done(400);

  const db = visitsDb();
  const now = new Date();
  purgeHourly(db, now);
  const { sessionId, isNew } = recordEvent(db, ev, { sessionId: req.cookies.get(SESSION_COOKIE)?.value, ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") ?? "", now });

  const res = done(204);
  // tells the page a new session began, so its screen recorder takes a fresh snapshot for the replay
  if (isNew) res.headers.set("x-session-new", "1");
  // the cookie lasts as long as the session may idle, and each event extends it
  res.cookies.set(SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: "lax", secure: viaHttps(req.headers), path: "/", maxAge: SESSION_IDLE_MS / 1000 });
  return res;
}
