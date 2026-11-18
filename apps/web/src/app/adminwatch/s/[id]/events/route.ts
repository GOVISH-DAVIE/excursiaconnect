import { connection, type NextRequest } from "next/server";
import { visitsDb } from "@/server/visits/db";
import { WATCH_COOKIE, verifyWatch, watchConfig } from "@/server/visits/auth";
import { recordedTabs, tabEvents } from "@/server/visits/replay";

/** One tab's screen recording as rrweb events, for the player; the signed-in watcher only, a 404 for anyone else. */
export async function GET(req: NextRequest, ctx: RouteContext<"/adminwatch/s/[id]/events">) {
  await connection();
  const cfg = watchConfig();
  if (!cfg || !verifyWatch(cfg.secret, req.cookies.get(WATCH_COOKIE)?.value, Date.now())) return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  const db = visitsDb();
  const tabs = recordedTabs(db, id);
  const tab = tabs.find((t) => t.tab === req.nextUrl.searchParams.get("tab"))?.tab ?? tabs[0]?.tab;
  if (!tab) return new Response("Not found", { status: 404 });
  return new Response(tabEvents(db, id, tab), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
