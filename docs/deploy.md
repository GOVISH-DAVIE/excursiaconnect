# Running ExcursiaConnect behind nginx

How the backend described in [backend-plan.md](backend-plan.md) runs in production: the processes, nginx, deploys, backups and the server itself. Written on 11 November 2026, and revised the same day for the API as its own Express process on its own subdomain ([architecture.md](architecture.md)). Domain names and paths below are examples; adapt them, don't copy them blindly.

**Two names, one site:**
- `events.example.co.ke` serves the web app (Next.js).
- `api.example.co.ke` serves the API (Express).

They share the parent domain, so the session cookie is set for `.example.co.ke` and both see it.

## The shape of it

```
Internet :443 ──> nginx (server A; firewall open for 80 and 443, 22 from admin addresses only; certbot timer)
                   │
                   ├─ events.example.co.ke
                   │    ├─> 127.0.0.1:3001 or :3002   excursia-web@blue / @green   (next start; UI only, no database)
                   │    └─> /srv/excursia/static/_next/static                      (kept across releases)
                   │
                   └─ api.example.co.ke
                        └─> 127.0.0.1:4001 or :4002   excursia-api@blue / @green   (node dist/server.js; Express)
                                                       the only process with a database URL, besides the worker

server A also runs:
  excursia-worker      pg-boss: outbox (email, SMS), reminders, STK queries and reconciliation,
                       virus scans, retention, digests, the archive; its own database role
  clamd                optional; or the worker scans

PostgreSQL     managed, in the chosen region, HA standby, 30-day point-in-time recovery, private network, TLS
               roles: migrator (schema) · app · worker · reporting_ro (oversight); app may only INSERT audit
               (self-managed alternative: pgBackRest or WAL-G to object storage, archive_timeout=60,
                streaming replica on server B)

Object storage private bucket, server-side encryption, versioning with a lifecycle that really deletes,
               quarantine/ → clean/, presigned PUT and GET only

Server B       warm standby: same release, same units, same nginx; DNS TTL 60 s; failover under 1 hour
```

## Processes

**One systemd unit per process, each with its own environment file.** All run as user `excursia`.

- **`excursia-web@blue` and `excursia-web@green`:**
  - run `next start -H 127.0.0.1 -p 3001` (or `3002`) in `apps/web`
  - `EnvironmentFile=/etc/excursia/web.env`, `TimeoutStopSec=30`
  - The web env holds no database URL and no provider keys. It has:
    - `NEXT_PUBLIC_API_URL=https://api.example.co.ke`
    - `API_INTERNAL_URL=http://127.0.0.1:4001` (rewritten on each switch, below), which server components use to prefetch. The public event pages (`/e/<slug>`, `/e/<slug>/deal-room`) are rendered from it and kept a few minutes in the web process, so a newly published event, or a change to it, shows within minutes
- **`excursia-api@blue` and `excursia-api@green`:**
  - run `node dist/server.js` in `apps/api`
  - `EnvironmentFile=/etc/excursia/api.env`, `TimeoutStopSec=15`
  - The API env sets:
    - `API_PORT=4001` (or `4002`, from the instance name)
    - `DATABASE_URL` (the app role)
    - `WEB_ORIGINS=https://events.example.co.ke`
    - `COOKIE_DOMAIN=.example.co.ke`
    - `APP_ENV=production` (or `staging`), which every database command also reads from `migrate.env`
    - `RULES_CLOCK`: staging only, to try dated rules early; the API refuses it in production
    - `STORAGE_DIR`: where uploads are kept until a bucket is chosen (D6), for example `/srv/excursia/uploads`. It must be on backed-up disk, writable by the API only, and outside every release folder
    - `AUTH_SECRET`: 32 random bytes, base64 (`openssl rand -base64 32`). It is different in each environment and never rotated casually, since changing it makes every enrolled authenticator unreadable. An offline copy goes in the vault with the other secrets.
    - the provider keys
    - email (D7, Zoho over SMTP): `MAIL_TRANSPORT=smtp`, `SMTP_HOST=smtp.zoho.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM="Events <noreply@algotech.co.ke>"`. The API sends sign-in codes itself; everything else goes through the worker. Away from production, `MAIL_ALLOW` (addresses or `@domains`) names the only recipients that get real mail; the rest is printed to the log
  - The API refuses to start in production without https origins and a cookie domain.
  - On SIGTERM it stops taking connections, finishes open requests and closes its pool, and exits after 10 s at most.
