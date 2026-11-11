import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/*
  The visitor log: who opened the prototype (IP and session), the pages they saw with the seconds each was
  visible, and what they clicked. One SQLite file beside a single `next start`, behind nginx. It holds nothing
  of the demo state, which stays in each browser.
*/

export type VisitsDb = Database.Database;

// each entry moves the schema one version on; never edit one that has shipped, add the next
const MIGRATIONS = [
  `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    browser TEXT NOT NULL DEFAULT '',
    os TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '',
    is_bot INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    entry_path TEXT NOT NULL DEFAULT '',
    referrer TEXT NOT NULL DEFAULT '',
    views INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX sessions_last_seen ON sessions (last_seen_at);
  CREATE INDEX sessions_ip ON sessions (ip);

  CREATE TABLE page_views (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    at TEXT NOT NULL,
    visible_seconds INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX page_views_session ON page_views (session_id, at);
  CREATE INDEX page_views_path ON page_views (path);

  CREATE TABLE clicks (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    view_id TEXT NOT NULL,
    path TEXT NOT NULL,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    href TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX clicks_session ON clicks (session_id, at);

  CREATE TABLE signins (
    at TEXT NOT NULL,
    ip TEXT NOT NULL,
    ok INTEGER NOT NULL
  );
  CREATE INDEX signins_ip ON signins (ip, at);
  `,
  // v2: the screen replay. Each browser tab uploads rrweb events in numbered chunks, gzipped JSON arrays.
  `
  CREATE TABLE recordings (
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    tab TEXT NOT NULL,
    seq INTEGER NOT NULL,
    first_ts INTEGER NOT NULL,
    last_ts INTEGER NOT NULL,
    events INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    data BLOB NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (session_id, tab, seq)
  );
  `,
];

function migrate(db: VisitsDb) {
  const at = db.pragma("user_version", { simple: true }) as number;
  for (let v = at; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

/** Opens a log at a path (":memory:" for tests), set up and migrated. */
export function openVisitsDb(file: string): VisitsDb {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 3000");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

const g = globalThis as typeof globalThis & { __visitsDb?: VisitsDb };

/** The process's log, opened once; kept on globalThis so a dev reload does not open the file again. */
export function visitsDb(): VisitsDb {
  // the path is the server's to choose at run time, so the build is told not to trace it
  g.__visitsDb ??= openVisitsDb(resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.VISITS_DB_PATH || "data/visits.db"));
  return g.__visitsDb;
}
