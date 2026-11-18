import "server-only";
import type { VisitsDb } from "./db";

/* The reads behind /adminwatch. Times are stored in UTC and shown in Nairobi time. */

export const RANGES = { today: "Today", "7d": "7 days", "30d": "30 days", "90d": "90 days" } as const;
export type Range = keyof typeof RANGES;
export interface WatchFilter {
  range: Range;
  bots: boolean; // include bots and scripts
  ip: string; // starts with
}

export function readFilter(sp: Record<string, string | string[] | undefined>): WatchFilter {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const range = (Object.keys(RANGES) as Range[]).find((r) => r === one("range")) ?? "7d";
  return { range, bots: one("bots") === "1", ip: one("ip").trim().slice(0, 64) };
}

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // East Africa Time, no daylight saving

/** Where a range starts, in UTC: Nairobi's midnight for today, else so many days back. */
export function rangeStart(range: Range, now: Date): string {
  if (range === "today") {
    const local = new Date(now.getTime() + NAIROBI_OFFSET_MS);
    local.setUTCHours(0, 0, 0, 0);
    return new Date(local.getTime() - NAIROBI_OFFSET_MS).toISOString();
  }
  return new Date(now.getTime() - Number(range.replace("d", "")) * 86_400_000).toISOString();
}

/** The WHERE clause every read shares: sessions seen in the range, bots hidden unless asked, an IP prefix. */
function where(f: WatchFilter, now: Date, alias = "s") {
  const parts = [`${alias}.last_seen_at >= @since`];
  if (!f.bots) parts.push(`${alias}.is_bot = 0`);
  if (f.ip) parts.push(`${alias}.ip LIKE @ip`);
  return { sql: parts.join(" AND "), params: { since: rangeStart(f.range, now), ip: `${f.ip.replace(/[%_]/g, "")}%` } };
}

export interface SessionRow {
  id: string;
  ip: string;
  browser: string;
  os: string;
  device: string;
  is_bot: number;
  started_at: string;
  last_seen_at: string;
  entry_path: string;
  referrer: string;
  views: number;
  clicks: number;
  last_path: string | null;
  visible_seconds: number;
  user_agent: string;
  recorded: number; // replay chunks kept; 0 means there is nothing to play
}

export function totals(db: VisitsDb, f: WatchFilter, now: Date) {
  const w = where(f, now);
  const s = db.prepare(`SELECT COUNT(DISTINCT s.ip) AS people, COUNT(*) AS sessions FROM sessions s WHERE ${w.sql}`).get(w.params) as { people: number; sessions: number };
  const v = db.prepare(`SELECT COUNT(*) AS n FROM page_views v JOIN sessions s ON s.id = v.session_id WHERE ${w.sql} AND v.at >= @since`).get(w.params) as { n: number };
  const c = db.prepare(`SELECT COUNT(*) AS n FROM clicks c JOIN sessions s ON s.id = c.session_id WHERE ${w.sql} AND c.at >= @since`).get(w.params) as { n: number };
  const live = db.prepare(`SELECT COUNT(*) AS n FROM sessions s WHERE ${w.sql} AND s.last_seen_at >= @live`).get({ ...w.params, live: new Date(now.getTime() - 5 * 60_000).toISOString() }) as { n: number };
  return { people: s.people, sessions: s.sessions, views: v.n, clicks: c.n, live: live.n };
}

export function sessionList(db: VisitsDb, f: WatchFilter, now: Date, limit = 200): SessionRow[] {
  const w = where(f, now);
  return db
    .prepare(
      `SELECT s.*,
        (SELECT path FROM page_views WHERE session_id = s.id ORDER BY at DESC LIMIT 1) AS last_path,
        (SELECT COALESCE(SUM(visible_seconds), 0) FROM page_views WHERE session_id = s.id) AS visible_seconds,
        (SELECT COUNT(*) FROM recordings WHERE session_id = s.id) AS recorded
       FROM sessions s WHERE ${w.sql} ORDER BY s.last_seen_at DESC LIMIT ${Math.floor(limit)}`,
    )
    .all(w.params) as SessionRow[];
}

