# Running ExcursiaConnect behind nginx

How the backend described in [backend-plan.md](backend-plan.md) runs in production: the processes, nginx, deploys, backups and the server itself. Written on 11 November 2026. Domain names and paths below are examples; adapt them, don't copy them blindly.

## The shape of it

```
Internet :443 ──> nginx (server A; firewall open for 80 and 443, 22 from admin addresses only; certbot timer)
                   ├─> 127.0.0.1:3001 or :3002   excursia-web@blue / excursia-web@green  (next start)
                   └─> /srv/excursia/static/_next/static   (kept across releases)

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

**One systemd unit per process, each with its own environment file:**
- `excursia-web@blue` and `excursia-web@green` run `next start -H 127.0.0.1 -p 3001` (or `3002`) as user `excursia`, with `EnvironmentFile=/etc/excursia/web.env` and `TimeoutStopSec=30`. They drain on SIGTERM.
- `excursia-worker` runs the pg-boss worker with `/etc/excursia/worker.env` and stops gracefully (`boss.stop()`).

**Hardening on every unit:**
- `NoNewPrivileges=yes`
- `ProtectSystem=strict`
- `PrivateTmp=yes`
- `MemoryMax` set
- write access only where needed

**Secrets:**
- `/etc/excursia/{web,worker,migrate}.env`, mode `0640 root:excursia`, or `systemd-creds`, plus an offline copy in a vault.
- Nothing secret in `NEXT_PUBLIC_*`, which is written into the browser bundle at build time.
- A **stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`** across releases.
- **Sandbox and production provider credentials are separate**, with separate webhook URLs per environment.

**Connections:**
- Web: Prisma `connection_limit=10`.
- Worker: Prisma 3, plus pg-boss `max: 3`.
- No pgbouncer: there's one long-lived web process, and transaction pooling would break advisory locks.
- `statement_timeout=5s` and `idle_in_transaction_session_timeout=10s` for the `app` and `worker` roles.

## Deploying a release

1. **In CI:** tests, then `next build` with `deploymentId` set to the git commit.
2. Copy the build to `/srv/excursia/releases/<commit>` and run `npm ci --omit=dev`.
3. Copy `.next/static` into the shared static directory. Old hashed files stay for 14 days, so open tabs keep working.
4. Run `prisma migrate deploy` as the `migrator` role. Migrations only **expand** in this step: add columns and tables, never drop.
5. Start the idle colour, wait for `GET /api/health` to pass from localhost, then switch `upstream.conf` to it and run `nginx -t && nginx -s reload`.
6. Stop the old colour after 30 seconds, then restart the worker.
7. Drops and renames (**contract**) ship in the *next* release.

The stable encryption key and `deploymentId` stop the "Failed to find Server Action" error mid-deploy. The client also retries once if it sees it.

## nginx

