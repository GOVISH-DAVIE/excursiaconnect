#!/usr/bin/env bash
# Sets up ExcursiaConnect's PostgreSQL on a developer machine: four roles, three databases, the extensions, and the
# connection strings in .env.local (gitignored). Safe to run again: existing roles get fresh passwords, existing
# databases are kept. Production and staging are provisioned the same way by whoever runs the server (deploy.md).
#
#   scripts/db/setup-local.sh            # uses the superuser your psql connects as, on localhost:5432
#   PGPORT=5433 scripts/db/setup-local.sh
#
# Roles (names are the same in every environment, so migrations can grant to them):
#   excursia_migrator   owns the schema; runs migrations; nothing else uses it
#   excursia_app        the web process: reads and writes rows; may only INSERT into the audit log
#   excursia_worker     the job worker: the same row rights as the app
#   excursia_reporting  read-only, for Momentum's oversight and reports
set -euo pipefail

HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
ENV_FILE="${ENV_FILE:-.env.local}"
DBS=(excursia_dev excursia_test excursia_shadow)

psql_admin() { psql -h "$HOST" -p "$PORT" -d "${1:-postgres}" -v ON_ERROR_STOP=1 -qAt; }
pw() { openssl rand -hex 24; }

MIGRATOR_PW=$(pw); APP_PW=$(pw); WORKER_PW=$(pw); REPORTING_PW=$(pw)

echo "Roles…"
psql_admin <<SQL
DO \$\$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('excursia_migrator', '$MIGRATOR_PW'), ('excursia_app', '$APP_PW'),
      ('excursia_worker', '$WORKER_PW'), ('excursia_reporting', '$REPORTING_PW')) AS t(name, pw)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.name) THEN
      EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', r.name, r.pw);
    ELSE
      EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', r.name, r.pw);
    END IF;
  END LOOP;
END \$\$;
-- connection limits and timeouts (backend-plan.md, performance budgets)
ALTER ROLE excursia_app SET statement_timeout = '5s';
ALTER ROLE excursia_app SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE excursia_worker SET statement_timeout = '30s';
ALTER ROLE excursia_worker SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE excursia_reporting SET statement_timeout = '15s';
ALTER ROLE excursia_reporting SET default_transaction_read_only = on;
-- every role reads and writes times in the summit's zone
ALTER ROLE excursia_migrator SET timezone = 'Africa/Nairobi';
ALTER ROLE excursia_app SET timezone = 'Africa/Nairobi';
ALTER ROLE excursia_worker SET timezone = 'Africa/Nairobi';
ALTER ROLE excursia_reporting SET timezone = 'Africa/Nairobi';
SQL

for db in "${DBS[@]}"; do
  echo "Database $db…"
  if [ "$(psql_admin <<< "SELECT 1 FROM pg_database WHERE datname = '$db'")" != "1" ]; then
    psql_admin <<< "CREATE DATABASE $db OWNER excursia_migrator"
  fi
  psql_admin "$db" <<SQL
-- the double-booking guard needs btree_gist; created by the superuser, used by everyone
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;
REVOKE ALL ON DATABASE $db FROM PUBLIC;
GRANT CONNECT ON DATABASE $db TO excursia_app, excursia_worker, excursia_reporting;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO excursia_migrator;
GRANT USAGE ON SCHEMA public TO excursia_app, excursia_worker, excursia_reporting;
-- whatever the migrator creates, the app and worker may use rows of, and reporting may read
ALTER DEFAULT PRIVILEGES FOR ROLE excursia_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO excursia_app, excursia_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE excursia_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO excursia_app, excursia_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE excursia_migrator IN SCHEMA public GRANT SELECT ON TABLES TO excursia_reporting;
SQL
done

url() { echo "postgresql://$1:$2@$HOST:$PORT/$3"; }
upsert() {
  local key=$1 value=$2
  touch "$ENV_FILE"
  if grep -q "^$key=" "$ENV_FILE"; then
    # replace in place without echoing the value anywhere
    KEY="$key" VALUE="$value" python3 - "$ENV_FILE" <<'PY'
import os, sys
p = sys.argv[1]; k = os.environ["KEY"]; v = os.environ["VALUE"]
lines = open(p).read().splitlines()
open(p, "w").write("\n".join(f"{k}={v}" if l.startswith(k + "=") else l for l in lines) + "\n")
PY
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

echo "Connection strings → $ENV_FILE"
grep -q "^# PostgreSQL" "$ENV_FILE" 2>/dev/null || printf '\n# PostgreSQL (scripts/db/setup-local.sh); never commit these\n' >> "$ENV_FILE"
# the demo seed loads only where APP_ENV is local or staging (backend-plan.md, M0.3)
grep -q "^APP_ENV=" "$ENV_FILE" || printf 'APP_ENV=local\n' >> "$ENV_FILE"
# the API's own secret: signs one-time codes and encrypts TOTP secrets (M0.4); kept if already there, since
# changing it makes every enrolled authenticator unreadable
grep -q "^AUTH_SECRET=" "$ENV_FILE" || printf 'AUTH_SECRET=%s\n' "$(openssl rand -base64 32)" >> "$ENV_FILE"
upsert DATABASE_URL "$(url excursia_app "$APP_PW" excursia_dev)"
upsert WORKER_DATABASE_URL "$(url excursia_worker "$WORKER_PW" excursia_dev)"
upsert REPORTING_DATABASE_URL "$(url excursia_reporting "$REPORTING_PW" excursia_dev)"
upsert MIGRATE_DATABASE_URL "$(url excursia_migrator "$MIGRATOR_PW" excursia_dev)"
upsert SHADOW_DATABASE_URL "$(url excursia_migrator "$MIGRATOR_PW" excursia_shadow)"
upsert TEST_DATABASE_URL "$(url excursia_app "$APP_PW" excursia_test)"
upsert TEST_MIGRATE_DATABASE_URL "$(url excursia_migrator "$MIGRATOR_PW" excursia_test)"
echo "Done. Next: npm run db:migrate, then npm run db:seed:demo"
