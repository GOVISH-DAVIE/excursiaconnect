import { connection, type NextRequest } from "next/server";
import { row } from "@excursia/domain/csv";
import { visitsDb } from "@/server/visits/db";
import { WATCH_COOKIE, verifyWatch, watchConfig } from "@/server/visits/auth";
import { exportRows, readFilter } from "@/server/visits/queries";

const KINDS = ["sessions", "views", "clicks"] as const;

// labels and paths come from visitors: a cell that a spreadsheet would run as a formula is kept as text
const safe = (v: string | number) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** The visitor log as CSV, for the signed-in watcher only; anyone else gets a plain 404. */
export async function GET(req: NextRequest) {
  // per request, always: without this a build with no password set would bake the 404 in as a static page
  await connection();
  const cfg = watchConfig();
  if (!cfg || !verifyWatch(cfg.secret, req.cookies.get(WATCH_COOKIE)?.value, Date.now())) return new Response("Not found", { status: 404 });
  const kind = KINDS.find((k) => k === req.nextUrl.searchParams.get("kind")) ?? "sessions";
  const f = readFilter(Object.fromEntries(req.nextUrl.searchParams));
  const csv = exportRows(visitsDb(), kind, f, new Date())
    .map((r) => row(r.map(safe)))
    .join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="visitors-${kind}-${f.range}.csv"`,
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