```nginx
# ---- http {} context -------------------------------------------------------------------------
# logs keep no query strings: resume links and one-time codes travel in them
log_format priv '$remote_addr [$time_iso8601] "$request_method $uri" $status $body_bytes_sent $request_time';

# server actions POST to the page's own path, so sign-in, code and payment limits key on POST only
map $request_method $post_ip { POST $binary_remote_addr; default ""; }
# the summit venue's Wi-Fi puts hundreds of people behind one address: exempt it from per-IP limits
geo $venue { default 0; include /etc/nginx/excursia/venue-ips.conf; }
map $venue $lim_ip   { 1 ""; 0 $binary_remote_addr; }
map $venue $lim_post { 1 ""; 0 $post_ip; }

limit_req_zone $lim_post zone=auth:10m rate=6r/m;
limit_req_zone $lim_post zone=otp:10m  rate=4r/m;
limit_req_zone $lim_post zone=pay:10m  rate=10r/m;
limit_req_zone $lim_ip   zone=app:20m  rate=30r/s;
limit_req_zone $binary_remote_addr zone=hooks:10m rate=20r/s;
limit_conn_zone $binary_remote_addr zone=perip:10m;
limit_req_status 429;

include /etc/nginx/excursia/upstream.conf;   # upstream excursia_web { server 127.0.0.1:3001; keepalive 32; }

# ---- refuse any host we don't serve ------------------------------------------------------------
server { listen 80 default_server; listen [::]:80 default_server; return 444; }
server { listen 443 ssl default_server; listen [::]:443 ssl default_server; ssl_reject_handshake on; }

server {
  listen 80; listen [::]:80; server_name app.example.co.ke;
  location /.well-known/acme-challenge/ { root /var/www/acme; }
  location / { return 301 https://$host$request_uri; }
}

server {
  listen 443 ssl; listen [::]:443 ssl; http2 on;
  server_name app.example.co.ke;
  ssl_certificate     /etc/letsencrypt/live/app.example.co.ke/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.example.co.ke/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3; ssl_prefer_server_ciphers off;
  ssl_session_cache shared:SSL:10m; ssl_session_tickets off;
  server_tokens off;
  access_log /var/log/nginx/excursia.log priv;

  # documents and images go straight to object storage, never through here
  client_max_body_size 1m; client_body_timeout 15s; client_header_timeout 15s;
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
  proxy_set_header X-Forwarded-Host  $host;        # server actions compare Origin with this
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

  # adjust these paths to the real sign-in, code and payment pages
  location ~ ^/(signin|staff/signin|scanner/signin) { limit_req zone=auth burst=5 nodelay; proxy_buffering off; proxy_pass http://excursia_web; }
  location ~ ^/(apply/verify|code)                  { limit_req zone=otp  burst=3 nodelay; proxy_buffering off; proxy_pass http://excursia_web; }
  location ~ ^/pay(/|$)                              { limit_req zone=pay  burst=5 nodelay; proxy_buffering off; proxy_pass http://excursia_web; }

  # Daraja: the path carries a per-transaction token; Safaricom's addresses are a second layer
  location /api/hooks/mm/ {
    limit_except POST { deny all; }
    include /etc/nginx/excursia/safaricom-allow.conf;   # allow <ip>; … deny all;
    client_max_body_size 64k; limit_req zone=hooks burst=100 nodelay;
    proxy_pass http://excursia_web;
  }
  # Paystack, Pesapal, Africa's Talking, email: each verified in the app
  location /api/hooks/ {
    limit_except POST { deny all; }
    client_max_body_size 256k; limit_req zone=hooks burst=100 nodelay;
    proxy_pass http://excursia_web;
  }

  location = /api/health { allow 127.0.0.1; deny all; proxy_pass http://excursia_web; }
  location ^~ /adminwatch { include /etc/nginx/excursia/admin-allow.conf; proxy_pass http://excursia_web; }

  location / {
    limit_req zone=app burst=60 nodelay;
    proxy_buffering off;                      # streamed server rendering
    proxy_pass http://excursia_web;
  }
}
```

**Notes on it:**
- **The live board polls**, so it needs no special location. If server-sent events are ever added, give their location `proxy_buffering off`, `proxy_cache off` and a long `proxy_read_timeout`, and send `X-Accel-Buffering: no` from the route handler.
- **Rate limits in nginx are coarse on purpose:** carrier-grade NAT and the venue's Wi-Fi share addresses. The real limits, per phone, email, account and device, live in PostgreSQL.
- **Webhooks** carry no cookies and need no Origin check. Their limits are generous, so a provider's retries are never dropped.
- **The app reads the client's IP only from `X-Real-IP`.** The `visitor-log` branch's fallback to the first `X-Forwarded-For` entry is removed (M2.6).

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
- Uptime and error alerts; structured logs with phone numbers masked; Prisma query logging off in production; error tracking scrubbed of personal data.
- `/adminwatch` is allow-listed by IP in nginx now, and moves behind staff sign-in with TOTP in M2.6.