/** One line per IP address: what reads as one person, or one office behind a shared address. */
export function people(db: VisitsDb, f: WatchFilter, now: Date, limit = 100) {
  const w = where(f, now);
  return db
    .prepare(
      `SELECT s.ip, COUNT(*) AS sessions, MIN(s.started_at) AS first_seen, MAX(s.last_seen_at) AS last_seen,
        SUM(s.views) AS views, SUM(s.clicks) AS clicks,
        CAST(SUM((julianday(s.last_seen_at) - julianday(s.started_at)) * 86400) AS INTEGER) AS seconds,
        (SELECT browser || ' · ' || os || ' · ' || device FROM sessions x WHERE x.ip = s.ip ORDER BY x.last_seen_at DESC LIMIT 1) AS agent
       FROM sessions s WHERE ${w.sql} GROUP BY s.ip ORDER BY last_seen DESC LIMIT ${Math.floor(limit)}`,
    )
    .all(w.params) as { ip: string; sessions: number; first_seen: string; last_seen: string; views: number; clicks: number; seconds: number; agent: string }[];
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Each page: how often it was opened, how long it stayed in view, and how much was clicked on it. */
export function pages(db: VisitsDb, f: WatchFilter, now: Date) {
  const w = where(f, now);
  const views = db.prepare(`SELECT v.path, v.visible_seconds FROM page_views v JOIN sessions s ON s.id = v.session_id WHERE ${w.sql} AND v.at >= @since`).all(w.params) as { path: string; visible_seconds: number }[];
  const clicks = db.prepare(`SELECT c.path, COUNT(*) AS n FROM clicks c JOIN sessions s ON s.id = c.session_id WHERE ${w.sql} AND c.at >= @since GROUP BY c.path`).all(w.params) as { path: string; n: number }[];
  const by = new Map<string, number[]>();
  for (const v of views) by.set(v.path, [...(by.get(v.path) ?? []), v.visible_seconds]);
  return [...by.entries()]
    .map(([path, secs]) => ({ path, views: secs.length, avg: Math.round(secs.reduce((a, b) => a + b, 0) / secs.length), median: median(secs), clicks: clicks.find((c) => c.path === path)?.n ?? 0 }))
    .sort((a, b) => b.views - a.views);
}

export function topClicks(db: VisitsDb, f: WatchFilter, now: Date, limit = 30) {
  const w = where(f, now);
  return db
    .prepare(`SELECT c.label, c.kind, c.path, MAX(c.href) AS href, COUNT(*) AS n FROM clicks c JOIN sessions s ON s.id = c.session_id WHERE ${w.sql} AND c.at >= @since GROUP BY c.label, c.kind, c.path ORDER BY n DESC LIMIT ${Math.floor(limit)}`)
    .all(w.params) as { label: string; kind: string; path: string; href: string; n: number }[];
}

/** One session: the session, then each page in order with the clicks made on it. */
export function sessionDetail(db: VisitsDb, id: string) {
  const s = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Omit<SessionRow, "last_path" | "visible_seconds" | "recorded"> | undefined;
  if (!s) return undefined;
  const views = db.prepare("SELECT id, path, at, visible_seconds FROM page_views WHERE session_id = ? ORDER BY at").all(id) as { id: string; path: string; at: string; visible_seconds: number }[];
  const clicks = db.prepare("SELECT view_id, at, kind, label, href FROM clicks WHERE session_id = ? ORDER BY at").all(id) as { view_id: string; at: string; kind: string; label: string; href: string }[];
  return { session: s, views: views.map((v) => ({ ...v, clicks: clicks.filter((c) => c.view_id === v.id) })), orphanClicks: clicks.filter((c) => !views.some((v) => v.id === c.view_id)) };
}

/** Rows for the CSV export. */
export function exportRows(db: VisitsDb, kind: "sessions" | "views" | "clicks", f: WatchFilter, now: Date): (string | number)[][] {
  const w = where(f, now);
  if (kind === "sessions")
    return [
      ["session", "ip", "browser", "os", "device", "bot", "started (UTC)", "last seen (UTC)", "pages", "clicks", "entry page", "referrer"],
      ...(db.prepare(`SELECT id, ip, browser, os, device, is_bot, started_at, last_seen_at, views, clicks, entry_path, referrer FROM sessions s WHERE ${w.sql} ORDER BY started_at`).all(w.params) as Record<string, string | number>[]).map((r) => Object.values(r)),
    ];
  if (kind === "views")
    return [
      ["session", "ip", "page", "opened (UTC)", "visible seconds"],
      ...(db.prepare(`SELECT v.session_id, s.ip, v.path, v.at, v.visible_seconds FROM page_views v JOIN sessions s ON s.id = v.session_id WHERE ${w.sql} AND v.at >= @since ORDER BY v.at`).all(w.params) as Record<string, string | number>[]).map((r) => Object.values(r)),
    ];
  return [
    ["session", "ip", "page", "clicked (UTC)", "kind", "label", "link"],
    ...(db.prepare(`SELECT c.session_id, s.ip, c.path, c.at, c.kind, c.label, c.href FROM clicks c JOIN sessions s ON s.id = c.session_id WHERE ${w.sql} AND c.at >= @since ORDER BY c.at`).all(w.params) as Record<string, string | number>[]).map((r) => Object.values(r)),
  ];
}