- **`excursia-worker`** runs `node dist/worker.js` in `apps/api` with `/etc/excursia/worker.env`: `WORKER_DATABASE_URL` (the `worker` role), `AUTH_SECRET`, `WEB_ORIGINS` (the first is the site the emails link to) and the same email settings as the API.
  - It sends the outbox every 3 seconds: a batch claimed with `FOR UPDATE SKIP LOCKED`, so a second worker never sends the same message. A failure is retried after 1, 5, 15, 60 and 240 minutes, then marked failed; a message stuck "sending" by a worker that died goes back in the queue after 10 minutes. pg-boss joins it for timed jobs (reminders, STK queries) when those are built.
  - On SIGTERM it finishes the batch in hand and exits.
  - **Before the first deploy that sends email:** publish SPF, DKIM and DMARC for the sending domain as Zoho gives them, or mail lands in spam. Then `node dist/cli/check-mail.js` logs in without sending; `--to <address>` sends one test.

**Hardening on every unit:**
- `NoNewPrivileges=yes`
- `ProtectSystem=strict`
- `PrivateTmp=yes`
- `MemoryMax` set
- write access only where needed

**Secrets:**
- `/etc/excursia/{web,api,worker,migrate}.env`, mode `0640 root:excursia`, or `systemd-creds`, plus an offline copy in a vault.
- Nothing secret in `NEXT_PUBLIC_*`, which is written into the browser bundle at build time.
- **The web app has no secrets at all:** no server actions write, so it needs no server-actions key either.
- **Sandbox and production provider credentials are separate**, with separate webhook URLs per environment.

**Connections:**
- API: a pool of 10 (`DATABASE_POOL_MAX`). During a switch both colours are up for 30 s, so the database must allow 20 from the app role.
- Worker: 3 for Prisma, plus pg-boss `max: 3`.
- Web: none.
- No pgbouncer: there's one long-lived API process, and transaction pooling would break advisory locks.
- `statement_timeout=5s` and `idle_in_transaction_session_timeout=10s` for the `app` and `worker` roles.

## Deploying a release

1. **In CI:**
   - `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`
   - `npm run build`: `next build` in `apps/web` with `deploymentId` set to the git commit, and the API bundle in `apps/api/dist`
2. Copy the repository with both builds to `/srv/excursia/releases/<commit>` and run `npm ci --omit=dev`. That also generates the Prisma client.
3. Copy `apps/web/.next/static` into the shared static directory. Old hashed files stay for 14 days, so open tabs keep working.
4. Run `npm run db:deploy` (`prisma migrate deploy`) with `/etc/excursia/migrate.env`, as the `migrator` role. Migrations only **expand** in this step: add columns and tables, never drop.
   - **Production:** then run `node apps/api/dist/cli/check-demo.js`. If it finds any demo record, the deploy stops.
   - **Staging:** then run `node apps/api/dist/cli/seed-demo.js` to reload the prototype's data. It refuses if staging holds a real event.
   - **The first production deploy, and after any change to an event's setup:** run `node apps/api/dist/cli/import-reference.js /etc/excursia/reference/<event>.json`. The file is `0640 root:excursia`, as it holds staff names and emails.
   - **The first production deploy:** make the first Algotech admin with `node apps/api/dist/cli/create-admin.js --email <person> --name "<Full Name>"`. No request can make an admin. The person sets a password on the sign-in page (Staff → "Set or reset your password") and must add an authenticator before deciding anything. Organisers then sign themselves up at `/organisers/signup`.
5. **Switch the API first:**
   - Start the idle API colour.
   - Wait for `GET http://127.0.0.1:400x/health/ready` to return 200.
   - Point `upstream-api.conf` at it and run `nginx -t && nginx -s reload`.

   The old web app now talks to the new API, so API changes are additive within a release: new fields and new routes, never a removed or renamed one.
6. **Then the web app:**
   - Set `API_INTERNAL_URL` in `web.env` to the new API colour.
   - Start the idle web colour and wait for `GET /` to return 200 from localhost.
   - Point `upstream-web.conf` at it and reload nginx.
7. Stop both old colours after 30 seconds, then restart the worker.
8. Drops, renames and removed routes (**contract**) ship in the *next* release.

`deploymentId` lets a tab still running the old bundle reload cleanly when it meets the new one.

## nginx

