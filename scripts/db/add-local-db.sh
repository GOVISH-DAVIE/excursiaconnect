#!/usr/bin/env bash
# Adds one more local database beside excursia_dev, set up exactly like it (owner, extensions, grants), for a clean
# walk-through on real screens instead of the demo seed. Roles and passwords are left alone: .env.local still holds
# them, and LOCAL_DATABASE picks the database (apps/api/src/env.ts, packages/db/prisma.config.ts).
#
#   scripts/db/add-local-db.sh excursia_fresh
#   LOCAL_DATABASE=excursia_fresh npm run db:deploy      # the schema
#   LOCAL_DATABASE=excursia_fresh npm run db:admin -- --email you@example.com --name "Your Name"
#   LOCAL_DATABASE=excursia_fresh npm run dev:api
#
# Run scripts/db/setup-local.sh first: it makes the roles. Local machines only.
set -euo pipefail

DB="${1:-}"
if ! [[ "$DB" =~ ^excursia_[a-z0-9_]+$ ]]; then
  echo "usage: scripts/db/add-local-db.sh excursia_<name>" >&2
  exit 2
fi
case "$DB" in excursia_dev|excursia_test|excursia_shadow) echo "$DB is one of setup-local.sh's own databases" >&2; exit 2;; esac

HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
psql_admin() { psql -h "$HOST" -p "$PORT" -d "${1:-postgres}" -v ON_ERROR_STOP=1 -qAt; }

if [ "$(psql_admin <<< "SELECT 1 FROM pg_roles WHERE rolname = 'excursia_migrator'")" != "1" ]; then
  echo "The excursia roles don't exist yet: run scripts/db/setup-local.sh first." >&2
  exit 1
fi

if [ "$(psql_admin <<< "SELECT 1 FROM pg_database WHERE datname = '$DB'")" = "1" ]; then
  echo "Database $DB already exists; left as it is."
else
  echo "Database $DB…"
  psql_admin <<< "CREATE DATABASE $DB OWNER excursia_migrator"
fi
# the same as setup-local.sh gives its databases
psql_admin "$DB" <<SQL
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;
REVOKE ALL ON DATABASE $DB FROM PUBLIC;
GRANT CONNECT ON DATABASE $DB TO excursia_app, excursia_worker, excursia_reporting;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO excursia_migrator;
GRANT USAGE ON SCHEMA public TO excursia_app, excursia_worker, excursia_reporting;
ALTER DEFAULT PRIVILEGES FOR ROLE excursia_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO excursia_app, excursia_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE excursia_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO excursia_app, excursia_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE excursia_migrator IN SCHEMA public GRANT SELECT ON TABLES TO excursia_reporting;
SQL
echo "Done. Next: LOCAL_DATABASE=$DB npm run db:deploy"
