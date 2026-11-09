import { NextResponse, type NextRequest } from "next/server";
import { visitsDb } from "@/server/visits/db";
import { SESSION_COOKIE } from "@/server/visits/record";
import { MAX_CHUNK_BYTES, storeChunk } from "@/server/visits/replay";

/*
  The screen replay's way in: the page beacon uploads rrweb events every few seconds, gzipped, as numbered
  chunks per browser tab. A chunk belongs to the live session in the ec_sid cookie; without one it is dropped,
  since only the page-view endpoint starts sessions.
*/

const done = (status: number) => new NextResponse(null, { status, headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host")) return done(403);
    } catch {
      return done(403);
    }
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_CHUNK_BYTES) return done(413);
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > MAX_CHUNK_BYTES) return done(413);
  const result = storeChunk(
    visitsDb(),
    req.cookies.get(SESSION_COOKIE)?.value,
    // the tab and sequence come in the address, so a closing tab can still send its last chunk as a beacon
    { tab: req.nextUrl.searchParams.get("tab") ?? "", seq: Number(req.nextUrl.searchParams.get("seq")), gzipped: req.nextUrl.searchParams.get("enc") === "gzip", body },
    new Date(),
  );
  // a refused chunk gets a 400; a full or missing session is not the browser's error, so it gets a quiet 204
  return done(result === "stored" || result === "duplicate" || result === "full" || result === "no session" ? 204 : 400);
}
