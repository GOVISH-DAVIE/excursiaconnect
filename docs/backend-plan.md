# Backend and integration plan

How ExcursiaConnect goes from a browser-only prototype to a real backend, in phases with milestones. Written on 11 November 2026 on branch `backend`, cut from `deal-room-vis-a-vis` (PR #2), and revised the same day after four independent reviews (see [Reviews](#what-the-reviews-found)).

**The stack, decided:**
- Node.js and TypeScript.
- **Prisma** on **PostgreSQL**.
- **An Express API, separate from Next.js** (revised 11 Nov 2026, D13). It runs as its own Node process on its own subdomain (`api.example.co.ke`), and is the only process that talks to the database, apart from the job worker. It takes every write and every read, the payment webhooks, and later the apps.
- **Next.js serves the UI only** (`events.example.co.ke`). It has no database connection and no server actions that write.
- **One repository, npm workspaces:**
  - `apps/web` (Next.js)
  - `apps/api` (Express)
  - `packages/domain` (the rules)
  - `packages/contracts` (Zod schemas shared by both apps)
  - `packages/db` (Prisma)
- Both processes run on loopback **behind nginx**.
- **On the client: TanStack Query for server data, the Context API for app-wide facts, custom hooks as the only way screens get or change data.** No Redux and no Redux-style global store; API calls are kept apart from the UI.

How the code is layered, with the clean-code rules and one feature worked end to end, is in [architecture.md](architecture.md). How it runs on the server (processes, nginx, deploys, backups) is in [deploy.md](deploy.md).

## Where we start

The prototype keeps the whole app in one reducer in the browser (`src/lib/store.tsx`, now `apps/web/src/lib/store.tsx`), saved to localStorage under a seed version. Nothing is on a server:
- no database
- no sign-in
- no payments, email or SMS
- no tests

The one exception is the visitor log on the unmerged `visitor-log` branch, which writes to SQLite.

Paths in the table are where things were on 11 November, before the monorepo: `src/lib` is now `packages/domain/src`, and `src/app` is now `apps/web/src/app`.

| Area | Where the rules lived | Size |
| --- | --- | --- |
| Core platform (organisers, events, tiers, registration, delegates, zones, rooms, sessions, scanning, team, payouts) | `src/lib/store.tsx`, `src/lib/types.ts`, `src/lib/roles.ts` | 58 actions, 17 record types |
| Exhibition (halls, booths, exhibitors, contracts, invoices, payments, on-site logistics) | `src/lib/expo/*` | 37 actions, 23 record types |
| Deal Room (applications, review, fee, challenges, matching, consent, meetings, sessions, pipeline, conversion) | `src/lib/dealroom/*` | 77 actions, 33 record types |
| Screens | `src/app/*` | 53 routes, no route handlers |

**What helps:** the rules are already separate from the screens. Reducers are `(state, action) => state`, the selectors (`slotProblems`, `matchable`, `pipelineOf`, `drCan`) are pure, and `seed.ts` gives realistic fixtures. Of the ~172 actions, about 12 are prototype-only and drop out. Of the rest:
- about 95 are simple: one record and a history note
- about 45 are medium: several records in one module
- about 20 are hard: payments, sequences, bookings, scanning, offline sync, payouts, and the work the demo clock triggers

## What the reviews found

Four reviewers each read the plan and the code from one angle: build feasibility, code quality, performance, and running behind nginx with security. I checked each finding against the code before taking it on. **Verdict: proceed, with the changes below**, all now reflected in this plan.

**The rules are not yet safe to run on a server.**
1. The core reducer and the scanner rules sit in a `"use client"` file (`store.tsx:1`). A server action importing them gets a client reference, not the function.
2. "Now" is read from the machine clock or the demo clock, ids come from `Math.random`, and `nowTime()` uses the server's local time zone. On a UTC server every rule would be three hours off Nairobi.
3. The acting user comes from the state (`actingStaffId`, `actingMemberId`) or from the action itself. Exhibition's `as: "exhibitor"` skips every permission check (`expo/onsite-reducer.ts:60-63`).
4. Refusals carry no reason: there are 55 silent `return state` in the Deal Room reducer alone.

**The reducers trust what the browser sends.**
- Registration accepts any delegate and order it receives.
- A scan stores the browser's own verdict.
- A draft save spreads the whole record sent (`dealroom/reducer.ts:201`), so a crafted request could set its own fee or decisions.
- The fee is marked paid from the browser with a reference the browser supplies (`dr/[appId]/portal.tsx:307`).
- Staff accounts are created and changed with no permission check (`dr/staffAdd`, `staffSet`, `staffRevoke`).

**Hand-writing ~170 commands won't make 15 December.**
- A Deal Room is small (about 0.8 MB, hundreds of applications), and its reducers already work on the whole aggregate.
- **Running the existing reducer on the server, under a per-event lock**, ships far sooner and keeps the rules identical.

**A database constraint can't enforce double-booking on its own.**
- Whether a proposed meeting still holds its slot depends on the clock (`logic.ts:652-653`), and a constraint can't read the clock.
- The fix is a table of the bookings that currently hold a slot, kept by the commands, with the constraint on that table.

**Other findings:**
- **Performance:** auto-propose tries about 1,440 slots per pair (480 ms in memory for 55 proposals), and the prototype ships 1.2 MB to every browser.
- **Badge codes:** they come from a character sum of the id, so `dr_cs50` and `dr_cs05` collide.
- **Security:** nginx must overwrite `X-Forwarded-For` and set `X-Forwarded-Host`, or server actions fail their origin check. (With the Express API, no server action writes; the overwrite still matters, because the API reads the client's address from it.)
- **CSP:** a nonce-based CSP is incompatible with the partial prerendering this app uses.

## Architecture

### First: make the rules server-safe (milestone M0.0)

Before any database work:
1. **Split `store.tsx`.** The reducer and every rule move to `src/lib/core/*.ts` with no React import. `store.tsx` keeps only the provider, `useStore` and localStorage, and re-exports the rules so screens don't change.
2. **One context passed into every reducer and time-dependent rule:**
   ```ts
   type Ctx = { now: string; newId: (prefix: string) => string; actor: Actor | null };
   ```
   - In the prototype, `now` comes from the demo clock, as today.
   - On the server, `now` is the server clock in **Africa/Nairobi** (with a staging-only override), `newId` is a database-safe id, and `actor` comes from the session.
   - `stamp`, `nowTime`, `Date.now`, `Math.random` and `uid` leave `src/lib`.
3. **Who is acting comes only from `ctx.actor`.** `actingStaffId`, `actingMemberId`, `scanSession` and `as: "exhibitor"` become prototype-only plumbing that builds `ctx.actor`.
4. **Refusals return a reason:** reducers return `{ state, refusal?: string }`, so the server and the screens give the same reason text.
5. **Vitest in the repo**, with seed-based tests, starting with the actions Phase 1 uses.

### How a write runs on the server

A screen calls a custom hook (`useAssignReviewer`). The hook calls the module's API client, and the API client calls **the Express route for that one use case** (`POST /v1/dealroom/:eventId/applications/assign`) with the session cookie. The route checks the session, validates its body with the Zod contract from `@excursia/contracts`, and calls the module's service. Screens never send action objects. The layers are set out in [architecture.md](architecture.md).

Inside the service, every write goes through one helper, `runCommand`, which builds the rule's action from the validated input and runs these steps:

```
session → actor
  → deny by default: is this use case allowed for this actor at all?
  → ownership: does the actor own, or may they act on, every record named?
  → per-event advisory lock (pg_advisory_xact_lock)
  → load the module's aggregate for that event
  → run the existing reducer with ctx (server now, server ids, actor)
  → refused? return the reason, write nothing
  → save only the records whose object identity changed (immutable updates make this cheap)
  → write side tables in the same transaction: audit, outbox, busy slots, counters
  → commit → return the DTO, or refuse with HTTP 409 and the rule's own reason as the message
```

The hook then invalidates or updates its TanStack Query keys.

**Two storage styles, chosen by volume:**
- **Aggregate style:** the Deal Room's business records (applications, matches, meetings, sessions, opportunities, configuration) and the Exhibition's.
  - Stored as **JSONB rows** with indexed **summary columns** kept by the save step: event, type, status, reference, assignee, fee state, pipeline status.
  - Lists and dashboards read the summary columns with SQL. The full record loads only on detail pages and inside commands.
  - Writes are serialised per event, which costs little at these sizes and removes a class of race conditions.
- **Normalised tables with targeted commands:** high-volume and money records.
  - delegates, tiers and badges
  - scans and presence
  - payments and refunds
  - the outbox
  - busy slots
  - counters
  - audit
  
  These never go through an aggregate load.

**When to break a hot path out of the aggregate:** when the load test shows a Deal Room write over its budget (below). Meeting arrivals and outcomes on summit day are the likeliest, and the busy-slot table already makes bookings safe outside the aggregate.

**Prototype-only actions get no server command:** `reset`, `hydrate`, `setCurrentDelegate`, `dr/clock`, `dr/actAs`, `expo/clock`, `expo/actAs`, `dr/offline` and `dr/sync`. Scanner sign-in becomes real sign-in. `dr/payFee` is never sent from a browser: only the payment webhook path calls it.

### How a read runs

- **Services return only what the viewer may see.** Today the whole state goes to every browser (1.2 MB on the seed). Under the services, staff screens get a projection, an applicant gets their own record, and the badge page gets the badge, each as a DTO, never a Prisma model.
- **TanStack Query holds the data in the browser.** Each module has query contracts (`queries.ts`): the key and the options in one place, imported by both the server prefetch and the client hook.
- **The first paint has data:**
  - A page's server component prefetches inside `<Suspense>`. It calls the API over loopback with the visitor's cookie, the same call the browser would make.
  - It passes the result down with `<HydrationBoundary>`.
  - The client hook reads the same key with `useSuspenseQuery`. Later reads go from the browser to the API directly.
- **Caching:**
  - Per-viewer data is dynamic and uses the standard `dehydrate`.
  - Public data (an event page) is fetched without a cookie and cached in Next with `'use cache'` and a `cacheLife` of a minute, using the Next guide's prerenderable hydration helper, because `dehydrate()` reads the clock during a prerender.
  - Edits show within that minute. That keeps the web app free of any invalidation secret.
- **Sessions are read inside `<Suspense>`:** `cacheComponents` is on, so a cookie can't be read at the top of the root layout. `connection()` goes where a server component needs "now" with no request API (for example, whether applications are open).
- **Writes to one record queue one at a time:** mutations on the same record share a TanStack Query `scope`, so they run in order. Autosaves merge, "save and submit" is one mutation, and screens wait for the result before navigating. Phase 1 shows a pending state. Optimistic updates (`onMutate`) come where a screen needs them, such as the live board.
- **Context holds no records:** only the session, the current event and toasts (architecture.md, "Where state lives").

### Concurrency and correctness

- **No double-booking:**
  - A `DrBusy` table holds every slot a meeting or session currently holds, per room and table, and per participant: `tsrange [start, end + buffer)`, plus an `active` flag.
  - **Exclusion constraints** (btree_gist) apply `WHERE active`.
  - Lapsed proposals are released by a job and, before every booking, inside the same transaction.
  - Caps are counted under `pg_advisory_xact_lock` on both participants, taken in sorted order.
  - Constraint error 23P01 is mapped back to the reducer's reason by re-running `slotProblems` on a fresh read.
  - Meetings gain `seekerId` and `providerId` columns.
- **Sequences:** references come from `UPDATE counter SET n = n + 1 RETURNING n` inside the submit transaction, with a unique index on (event, reference). Badge codes are random with a retry on the unique index.
- **Payments:**
  - The fee is settled by `UPDATE … WHERE paid_at IS NULL AND waived_at IS NULL`, checking the row count.
  - Each webhook first does `INSERT INTO payment(provider, txn_id) … ON CONFLICT DO NOTHING`. In the same transaction it settles the fee, issues the badge and writes the outbox.
  - Calls out to providers happen outside transactions.
- **Isolation:** READ COMMITTED with the locks and constraints above. Serializable isolation isn't needed.
- **Counters:** `tier.sold` becomes a count, or sits behind one function. Zone occupancy is one conditional `UPDATE … WHERE occupancy < capacity RETURNING`.

### Time and jobs

- **The server's "now" is Africa/Nairobi.** Times are stored as `timestamptz`, and the loader converts back to the `YYYY-MM-DD HH:MM` strings the rules expect.
- **Everything the demo clock did becomes a pg-boss job**, pulled out of `dr/clock` and `expo/clock` as `job(state, from, to, ctx)`:
  - RFI expiry, the fee reminder after three days, intro expiry
  - meeting reminders 24 hours and 30 minutes before
  - lapsing proposals and holds
  - the 19:00 daily report
  - weekly digests and the monthly review
  - the archive at the conversion end date, and document deletion
- The staging clock override drives the jobs too, and **refuses to start when `APP_ENV=production`**.
- **Demo-only state stays out of the schema:** `dr.script`, `queue`/`offline`, `actingStaffId` and `clock`.

### Data model, in outline

One Prisma schema, keyed by `eventId` everywhere, even where the code is single-event for February. Ids stay strings, so seed ids import as they are.

| Group | Style | Models (first cut) |
| --- | --- | --- |
| Identity and access | Tables | `User`, `Session`, `OtpCode`, `TotpSecret`, `Membership` (role per organiser or event), `ScannerDevice`, `AuditEntry` (insert-only), `RateLimit` |
| Events | Tables | `Organiser`, `Event`, `Tier`, `FormField`, `Zone`, `Room`, `ProgrammeSession`, `Shift`, `Sponsor`, `SpeakerProfile`, `Media` |
| Delegates and money | Tables | `Delegate`, `Badge`, `Order`, `Payment` (unique provider and transaction id, raw payload), `Refund`, `Payout`, `Campaign`, `Scan`, `Presence`, `RoomScan` |
| Deal Room | Aggregate | `DrConfig`, `DrStaff`, `DrApplication`, `DrMatch`, `DrMeeting`, `DrSession`, `DrOpportunity`, `DrException`, `DrIncident`: each a JSONB record plus summary columns |
| Deal Room | Tables | `DrBusy`, `DrCounter`, `DrConsent` and `DrAccess` (the consent and access logs); the fee is a row in the shared `Payment` table |
| Exhibition | Aggregate | `ExpoConfig`, `Hall`, `Booth`, `Exhibitor`, `Booking`, `Invoice`, `StandOrder`, `Issue` (JSONB plus summary columns) |
| Platform | Tables | `Outbox` (email, SMS, push; no 400-message cap), `File` (object storage key, quarantine state, retention date), `VisitSession`, `PageView`, `Click` |

**Indexes worth having from the start:**
- `DrApplication`: (event, type, status), (event, mission), unique (event, reference), and (delegate).
- `DrMeeting`: (event, start), (match), (seeker) and (provider).
- `DrConsent`: (seeker, provider, document, at descending).
- `Badge`: unique on `lower(code)`.
- `Scan`: (delegate, zone, at descending).
- `RoomScan`: partial unique (delegate, session) where the verdict isn't a deny.
- `Outbox`: partial index on (status, next attempt).
- `AuditEntry`: (entity, entity id, at).
- Offline sync: unique (device, client id).

### Security model

- **Authorisation:**
  - Deny by default.
  - The actor comes from the session only.
  - A Zod schema validates every action.
  - Ownership and tenancy are checked for every record an action names, not just the role, which closes IDOR.
  - MFA is a property of the role, enforced by the server; it is not an editable flag. Staff get 7 days' grace from their first sign-in to set it up (D14).
  - Staff accounts are managed by Algotech admins only.
- **Sessions:**
  - The cookie is `__Secure-sid`, set by the API with `Domain=.example.co.ke` so the web app's server components see it too. It is Secure, HttpOnly, and SameSite Lax (Strict for staff), and holds a 256-bit random id stored hashed. (`__Host-` can't carry a domain, so it can't be shared across the two subdomains.)
  - The id rotates on sign-in and on step-up.
  - Sessions are revoked when a role changes.
  - Staff time out after 30 minutes idle and 12 hours absolute.
  - TOTP secrets are encrypted, with reuse blocked and recovery codes.
- **One-time codes:** hashed, 10-minute expiry, single use, 5 attempts. SMS sends are capped per number and per day. Responses never reveal whether an account exists.
- **Scanner PINs:** hashed, with per-staff and per-device lockout and device binding. The demo seed's plaintext PINs never reach production; production staff get fresh PINs.
- **CSRF and CORS** (architecture.md, "Sessions and cookies across the two subdomains"):
  - CORS on the API allows only the web app's origins (`WEB_ORIGINS`), with credentials.
  - Every cookie-authenticated write must carry an `Origin` from that list and a JSON body, which forces a preflight.
  - SameSite cookies are the third layer. They don't separate sibling subdomains, so no other subdomain of the parent domain may serve user content.
  - Webhooks are exempt and verified as below.
- **Webhooks:**
  - **Daraja:** a random per-transaction token in the callback path; Safaricom IPs allow-listed in nginx as a second layer; never settled on the callback alone. The worker confirms with STK Push Query and matches amount, phone and reference. The KES amount is locked when the push starts. A sweeper handles pushes that never get a callback, and statements are reconciled daily.
  - **Paystack:** the HMAC-SHA512 signature over the raw body, then Verify Transaction.
  - **Pesapal:** always calls GetTransactionStatus.
  - **SMS and email callbacks:** used as status hints only, with a path token and an allow-list (Africa's Talking) or the provider's signature (SES, Resend).
- **Documents:**
  - Uploaded straight to a private bucket by presigned POST (size and type limits, random keys).
  - Held in quarantine until a virus scan clears them.
  - Read by a signed GET of two minutes or less, issued only after the consent check, with the access row written in the same transaction.
  - Served as an attachment, with the watermarked copy where downloads are off.
- **Data protection** (Kenya Data Protection Act 2019):
  - Register with the ODPC as controller and processor, and run a DPIA for the Deal Room.
  - Document the safeguards for any storage outside Kenya.
  - Keep a 72-hour breach runbook and handle subject access and deletion requests.
  - Retention covers outbox bodies, the visitor log, nginx logs and backups.
  - Logs never hold query strings, phone numbers or document contents.
- **Audit integrity:** separate database roles (`migrator`, `app`, `worker`, and a read-only role for oversight). The app may only INSERT into `AuditEntry`.

### Performance budgets

These are measured in the load test before each gate:

| Path | Budget |
| --- | --- |
| Scan verdict | p95 300 ms end to end; 50 ms server time; 100 ms offline |
| Booking a meeting | p95 250 ms; the 50-request burst books no clash, every response within 2 s |
| A Deal Room write (aggregate) | p95 250 ms under summit-day load |
| Live board poll | 30 ms when unchanged; 150 ms and 15 KB when changed; two phones agree within 5 s |
| Staff screens (dashboard, applications, meetings) | p95 400 ms server time; first payload 150 KB or less |
| Applicant portal | first payload 60 KB or less |
| Auto-propose for 150 pairs | 10 s or less, as a background job with progress |
| Payment webhook | acknowledged within 1 s |
| Database connections | 20 or fewer in total in steady state: API 10, worker 3 for Prisma plus 3 for pg-boss; the web app none |

**Also:**
- The **live board polls every 3 seconds** with a version number that every relevant write bumps. It gets 204 when nothing changed, which survives offline and reconnects better than server-sent events behind nginx.
- **Scanners** post each verdict and keep a badge list with an ETag for offline use.
- **Auto-propose and refill** load the event's busy set into memory, plan there, and insert in one transaction as a job.
- **Caching:**
  - Public event pages cache in Next with `'use cache'` for a minute.
  - Nothing per-viewer is ever cached. The API sends `Cache-Control: private, no-store` on every per-viewer response.

## Phases and milestones

The dates work back from the paper's two gates:
- **Deal Room applications open Tue 15 December 2026**
- **the summit runs 15 to 18 February 2027**

What applicants and reviewers need on day one comes first. Anything that can follow does.

**Assumption:** at least two developers from Phase 1. With one, Phase 2 narrows to what the Deal Room needs before the summit (badges, scanning, accreditation), and the rest of ticketing moves after it.

| Phase | Window | Gate |
| --- | --- | --- |
| 0. Server-safe rules and foundations | Thu 12 Nov to Fri 27 Nov 2026 | The rules run on the server; sign-in and the layers, end to end, run on staging |
| 1. Deal Room onboarding | Mon 23 Nov 2026 to Fri 8 Jan 2027 | **Applications open Tue 15 Dec**; decisions from Tue 22 Dec; fees from Fri 8 Jan |
| 2. Core platform and scanning | Mon 4 Jan to Fri 29 Jan 2027 | Badges, accreditation and scanners for the summit; ticketing for other events |
| 3. Deal Room summit operations | Mon 4 Jan to Wed 10 Feb 2027 | Design freeze Fri 22 Jan; rehearsal Wed 10 Feb; **summit 15 to 18 Feb** |
| 4. After the summit | Mon 22 Feb to Fri 19 Mar 2027 | Digests, monthly review, reports, archive |
| 5. Exhibition | From Mon 22 Mar 2027 (D9: the November summit is demo data only) | The first real exhibition on the platform |
| 6. The apps' API | From Mon 4 Jan 2027, if D10 says so | Android and iOS on the same API |

### Phase 0: Server-safe rules and foundations (12 to 27 November 2026)

| # | Milestone | Done when |
| --- | --- | --- |
| M0.0 | **Server-safe rules**: split `store.tsx` into `src/lib/core/*` and the client provider; `Ctx { now, newId, actor }` through every reducer and time-dependent rule; refusals with reasons; Vitest with seed-based tests | The prototype runs unchanged; `src/lib` has no `Date.now`, `Math.random` or React import; the Phase 1 actions have tests that pass. **Done 11 Nov 2026** on `backend`. Notes below |
| M0.1 | **Decisions and applications to third parties**: D3 to D11 answered; the Daraja production application and the SMS sender ID filed (each takes one to two weeks); the ODPC registration started | Each decision has an answer in this file; both applications have reference numbers |
| M0.2 | **Database and Prisma**: PostgreSQL with database roles, the first schema (identity, minimal event, tier and delegate, the Deal Room aggregate and its tables), migrations, connection limits and timeouts | `prisma migrate deploy` runs clean on an empty database, as the `migrator` role **Done 11 Nov 2026.** Notes below |
| M0.2a | **The API as its own process**: npm workspaces; Express with checked settings, security headers, CORS for the web app's origins, the error contract, health checks and a clean shutdown; the lint rules for the workspace boundaries | The prototype runs unchanged from `apps/web`; the API answers `/health/ready` against PostgreSQL; lint fails the web app importing the database. **Done 11 Nov 2026.** Notes below |
| M0.3 | **Reference data and demo seed, kept apart**: a production import for the real event, configuration and staff; the demo seed loads only on staging and local | Staging shows the prototype's data; production holds no demo record **Done 11 Nov 2026** for local and the commands staging and production use; staging itself comes with M0.6. Notes below |
| M0.4 | **Sign-in and sessions**: staff password and TOTP; one-time codes by email for applicants | Both sign in on staging; sessions expire, rotate and revoke as specified; failed attempts are throttled in PostgreSQL **Done 11 Nov 2026** in the API; the sign-in screens come with M0.5's client foundations and staging with M0.6. Notes below |
| M0.5 | **The layers, end to end**: `runCommand` (deny by default, ownership, per-event lock, aggregate load and save, audit); the module pattern in the API (`routes`, `controller`, `service`, `repo`, as `health` already does); the first POST and GET routes with their contracts; the Origin check on writes; the client foundations (`QueryProvider`, `SessionProvider`, `EventProvider`, the `http` client, `ApiError`); the feature-folder pattern in the web app | Assigning a reviewer runs from a screen through a hook, the API client, the Express route, the service and the repository, exactly as in architecture.md; a test proves another organiser's and another applicant's records are refused; a write from another origin is refused **Done 11 Nov 2026**, apart from moving the prototype's own screens, which goes module by module from M1.1. Notes below |
| M0.6 | **CI and staging**: type-check, lint, tests and both builds on every push; staging deployed behind nginx as in `deploy.md`, with the web app and the API on their two names | CI is green; both names are reachable over HTTPS with the security headers; the deploy switches the API and then the web app with no failed request |

**Notes on M0.0, done 11 Nov 2026:**
- **The rules are importable on the server:** `src/lib/core/{reducer,scan,orders}.ts` plus `src/lib/ctx.ts`. The client store is a thin provider.
- **The only clock and random reads left in `src/lib`** are in `proto-ctx.ts` (the prototype's Ctx), `use-today.ts` (a React hook) and the seeds.
- **The actor decides:** `staffOf`, `memberOf`/`memberCan`, `actionExhibitor` and `scanOperatorOf`. Algotech-only actions and fee settlement (system only) are enforced in the rules.
- **Refusals:** `apply()` returns `{ state, refusal }`. Every refusal in the Deal Room's onboarding and review reducer has its reason. Meetings, sessions, conversion, Exhibition and core refusals still return a generic reason; theirs come with their milestones (M3.x, M5.0, Phase 2).
- **Tests:** 174 Vitest tests in `tests/` (`npm test`), now `packages/domain/tests`: the seven earlier rule suites, the actor checks and the refusal reasons.
- **Still trusted from the client, to fix in the module's milestone:** registration's price and status, a scan's verdict and time (M2.2, M2.4), and the applicant's ownership of an application (`runCommand`, M0.5).

**Notes on M0.2, done 11 Nov 2026:**
- **Prisma 7.10.1** with the `pg` driver adapter, now in `packages/db`.
  - `prisma.config.ts` points migrations at the migrator role.
  - `src/client.ts` exports `createDb()`, which the API calls once at startup (pool of 10, no query logging).
  - The generated client is in `packages/db/src/generated/prisma` and is not committed.
- **Roles and databases:** `scripts/db/setup-local.sh` (`npm run db:setup`) creates the four roles (`excursia_migrator`, `excursia_app`, `excursia_worker`, `excursia_reporting`), the dev, test and shadow databases, the timeouts and the default grants. It writes the connection strings to `.env.local`. Servers are provisioned the same way.
- **The first migration** (`prisma/migrations/…_init`) holds the schema in `prisma/schema.prisma` plus SQL Prisma can't express: the exclusion constraint against double-booking, case-insensitive unique badge codes, partial indexes, time-order checks, and the audit log made append-only for the app and worker. Prisma sees no drift from it.
- **Proved on the test database, as the app role** (`packages/db/tests`, 9 tests):
  - 50 simultaneous bookings of one slot: exactly one wins
  - overlap is refused per room and table and per person; a lapsed proposal frees its slot
  - badge codes are unique whatever their case
  - the audit log can't be changed or deleted
  - the schema can't be changed
  - a counter hands out each number once under concurrency
- **Locally this runs on PostgreSQL 15,** the server already on this machine; production's version is chosen with the rest of D2. One `Payment` table carries both Deal Room fees and ticket orders, instead of a separate fee table.

**Notes on M0.2a, done 11 Nov 2026:**
- **The layout** is in architecture.md, "The repository".
  - `src/lib`'s rules moved to `packages/domain`.
  - The browser-only helpers stayed in the web app: the store, `use-today`, `media`, `brand` and the CSV download, now split from the CSV text helpers.
  - Prisma moved to `packages/db`. The new `packages/contracts` holds the error envelope and the health shape.
- **The API** (`apps/api`):
  - Express 5 with settings checked by Zod at startup. Production refuses http origins or a missing cookie domain.
  - helmet with a deny-everything CSP, since the API only returns JSON.
  - CORS for `WEB_ORIGINS` only, with credentials.
  - A 100 kB JSON limit, `trust proxy` for loopback only, and one `ErrorBody` shape for every failure.
  - `/health/live` and `/health/ready`. Ready reports 503 within 2 s when PostgreSQL doesn't answer.
  - Health is the first module, split into routes, controller, service and repo. Lint keeps each layer to the one below it.
  - SIGTERM drains open requests, then closes the pool.
  - `npm run build` bundles it with the workspace packages into `dist/server.js`.
- **Tests:** one Vitest run at the root covers all three suites, 203 tests: the rules, the database's guarantees, and 20 on the API (health, CORS, headers, error shapes, settings, and each health layer with a stand-in below it).
- **Lint** fails if the web app imports the database, Prisma or Express, if the rules import React, Next.js, Express or the database, or if the contracts import anything of ours.
- **Running it:** `npm run dev` (web, port 3010) and `npm run dev:api` (API, port 4000). The README has the rest.

**Notes on M0.3, done 11 Nov 2026:**
- **What the database holds from the seed:**
  - organisers, events, tiers, delegates and badges
  - the whole Deal Room: config, staff, applications, matches, meetings, sessions, opportunities, exceptions, incidents, consents, the access log, the outbox and the counters
  - the staff's users and memberships
  - a busy-slot row for each room table and person that every live meeting holds

  The rest of the core (zones, rooms, programme, orders, team, shifts and the like) stays on the prototype store until Phase 2 normalises it, and the Exhibition until Phase 5.
- **The mappers** (`apps/api/src/modules/{events,dealroom}/*.mapper.ts`) go from the rules' state to rows and back.
  - The summary columns come from the rules' own selectors (`decisionOf`, `pipelineOf`, `occupies`, `confirmBy`).
  - Times convert at UTC+03:00 exactly.
  - The round trip is tested, in memory and through PostgreSQL, against the whole seed. Only the order of arrays and the prototype-only fields differ.
  - The repos' `load()` is what `runCommand` will use (M0.5).
- **Kept apart by a `demo` flag** on organisers, events and users (migration `…_demo_flags`):
  - `npm run db:seed:demo` loads the seed in about 0.6 s and replaces any earlier copy.
    - It refuses when `APP_ENV` is `production`.
    - It also refuses when the database holds any event it didn't make, whatever `APP_ENV` says.
    - All 228 slot rows pass the exclusion constraints, so the seed has no clash.
  - `npm run db:check-demo` exits 1 if any demo record exists. The production deploy runs it.
  - `npm run db:import -- <file>` imports a real event's organiser, event, Deal Room config and staff from a JSON file checked by Zod (`reference.schema.ts`).
    - Problems are listed by path, never with values.
    - It upserts, so a file can be imported again; staff missing from the file are reported, not revoked.
    - It refuses any id or email that belongs to demo data.
    - `apps/api/reference/connected-africa-3.example.json` shows the shape. The real file lives on the server, since it holds staff names and emails.
- **`APP_ENV`** (`local`, `staging` or `production`) is required by every database command and never defaulted. `setup-local.sh` writes `APP_ENV=local`.
- **Not yet:** busy-slot rows for programmed sessions (M3.3, once the session-room rule is settled); staff passwords (M0.4).
- **Tests:** 17 new ones; 220 in all.

**Notes on M0.4, done 11 Nov 2026:**
- **Applicants** sign in with a 6-digit code sent by email: `POST /v1/auth/code`, then `POST /v1/auth/code/verify`.
  - A code lasts ten minutes, works once, and dies after five wrong guesses. Asking again kills the previous one.
  - The first sign-in makes the account.
  - Asking for a code answers the same whether or not the address has an account.
- **Staff** sign in in two steps:
  1. A password (argon2id, 12 to 128 characters): `POST /v1/auth/staff/signin`. A right password gives a *pending* session, which reaches only the authenticator routes and lapses after ten minutes.
  2. A code from an authenticator app (RFC 6238): `/v1/auth/totp/verify`. The first time, `/v1/auth/totp/setup` and `/v1/auth/totp/confirm` set it up and issue ten recovery codes, shown once.

  Details:
  - Each authenticator step works once. Each recovery code works once.
  - A password is set or reset with a code sent to the staff email (`/v1/auth/staff/password/code`, then `/v1/auth/staff/password`), so no admin screen is needed for onboarding. A new password ends every session.
  - A wrong email and a wrong password get one refusal, taking the same time.
  - Staff can't sign in with an emailed code.
- **Sessions:**
  - The token is 256 random bits, in an HttpOnly cookie (`__Secure-sid`, scoped to `COOKIE_DOMAIN`; SameSite Strict for staff, Lax for applicants). The database keeps only its SHA-256.
  - A new token at every step-up, and the old one dies with it.
  - Staff: 30 minutes idle, 12 hours absolute. Applicants: 7 days idle, 30 days absolute.
  - `GET /v1/session` says who is signed in, the MFA state and the memberships.
  - `POST /v1/auth/signout` ends the session.
- **Secrets:** `AUTH_SECRET` (32 bytes, in the API's environment) derives two keys.
  - One HMACs the one-time codes, so a copy of the database can't be searched for them.
  - The other encrypts TOTP secrets with AES-256-GCM.
- **Attempts are counted in PostgreSQL** (`rate_limit`, keyed by a hash of the address or account):
  - code requests: 3 per address and 20 per network address in 15 minutes
  - code checks: 10 per address in 15 minutes
  - passwords: 5 per address and 30 per network address in 15 minutes
  - authenticator codes: 5 per person in 5 minutes
- **CSRF:** every write under `/v1` must carry an `Origin` from `WEB_ORIGINS`. One that carries the session cookie with no `Origin` is refused.
- **Email:** only one-time codes are sent straight from the API; everything else will go through the outbox (M1.4). The only transport so far is `log`, which prints to the API's console locally and **refuses in production** until the provider is chosen (D7).
- **Tests:** 20 new ones against the test database, with a clock the tests move:
  - every flow above
  - code reuse, expiry and the five-guess limit
  - the rate limits
  - TOTP replay and single-use recovery codes
  - idle and absolute expiry, and rotation at the step-up
  - a new password ending sessions
  - the same refusal for an unknown email and a wrong password
  - cross-site writes
- **The 7 days' grace (D14):**
  - The first password sign-in without an authenticator starts the 7 days, recorded once in `app_user.mfa_grace_until`.
  - Within them, `POST /v1/auth/totp/skip` finishes the sign-in. The session is marked `mfa_skipped`, and `GET /v1/session` reports `mfa: "skipped"` with the due date.
  - After them, skipping is refused, and so is skipping for anyone who already has an authenticator.
  - Five tests cover it.
- **The sign-in page** (`apps/web/src/app/signin`) is the first screen on the API, and the start of M0.5's client foundations:
  - `features/http.ts`, the only `fetch`
  - `features/auth/` with its API client, query contract and hooks
  - `QueryClientProvider` in `app/providers.tsx`

  It does both flows, the authenticator setup with a QR code and recovery codes, "set up later", and password set and reset. A finished sign-in goes straight to the person's workspace. Tested in Chrome: an applicant with an emailed code; a lead setting a password, then an authenticator; a reviewer putting it off. Two bugs were found and fixed on the way:
  - Setup called twice, the second replacing the secret on screen. Setup now returns the secret already waiting.
  - The key breaking across lines.
- **Not yet:**
  - ending a person's sessions when their role changes (with staff management, when memberships first change through the API)
  - deleting old `rate_limit` windows (a worker job, M1.4)
  - scanner PIN sign-in (M2.2)

**Notes on M0.5, done 11 Nov 2026:**
- **`runCommand`** (`apps/api/src/modules/dealroom/dealroom.service.ts`) is the one way the Deal Room changes data. In order:
  1. **Deny by default:** the signed-in person must be on the event's Deal Room team (`dr_staff.user_id`). That gives the actor.
  2. **Lock:** one transaction holding `pg_advisory_xact_lock` for the event.
  3. **Load** the event's aggregate.
  4. **Ownership:** every record named must be in this event. Another organiser's record simply isn't loaded, so it is refused.
  5. **Apply:** `apply(state, action, ctx)`, the prototype's own rule. A refusal is a 409 carrying the rule's reason, and nothing is written.
  6. **Save:** only the rows whose mapped form changed, with an application's `version` bumped.
  7. **Audit:** one `audit_entry` per changed record (actor, action, a capped copy of the input, the client's address).
  8. **Commit.**
- **The first routes** (`/v1/dealroom/:eventId/…`, contracts in `@excursia/contracts/dealroom`):
  - `GET team`: the signed-in person, whether they may assign, and the team.
  - `GET applications`: the queue from summary columns, by status and assignee.
  - `POST applications/assign`
- **Proved** (`apps/api/tests/dealroom.test.ts`, 10 tests):
  - the assignment is saved, versioned and audited, and untouched records aren't rewritten
  - a reviewer is refused with the rule's own reason, and nothing changes
  - Operations staff can't be given reviews
  - another organiser's application is refused through either event
  - an applicant, a half-finished staff sign-in and nobody are refused
  - a cross-site write is refused
  - 10 assignments at once are applied one after another, with none lost

  Database test files now run one at a time, since they share the demo seed.
- **The web app:**
  - `features/dealroom` holds the API client, query contracts and hooks.
  - `/team` is the staff workspace on the API, as the signed-in person. A visitor who isn't signed in goes to `/signin?next=…` and comes back.
  - `/team/applications` is the review queue with "assign selected to…". The prototype's Deal Room menu links to it.
  - Tested in Chrome: a reviewer sees the queue without assign controls; the lead assigns two applications to her; the database shows the rows, their versions and the audit entries.
- **The session and the current event come from TanStack Query** (`useSession`, `useDealRoomEvent`), not from Context providers. They are server data, and the architecture keeps server data out of Context.
- **Not yet:**
  - the prototype's own `/dealroom` screens, which move with their milestones, the queue in M1.3
  - Deal Room rules that read rooms or the programme (M3.2)
  - the per-event aggregate is loaded whole for each write, about 0.8 MB on the seed; the load test (M1.5) decides whether hot paths need targeted commands

### Phase 1: Deal Room onboarding (23 November 2026 to 8 January 2027)

Each milestone from here on builds its feature the same way, as in [architecture.md](architecture.md): contracts; then the Express route, service and repository; then the web app's query contracts, API client and hooks. It also moves that feature's screens off the prototype store onto the hooks, so a screen is never half on each.

| # | Milestone | Done when |
| --- | --- | --- |
| M1.1 | **Apply** (by Fri 11 Dec): seeker, provider and challenge forms; drafts on the server with merged autosaves; resume links; one "save and submit" command; reference numbers from a counter; the portal's status page | An applicant applies from a phone on staging and gets a reference; a second device resumes the draft **Done 11 Nov 2026**, with the core of M1.2's uploads. Notes below |
| M1.2 | **Documents** (by Fri 11 Dec): presigned upload, quarantine, asynchronous virus scan, signed downloads after consent, retention dates | A pitch deck uploads, clears quarantine and opens only for those allowed, through a link that expires Uploads to storage, quarantine and the checks on arrival are done with M1.1; the virus scan, signed downloads after consent and retention remain |
| M1.3 | **Review, first half** (by Fri 11 Dec): queue, assignment, rubric scoring with evidence, information requests with expiry | The review rules' tests pass on the server **Done 11 Nov 2026**. Notes below |
| M1.4 | **Email** (by Fri 11 Dec): the outbox and worker, templates for every onboarding message, delivery status, the Notifications screen reading the outbox | Messages arrive in a real inbox with delivery status **Done 12 Nov 2026**, sending through Zoho; delivery reports and SMS remain. Notes below |
| M1.5 | **Go-live** (Mon 14 Dec): production database with point-in-time recovery and a restore drill timed against the RTO, monitoring and alerts, privacy notice, load test of apply and upload | **Applications open Tue 15 Dec 2026** |
| M1.6 | **Review, second half** (by Tue 22 Dec): recommendations, decisions, second decider, readiness, conditions; provider and challenge verification (KYC, NDA, sanctions, decision-maker) | The first decisions are recorded on production; no record is verified with a step missing |
| M1.7 | **Fee and SMS** (by Fri 8 Jan): one payment method first (M-Pesa if Daraja is approved, otherwise card), then the second; webhooks as specified; the 3-day reminder job; the lead's waiver; badge on payment, with minimal tier and badge records; SMS through Africa's Talking once the sender ID is approved | A sandbox payment issues a badge; a repeated callback changes nothing; approvals made before 8 Jan get their payment link then |

**Notes on M1.1, done 11 Nov 2026** (with the core of M1.2):
- **Who owns an application:** an applicant signs in with an emailed code, and an application belongs to the verified email that started it, which can't be changed. That is also the resume: signing in with the same email on another device opens the draft. An invitation link opens the invited application only for the email it was sent to.
- **Autosave is field by field** (`@excursia/domain/dealroom/apply`, `patchDraft`):
  - The form sends only the dotted paths that changed.
  - The server merges them into the draft on record, under the event lock, and runs the prototype's own `dr/saveDraft`.
  - Paths an applicant may not write are refused by name: status, reference, fee, decisions, reviewer, documents, the owning email, and another kind's fields.
  - Two devices editing different fields both keep their edits.
- **Save and submit is one command:** the last changes, then `dr/submit`. The reference comes from the event's counter, and the confirmation message is queued; the outbox's real delivery is M1.4. A refusal names what is still needed and keeps nothing.
- **The application window is now in the rules:** submitting before `appOpen` is refused with the date. `RULES_CLOCK` sets the rules' time on local and staging (`APP_ENV`), never in production, so the form can be tried before 15 Dec.
- **Uploads** (storage interface, `apps/api/src/storage`):
  - The browser asks for a target, PUTs the bytes, then says it's done, and `dr/addDoc` attaches the file.
  - The target is a signed, 15-minute, single-use permission for one key, one size and one type.
  - On arrival the first bytes must match the declared type (PDF, Office, PNG, JPEG), and the size must match.
  - Limits: 15 MB a file, 30 uploads an hour per application, seekers' document kinds only, drafts only.
  - Files sit in `file` with state `quarantine` until M1.2's scan.
  - Storage is a local folder (`STORAGE_DIR`) until D6 picks a bucket; the bucket driver replaces it behind the same interface.
- **The web app:**
  - `/e/[slug]/deal-room/apply` runs on the API, with the organiser's branding, the real sign-in and the same fields as the prototype (`fields.tsx`, shared with the prototype portal).
  - After submitting it shows the reference and the status.
- **Tested:**
  - 13 API tests and 7 domain tests: ownership, refused paths, merges, the window, uploads (type, contents, size, kind, reuse), atomic submit, invitations, and four simultaneous submissions getting consecutive references.
  - Walked through on a phone (375 px) and then on a second device in Chrome: started on the phone, resumed in Chrome with the same email, uploaded three documents, submitted for CA3-CS-00078.
- **Not yet:**
  - removing an uploaded document from a draft
  - providers' and challenges' KYC uploads (M1.6)
  - the applicant's full portal: RFIs, fee, matching
  - email delivery (M1.4)

**Notes on M1.3, done 11 Nov 2026:**
- **The reviewer's screen** is `/team/applications/[id]`, on the API, in four tabs: Assessment, Application, Requests and History. The queue (M0.5) links to it.
- **Who may do what:**
  - Reviewers and the lead see the whole application with the rubric. Operations staff and applicants don't.
  - Starting the review takes the application if nobody had it.
  - Scoring, requesting information and opening documents are the assigned reviewer's or the lead's.
  - A request that expired unanswered is the lead's alone to settle: extend, refer, decline or withdraw, with a reason.
- **A score rests on evidence:** it names a criterion of the event's rubric and either a document on the application or a written note. A new score supersedes the last, which stays in History.
- **Information requests:**
  - questions, the document kinds asked for, and a due date `rfiDays` ahead
  - The applicant sees them on their status page, uploads what was asked and answers.
  - Uploads made while a request is open are held for the answer, which attaches them and puts the review back in progress.
  - After answering, the status page keeps the application on screen and says when it was answered.
- **Documents open through a short link:** a signed `GET /v1/files/:token`, valid 2 minutes, for one file. It is served as an attachment with `Content-Security-Policy: default-src 'none'; sandbox` and `no-store`, and each opening is audited as `file/open`. Consent before circulating outside the team is still M1.2.
- **Every change runs through `runCommand`**, under the event lock, with the rules' refusals as 409s and audit rows per changed record.
- **Tested:**
  - 7 API tests: who can see, taking the review, evidence on scores, the document link and its audit, a request answered with its document, the lead's call on an expired request, another event's application refused.
  - Walked through in two browsers: the reviewer started CA3-CS-00078, scored Relevance 74 resting on the pitch deck and asked for the 2025 management accounts. The applicant, in Chrome, uploaded the statements and answered. The reviewer saw the answer and opened the PDF.
- **Not yet:**
  - the applicant is told about a request only on the status page; the email is M1.4
  - telling the lead when a request expires: the rules already know once the due date has passed, but nothing prompts the lead yet (Phase 2's jobs)
  - recommendations and decisions (M1.6)

**Notes on organisers, Algotech and KYC, 12 Nov 2026** (the platform admin use cases PA-1 to PA-5 and DA-3, and OR-2, before the four application pathways):
- **Two Algotech levels.** Admins check KYC, approve events and give Deal Rooms their staff. Super admins also run the Algotech team (invite by email, promote, remove) and set the organisers' rate cards. The first super admin comes from the command line; after that nobody changes or removes themselves, Algotech always keeps a super admin, and a removed admin is signed out everywhere at once. Every decision needs the authenticator, not "set up later".
- **Organisers come in two ways.** They sign themselves up, or Algotech opens one for a client (PA-1): the organisation, and the owner, who is invited by email, sets a password and does KYC like anyone else.
- **KYC is returned item by item (PA-2).** Each detail, document and the agreement can be returned with its own note. The organiser sees the note on that item and can't send again until each has changed (a new document, a changed value, the agreement signed again). On the next check Algotech sees what it returned last time.
- **Rate cards (PA-4).** Each organiser has one, set by a super admin; until then the platform's starting card applies (the prototype's figures, until the price list is decided). Approval starts from it, for the kind of event.
- **Two kinds of event.** A summit (tickets, with the Deal Room as an optional add-on) or a Deal Room on its own: it names its lead, is approved only with its Deal Room at the Deal Room's own price, has no tickets, and its web address opens on the Deal Room page. Every event has a time zone and a currency (OR-2); approval records on-site staff and stations (PA-3).
- **Deal Room staff can be changed or removed (DA-3).** A role change goes through the rules and moves the person's sign-in with it; a removal ends their access to that Deal Room at once. The lead can't be demoted or removed until another is named; only the lead and marked reviewers decide.
- **Algotech's overview** searches organisers, owners and events, and shows Deal Room-only events as such.
- **Tested:** 5 tests for the team, more in onboarding's suite (opening an organiser for a client, per-item returns, rate cards, a Deal Room-only event, staff changes) and the rules' tests; then walked in two browsers on the walk-through database.
- **Walked in Chrome, 12 Nov 2026** (Coastline Expos Ltd, opened by Algotech for a Tanzanian client): KYC filled and signed (a wrong name refused), two documents returned with notes, fixed and sent again ("Returned last time, changed since"), verified; a rate card set; a Deal Room-only event in USD sent, approved with staffing, its lead and a reviewer added, the reviewer made a coordinator (losing "may decide") and removed. Found and fixed:
  - **Fees in the wrong currency.** Approving a USD event offered the KES rate card's figures labelled KES (a USD 100,000 licence). Fees now show in the event's currency; when it isn't the card's (KES), they start empty and must be typed before approval. The approval's history line names the currency too.
  - **Stored times three hours early.** Prisma's pg adapter sends times without a zone, and a Postgres set to Africa/Nairobi read them as Nairobi time, so SQL's `now()` disagreed with every time the API wrote (the outbox's retry wait was skipped). Each connection now uses UTC. Rows written before the fix stay three hours early on local databases; a UTC server never had it.
  - A document under 1 KB showed as "0 KB".
- **The four registration pathways on the API, 12 Nov 2026** (the form from `deal-room-pathways-test.md`, which the prototype had): capital seeker, capital provider, commercial or strategic partner, institutional challenge.
  - Each application stores the pathway it was started on (`pathway` in its record; no migration). Older records work it out from their kind, as before. Storage keeps its two sides; capital, partner and challenge are the provider side.
  - Each pathway offers only its own organisation types, and the server refuses another (an investor type on the partner pathway, say). A link with `?type=provider`, from before, starts a capital provider; an unknown type, or none, asks which pathway first.
  - The form is in steps, as the prototype's: Organisation; then Your ask, Your mandate, What you are looking for, or The challenge and Who could solve it; Decision-maker and mission; Documents for a seeker; Review and submit, which lists what is missing under each step. A draft reopens on its first unfinished step.
  - The review queue says each application's pathway and filters by it.
  - Not yet: the eligibility check's answers (sector, country, kind) aren't carried into a new application on the API, as the prototype did.
- **Still open from that walk:** rate cards exist only in KES (a USD or TZS card is a decision); an event's currency is KES or USD only (no TZS or UGX); the new event form starts the city at Nairobi whatever the organiser's country.
- **Not yet:**
  - a live event can't be changed (OR-14), and organisers can't invite their own staff (OR-10)
  - suspending an organiser or an event (PA-9), and reopening a verified KYC when its details change
  - amounts processed and commission earned on the overview (PA-5), which wait for payments
  - Algotech's real price list

**Notes on M1.4, done 12 Nov 2026:**
- **Sending:** Zoho over SMTP (D7), from `Events <noreply@algotech.co.ke>`. Sign-in codes go straight out from the API; every other message goes through the outbox and the worker. `npm run mail:check` logs in without sending.
- **The outbox is the queue:** a message is written in the same transaction as the change that causes it, as "queued". The worker claims batches with `FOR UPDATE SKIP LOCKED`, sends, and records "sent" with Zoho's message id. A failure is retried after 1, 5, 15, 60 and 240 minutes, then "failed"; a message with no one to send to fails at once. Commands only ever add messages; they never rewrite one the worker has sent.
- **What gets an email:**
  - Every message the rules already send: application received, information requested, the answer to a reviewer, decisions, meetings and so on.
  - New ones the walk-through showed were missing: Algotech when KYC or an event is sent for checking; the owner when KYC is returned or verified and when an event is approved, sent back or rejected; a new Deal Room staff member, as their invitation.
- **The email:** the message names the action and its date only (PRD Notifications); around it, a greeting by first name and one link to where it is acted on, written for who gets it: an applicant's to their event's apply page (with their invitation, if any), staff's to the workspace (an application's own page when the message is about one), an organiser's or Algotech's to the page the message names.
- **Messages screen:** `/team/messages`, for everyone on the Deal Room team: each email, who it went to, and whether it went, failed or is being retried.
- **Fixed on the way:** the rules addressed some messages, and every new application's owner, to the demo's own staff (`st_lead`, `st_ops1`); they now name the event's own lead and operations staff.
- **Local safety:** away from production, real mail goes only to `MAIL_ALLOW`; everyone else's is printed in the console, so test addresses never bounce off the real sender (bounces hurt its reputation).
- **Tested:** 6 tests (links and wording; sent once with two workers at once; retried, then given up; no recipient; a stuck message requeued) and onboarding's checks that each step queues its email; then a real login and one test email through Zoho, and the worker sending a request for information from the walk-through.
- **Not yet:**
  - Delivery reports: "sent" means Zoho accepted it; bounces and complaints aren't read back yet.
  - SPF, DKIM and DMARC for algotech.co.ke must be published before production, or mail lands in spam.
  - SMS (M1.7), an HTML version of the email, and a way for the organiser's or Algotech's own messages to be listed (they show only in the Deal Room's list when they name its event).

**Notes on a new summit from nothing (M2.3's core, brought forward), 11 Nov 2026.** Built so a summit can be set up on real screens instead of the demo seed, then walked end to end on an empty database (`excursia_fresh`) to find the gaps.
- **The flow, and who does what:**
  1. The first Algotech admin is made from the command line (`db:admin`); no request can make one.
  2. An organiser signs itself up at `/organisers/signup`: an emailed code proves the address, then the owner's account (password, then authenticator or D14's grace), the organiser and the owner's membership are made together.
  3. KYC: business details, three documents (registration certificate, tax PIN certificate, signatory ID) and the data processing agreement, signed by typing the signatory's name. Sent once complete; read-only while Algotech checks it.
  4. Algotech opens each document through a short link (audited) and verifies, or returns with a reason; a return opens KYC again.
  5. The organiser drafts an event (it may ask for the Deal Room add-on and name its lead). A draft is the organiser's alone (OR-2); it can be submitted only once KYC is verified.
  6. Algotech approves with terms (commission, fees, the add-on's price and desk staff), asks for changes, or rejects with a note. Approval with the add-on creates the Deal Room on the platform's standard settings (`dealroom/defaults.ts`), closed until the lead sets it up.
  7. Algotech gives the Deal Room its staff accounts (DA-2): the staff record through the rules (`dr/staffAdd`) and the sign-in behind it, in one transaction. An applicant's email can't also be staff.
  8. The organiser publishes the approved event.
  9. The lead sets the missions, tracks, application window and days to answer a request (through `dr/config`). Applications open once the event is live and nothing is missing.
- **Where it lives:** the rules in `@excursia/domain/core/onboarding` and `dealroom/defaults`; the API's `organisers` module (owner) and `platform` module (Algotech, decisions only with the authenticator confirmed); the screens under `/team` (the menu follows the person's roles: Algotech, the owner, the Deal Room team, its lead).
- **Found by the walk-through and fixed:**
  - Application references were hard-coded to the demo's `CA3-`. Each Deal Room now has its own prefix, from the event's short mark (`EAGC-CS-00001`). The first application on the walk-through database kept `CA3-CS-00001`.
  - Algotech saw organisers' drafts; now it sees an event once it is sent.
  - The lead landed on an empty review queue with nothing saying the Deal Room wasn't set up; the queue now says what is missing and links to the settings.
  - The KYC form kept the PIN as typed rather than as saved; pages inside a Suspense boundary under `/team` rendered differently on the server and in the browser (a hydration error).
- **Gaps still open:**
  - ~~The public event pages read the prototype's local data, so a real, live event showed "Event not found".~~ **Fixed 12 Nov 2026:** a published event's page and its Deal Room page now come from the API (`GET /v1/public/events/:slug`, no session, no personal data, a minute's public caching), rendered on the web server so search engines and link previews see them, and kept a few minutes there. Drafts and events under review are not public. The demo's events keep the prototype's pages, with their tickets, programme and sponsors, until those move onto the API (Phase 2); a page with no API to ask falls back to the prototype's too. A real event's page shows what exists today: the dates, venue, organiser and the Deal Room (applying while it is open); "Registration opens soon" until tickets (M2.4). Its `register` and `exhibit` pages are still the prototype's.
  - **No email** tells anyone about these steps: a staff member added to a Deal Room, KYC returned or verified, an event approved. They wait for the outbox and its worker (M1.4); until then people learn by looking.
  - **Algotech's terms** are prefilled with the prototype's figures (5%, KES 120,000 licence, KES 450,000 add-on). The real price list is a decision to record.
  - The owner can't invite their own team yet (finance, accreditation, organiser staff); Algotech can't change a Deal Room staff member's role or revoke them from the screen (the rules have `dr/staffSet` and `dr/staffRevoke`).
  - The lead can't change the rubric, sectors, countries or the seeker fee from the screen (the standard ones apply; the fee is 0).
  - An event has no tickets or registration yet (M2.4), and nothing stops two organisers signing up with the same registered name (Algotech sees it at KYC).
  - Local only: `RULES_CLOCK` starts again from its set time whenever the API restarts, so times in a walk-through can run backwards.
- **Tested:** 10 API tests (sign-up, refusals, KYC with return and verification, privacy between organisers and of drafts, approval with the add-on, staff accounts, the lead's settings, applications opening only then, the summit's own references) and 9 rule tests; then the walk-through above in two browsers, through to a request for information answered with its document.

### Phase 2: Core platform and scanning (4 to 29 January 2027)

| # | Milestone | Done when |
| --- | --- | --- |
| M2.1 | **Badges and delegates**: badge page and email, random badge codes, delegate edits | A paid participant gets a working badge by email and SMS |
| M2.2 | **Accreditation and scanning**: scanner devices and PIN sign-in with lockout, desk accreditation, zone and room doors, anti-passback through `Presence`, atomic capacity, PIN overrides, the offline queue with idempotent sync | 50 scans a minute on two devices with one offline: no duplicates and no over-capacity after sync; the prototype's demo PINs and the applications' invite tokens no longer saved in browser storage (found by the security pass, 11 Nov 2026) |
| M2.3 | **Organisers and events**: KYC and DPA, the event builder, media uploaded straight to storage, approval by Algotech | An organiser builds and publishes an event on staging **Core brought forward and done 11 Nov 2026** (self sign-up, KYC, Algotech's checks, events from draft to live, the Deal Room's set-up); the event builder's tiers, sessions and media remain. Notes under Phase 1 |
| M2.4 | **Registration and orders**: pricing, promo and status worked out on the server; M-Pesa and card checkout; refunds | A delegate registers and pays; a crafted request can't change the price |
| M2.5 | **Money and comms**: commission, payouts, reconciliation; memberships, shifts, campaigns | A payout run matches the payments to the shilling |
| M2.6 | **Visitor log**: moved from SQLite to PostgreSQL; IP taken only from `X-Real-IP`; `/adminwatch` behind staff sign-in with TOTP and an IP allow-list | Visits record and replay from PostgreSQL; `/adminwatch` refuses anyone without staff sign-in |

### Phase 3: Deal Room summit operations (4 January to 10 February 2027)

| # | Milestone | Done when |
| --- | --- | --- |
| M3.1 | **Matching and introductions**: candidates and fit, decisions, briefs, introductions and answers, intro expiry, consent per document, the access log, watermarked downloads | A pair is introduced and accepts; a document opens only under consent and is logged |
| M3.2 | **Scheduling**: `DrBusy` with exclusion constraints, lapse release, caps under advisory locks, confirm and change, auto-propose as a job, .ics invites, reminders | The PRD's three 50-request bursts book no clash; auto-propose for 150 pairs finishes within 10 s |
| M3.3 | **Sessions**: planning, invitations, answers, attendance from the doors and the coordinator, outcomes; sessions and meetings never overlap | The session rules' tests pass on the server |
| M3.4 | **Live board and desk**: 3-second polling with a version, arrivals, outcomes, refills, the daily close-out, the 19:00 report | Two staff phones agree within 5 seconds |
| M3.5 | **Offline on the day**: live board and scanners queue offline and sync with client ids; conflicts go to the lead; incidents are logged | A forced 10-minute outage loses nothing |
| M3.6 | **Every role, walked through**: Bouer's lead and reviewers, Excursia's coordinator and operations, Momentum's oversight | No role sees a screen or a record it shouldn't, and no link ends in a refusal |
| M3.7 | **Freeze and rehearsal**: freeze Fri 22 Jan; rehearsal on staging with real phones Wed 10 Feb; printed backups; restore drill and failover to the standby server | **The summit runs 15 to 18 Feb 2027** |

### Phase 4: After the summit (22 February to 19 March 2027)

| # | Milestone | Done when |
| --- | --- | --- |
| M4.1 | **Pipeline and opportunities** from the summary columns; participant updates; outcomes in five tiers | The pipeline on production matches its records |
| M4.2 | **Jobs**: weekly digests, monthly review, overdue actions, archive at the conversion end, document deletion at retention | Each job runs once and on time, visible in the job log |
| M4.3 | **Reports**: every report and CSV from SQL over the summary columns, plus oversight's read-only role | Oversight reads every report without a refusal |
| M4.4 | **Post-summit scope** as a contracted add-on, if decided (paper gap 17) | The setting exists and defaults to off |

### Phase 5: Exhibition (from 22 March 2027)

The Nairobi Brand & PR Summit in the seed (25 to 27 Nov 2026) is demo data only (D9), so no real exhibition is due before the Deal Room summit. The Exhibition stays on the prototype's local data until this phase.

| # | Milestone | Done when |
| --- | --- | --- |
| M5.0 | Exhibition rules made server-safe: the actor from `ctx`, no `as: "exhibitor"` bypass, refusal reasons | Exhibition's tests pass with the exhibitor acting only on its own company |
| M5.1 | Halls, booths, floor plan; exhibitor applications and review | An organiser sells a stand on staging |
| M5.2 | Holds, contracts, invoices, payments (M-Pesa, card, bank lines), reconciliation | A booking paid in two instalments reconciles |
| M5.3 | Exhibitor portal: people, branding, equipment orders, requirements | An exhibitor completes the portal on a phone |
| M5.4 | On-site: move-in, deliveries, contractors, show-day doors and occupancy, issues, dismantling, reports | A show day runs on staging with the scanners |

### Phase 6: The apps' API (from 4 January 2027, if D10 says so)

| # | Milestone | Done when |
| --- | --- | --- |
| M6.1 | The apps call the same Express API as the web app: bearer tokens for the apps beside the cookie, rate limits per device, an OpenAPI file generated from the contracts | An OpenAPI file lists every endpoint the apps use, and a test app signs in and books a meeting |
| M6.2 | Push notifications through the outbox | A test device receives a meeting reminder |

## Decisions

| # | Decision | Status or recommendation | Why |
| --- | --- | --- | --- |
| D1 | Database | **Decided 11 Nov 2026: PostgreSQL** | Exclusion constraints, point-in-time recovery, JSONB for the aggregates |
| D2 | Where it runs | **Decided 11 Nov 2026: behind nginx; revised the same day to two processes,** `next start` for the web app and Node for the Express API, on two subdomains (deploy.md). Still open: **managed PostgreSQL with HA and 30-day PITR** (recommended), or self-managed with pgBackRest or WAL-G and a replica on a second server | The PRD asks for 99.95% in summit week, RTO 1 hour, RPO 5 minutes; one server alone can't meet that |
| D3 | Sign-in | **Our own sessions** as specified under the security model | The flows are specific (codes, scanner PINs, per-event roles); a library hides the rules |
| D4 | Card payments | **Paystack** or **Pesapal**, whichever Algotech already has an account with | Both take cards in Kenya |
| D5 | M-Pesa | **Daraja directly**; file the production application in week one | Approval takes one to two weeks |
| D6 | Files | S3-compatible private bucket with versioning; **choose the region with the DPA in mind** | Storage outside Kenya needs documented safeguards |
| D7 | Email and SMS | **Email decided 12 Nov 2026: Zoho, over SMTP**, from noreply@algotech.co.ke. SMS still to choose: **Africa's Talking** (register the sender ID now) | Sender ID approval takes one to two weeks |
| D8 | Background jobs | **pg-boss** in a worker process | Jobs share the database's transactions; no extra infrastructure |
| D9 | Exhibition timing | **Decided 11 Nov 2026: the Nairobi Brand & PR Summit is demo data only.** Exhibition follows the Deal Room, from 22 Mar 2027 | No real exhibition is due before February, so nothing moves ahead of 15 Dec |
| D10 | The apps | Confirm whether the Flutter apps are needed for February, or the web on phones is enough | The web is now laid out for phones; the apps add store approval as a risk |
| D11 | Team | Confirm the number of developers from Phase 1 | The phase windows assume at least two |
| D12 | Content Security Policy | **Hash-based CSP with Next's experimental SRI**, or inline scripts allowed with strict other directives | A nonce-based CSP is incompatible with partial prerendering, which this app uses |
| D14 | Staff MFA | **Decided 11 Nov 2026: required, with 7 days' grace.** A staff member may choose "set up later" for 7 days from their first sign-in; the session is marked as skipped, and the sign-in page reminds them. After that, the authenticator is required | Onboarding a team of reviewers shouldn't stall on phones and apps in week one; reviewers see applicants' financials, so the grace is short and ends on its own |
| D13 | The backend process | **Decided 11 Nov 2026: Express, separate from Next.js, in an npm-workspaces monorepo**, with the API on its own subdomain | One API for the web app and the Flutter apps; the web app holds no database access or secrets; the rules and contracts stay shared |

## Risks

| Risk | What we do |
| --- | --- |
| Five weeks to 15 Dec | Day one carries apply, documents, the first half of review and email only; decisions follow on 22 Dec and fees on 8 Jan |
| M-Pesa approval or the SMS sender ID run late | Filed in week one (M0.1); card and email carry the gate if either is late |
| Rules drift between the prototype and the server | The server runs the same reducers; their tests run in CI |
| Leaking data the prototype showed everyone | Services return per-viewer DTOs; `runCommand` checks ownership; M3.6 walks every role |
| Summit-day connectivity | Offline queues with client ids, polling that recovers, printed backups |
| One server fails in summit week | Managed PostgreSQL with HA, a warm standby server, a timed failover drill (M3.7) |
| The aggregate becomes a bottleneck | Budgets are measured in the load tests; hot paths move to targeted commands |
| Holidays (24 Dec to 1 Jan) | Nothing gated falls in that week |
| Two processes deploy out of step | The API switches first, and its changes within a release are additive only; a web tab on the old bundle keeps working (deploy.md) |

## How we work on it

- One branch per milestone off `backend`, merged back by pull request. Each pull request:
  - names its milestone
  - adds tests for the rules it touches
  - is checked in the browser on a phone and a laptop
- Migrations are expand first, contract in the next release, and never edited after merge.
- This file is updated as milestones close: each row gets the date it was done and its pull request.