```nginx
# ---- http {} context -------------------------------------------------------------------------
# logs keep no query strings: resume links and one-time codes travel in them
log_format priv '$remote_addr [$time_iso8601] "$request_method $uri" $status $body_bytes_sent $request_time';

# the summit venue's Wi-Fi puts hundreds of people behind one address: exempt it from per-IP limits
geo $venue { default 0; include /etc/nginx/excursia/venue-ips.conf; }
map $venue $lim_ip { 1 ""; 0 $binary_remote_addr; }

# sign-in, codes and payments are API routes of their own, so their limits key on the path
limit_req_zone $lim_ip zone=auth:10m rate=6r/m;
limit_req_zone $lim_ip zone=otp:10m  rate=4r/m;
limit_req_zone $lim_ip zone=pay:10m  rate=10r/m;
limit_req_zone $lim_ip zone=app:20m  rate=30r/s;
limit_req_zone $lim_ip zone=api:20m  rate=30r/s;
limit_req_zone $binary_remote_addr zone=hooks:10m rate=20r/s;
limit_conn_zone $binary_remote_addr zone=perip:10m;
limit_req_status 429;

include /etc/nginx/excursia/upstream-web.conf;   # upstream excursia_web { server 127.0.0.1:3001; keepalive 32; }
include /etc/nginx/excursia/upstream-api.conf;   # upstream excursia_api { server 127.0.0.1:4001; keepalive 32; }

# ---- refuse any host we don't serve ------------------------------------------------------------
server { listen 80 default_server; listen [::]:80 default_server; return 444; }
server { listen 443 ssl default_server; listen [::]:443 ssl default_server; ssl_reject_handshake on; }

server {
  listen 80; listen [::]:80; server_name events.example.co.ke api.example.co.ke;
  location /.well-known/acme-challenge/ { root /var/www/acme; }
  location / { return 301 https://$host$request_uri; }
}

server {
  listen 443 ssl; listen [::]:443 ssl; http2 on;
  server_name events.example.co.ke;
  include /etc/nginx/excursia/tls.conf;   # one certificate for both names (or a wildcard), protocols, session cache
  server_tokens off;
  access_log /var/log/nginx/excursia-web.log priv;

  # the web app takes no uploads and no form posts: everything that writes goes to the API
  client_max_body_size 64k; client_body_timeout 15s; client_header_timeout 15s;
  send_timeout 30s; keepalive_timeout 30s; limit_conn perip 60;

  gzip on; gzip_proxied any; gzip_vary on; gzip_min_length 1024;
  gzip_types text/css application/javascript application/json image/svg+xml text/x-component text/plain;

  # add_header is not inherited into a location that sets its own, so the headers live in a snippet
  include /etc/nginx/excursia/sec-headers.conf;
  #   Strict-Transport-Security "max-age=63072000; includeSubDomains" always
  #   X-Content-Type-Options nosniff · X-Frame-Options DENY · Referrer-Policy strict-origin-when-cross-origin
  #   Permissions-Policy "camera=(self), microphone=(), geolocation=()" · Cross-Origin-Opener-Policy same-origin
  #   the Content-Security-Policy itself is set by Next (decision D12)

  # trust nothing the client sends about itself: overwrite, never append
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_set_header Host              $host;
  proxy_set_header X-Forwarded-Host  $host;
  proxy_set_header X-Real-IP         $remote_addr;
  proxy_set_header X-Forwarded-For   $remote_addr;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Forwarded "";
  proxy_set_header x-middleware-subrequest "";
  proxy_hide_header X-Powered-By;
  proxy_connect_timeout 5s; proxy_send_timeout 60s; proxy_read_timeout 60s;

  location /_next/static/ {
    root /srv/excursia/static; try_files $uri =404;
    access_log off; include /etc/nginx/excursia/sec-headers.conf;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
  }

  location ^~ /adminwatch { include /etc/nginx/excursia/admin-allow.conf; proxy_pass http://excursia_web; }

  location / {
    limit_req zone=app burst=60 nodelay;
    proxy_buffering off;                      # streamed server rendering
    proxy_pass http://excursia_web;
  }
}

# ---- the API: JSON only; CORS, the session cookie and the Origin check are Express's (architecture.md) --------
server {
  listen 443 ssl; listen [::]:443 ssl; http2 on;
  server_name api.example.co.ke;
  include /etc/nginx/excursia/tls.conf;
  server_tokens off;
  access_log /var/log/nginx/excursia-api.log priv;

  # documents and images go straight to object storage with presigned URLs, never through here
  client_max_body_size 128k; client_body_timeout 15s; client_header_timeout 15s;
  send_timeout 30s; keepalive_timeout 30s; limit_conn perip 60;
  gzip on; gzip_proxied any; gzip_vary on; gzip_min_length 1024; gzip_types application/json;

  # HSTS only: the API sets its own deny-all Content-Security-Policy and CORS headers, and nginx must not add
  # a second copy of either
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_set_header Host              $host;
  proxy_set_header X-Real-IP         $remote_addr;
  proxy_set_header X-Forwarded-For   $remote_addr;   # overwrite: Express trusts it from loopback only
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Forwarded "";
  proxy_hide_header X-Powered-By;
  proxy_connect_timeout 5s; proxy_send_timeout 30s; proxy_read_timeout 30s;

  # adjust these paths to the real sign-in, code and payment routes
  location ~ ^/v1/auth/(staff|totp|scanner)/   { limit_req zone=auth burst=5 nodelay; proxy_pass http://excursia_api; }
  location ~ ^/v1/auth/code                    { limit_req zone=otp  burst=3 nodelay; proxy_pass http://excursia_api; }
  location ~ ^/v1/pay(/|$)                      { limit_req zone=pay  burst=5 nodelay; proxy_pass http://excursia_api; }

  # Daraja: the path carries a per-transaction token; Safaricom's addresses are a second layer
  location /v1/hooks/mm/ {
    limit_except POST { deny all; }
    include /etc/nginx/excursia/safaricom-allow.conf;   # allow <ip>; … deny all;
    client_max_body_size 64k; limit_req zone=hooks burst=100 nodelay;
    proxy_pass http://excursia_api;
  }
  # Paystack, Pesapal, Africa's Talking, email: each verified in the API
  location /v1/hooks/ {
    limit_except POST { deny all; }
    client_max_body_size 256k; limit_req zone=hooks burst=100 nodelay;
    proxy_pass http://excursia_api;
  }

  # uploads to local storage (until D6's bucket): one file per signed link, up to UPLOAD_MAX_MB
  location /v1/uploads/ {
    limit_except PUT OPTIONS { deny all; }
    client_max_body_size 16m; client_body_timeout 60s; proxy_request_buffering on;
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://excursia_api;
  }

  # documents opened by staff: short signed links, read-only, never cached by nginx
  location /v1/files/ {
    limit_except GET { deny all; }
    proxy_buffering off; limit_req zone=api burst=20 nodelay;
    proxy_pass http://excursia_api;
  }

  # the deploy script checks health on 127.0.0.1:400x directly; from outside there is nothing to see
  location /health/ { allow 127.0.0.1; deny all; proxy_pass http://excursia_api; }

  location / {
    limit_req zone=api burst=60 nodelay;
    proxy_pass http://excursia_api;
  }
}
```

**Notes on it:**
- **CORS lives in Express, not nginx.** The API answers preflights itself, from `WEB_ORIGINS`. nginx adds no `Access-Control-*` headers, so there is one source of truth.
- **The live board polls**, so it needs no special location. If server-sent events are ever added, give their API location `proxy_buffering off`, `proxy_cache off` and a long `proxy_read_timeout`, and send `X-Accel-Buffering: no` from the route.
- **Rate limits in nginx are coarse on purpose:** carrier-grade NAT and the venue's Wi-Fi share addresses. The real limits, per phone, email, account and device, live in PostgreSQL.
- **Webhooks** carry no cookies and need no Origin check. Their limits are generous, so a provider's retries are never dropped.
- **The API reads the client's IP through Express's `req.ip`**, which trusts forwarded headers from loopback only (`trust proxy` = loopback). nginx overwrites `X-Forwarded-For` rather than appending, so a client cannot plant an address.
- **When a server component prefetches,** it calls the API over loopback and forwards the visitor's address in `X-Forwarded-For`. The API trusts that because it comes from loopback.
- **The visitor log** (the `visitor-log` branch) reads `X-Real-IP` only. Its fallback to the first `X-Forwarded-For` entry is removed (M2.6).

## Backups and recovery

**The PRD's target:** RTO 1 hour and RPO 5 minutes, with 30 days of point-in-time recovery.

- **Database:** managed point-in-time recovery for 30 days (or WAL archiving every 60 seconds to object storage), with an HA standby.
- **Files:** bucket versioning, with a lifecycle that expires old versions so that deletion at retention really deletes.
- **Restore drills**, timed against the RTO: before Tue 15 Dec 2026, before Mon 15 Feb 2027, then monthly. Each drill is written up in a runbook.
- **Failover to server B:** rehearsed in milestone M3.7.
- **Backups age out** with the 30-day window, and this is written into the privacy notice.

## The server itself

- **Firewall:** open for 80 and 443, plus 22 from admin addresses only. SSH by key only.
- `unattended-upgrades` on, and the clock kept with `chrony`.
- Uptime alerts on both names, plus `/health/ready` polled from the server itself.
- Error alerts.
- Structured logs with phone numbers masked.
- Prisma query logging off in production.
- Error tracking scrubbed of personal data.
- `/adminwatch` is allow-listed by IP in nginx now, and moves behind staff sign-in with TOTP in M2.6.
