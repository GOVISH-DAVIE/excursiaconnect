# ExcursiaConnect — clickable prototype (v0.3)

Next.js 16 (App Router, Turbopack, Tailwind v4) prototype of the ExcursiaConnect PRD. All data is mock and lives in the browser (`localStorage`), so every persona's actions — register, approve, scan, enrol, book, message — carry across screens until you reset from the home page.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
# or
npm run build && npm start
```

No environment variables, database or payment keys are needed. The Rethink Sans font is bundled locally so it builds offline.

One design language covers every screen: tokens, type, buttons and the public site's page rhythm are in [docs/design-system.md](docs/design-system.md). What the prototype covers of the use cases, and what is still missing, is in [docs/coverage.md](docs/coverage.md); a click-through of every screen, with the dead controls and the gaps, is in [docs/qa-findings.md](docs/qa-findings.md).

Every number on a summary screen links to the page that explains it: stat tiles open filtered lists, table rows open records.

## Screens

| Route | Persona | What it shows |
| --- | --- | --- |
| `/` | — | Switchboard between personas, reset button |
| `/e/[slug]` | Delegate | Organiser-branded event website: hero with the Day 1 programme, three-day programme, speakers, tickets with places left, venue zones, questions, one close |
| `/e/[slug]/register` | Delegate | Tier → details (fields vary by category) → payment (M-Pesa STK push, Paystack card, bank invoice; promo `EARLY10`) → confirmation. Sponsor pass goes to organiser approval. |
| `/badge/[id]` | Delegate | Mobile badge with QR, access entitlements, My day, breakout enrolment with capacity, People directory with meeting-slot booking, brief chat. Try `/badge/d_demo`. |
| `/organiser` | Organiser | Events by approval state; Submit for approval / Go live |
| `/organiser/events/[id]` | Organiser | Overview (live metrics, registrations by day, occupancy, tiers, session fill), Delegates (search, filter, CSV export, record panel: approve, mark paid, reissue badge, refund), Tickets & form, Programme, Media (banner, speaker photos and profiles, sponsor and partner logos by tier; files are scaled in the browser and kept in the store), Zones & rooms, Finance ledger |
| `/organiser/events/[id]/delegates/[did]` | Organiser | Full delegate record: profile (editable), payment split, zone access with manual grants, sessions, meetings, activity log |
| `/organiser/events/[id]/sessions/[sid]` | Organiser | Session detail: roster with door scans, attended vs enrolled, rating and comments, walk-in rule, start/end |
| `/organiser/events/[id]/zones/[zid]` | Organiser | Zone detail: occupancy by hour, access rules, denies by reason, scan log |
| `/organiser/events/[id]/tiers/[tid]` | Organiser | Tier detail: sold vs cap, revenue, rules, every delegate on the tier |
| `/organiser/finance`, `/organiser/finance/[pid]` | Organiser | Payout list and per-payout statement listing every settled order |
| `/organiser/kyc` | Organiser | KYC pack status |
| `/organiser/team` | Organiser | Staff with roles, responsibilities and event scope; the role matrix (capability by role, editable); the scanning rota (post by day and shift) |
| `/admin/performance` | Algotech | Every event by state with registrations, fill against expected attendance, gross and commission; the same per organiser with the next payout |
| `/speaker/[sid]` | Facilitator | The same session view with start/end, slides upload and feedback |
| `/admin/organisers/[oid]` | Algotech | Organiser detail: KYC pack, rate card, payouts (held while KYC pending), events with approved terms |
| `/admin` | Algotech | Approval queue, KYC pack review, per-event commission / fees / staffing form, approve / request changes / reject |
| `/admin/organisers`, `/admin/finance` | Algotech | Rate cards per organiser; commission, gateway fees, reconciliation exceptions, payout run |
| `/scan` | Staff | Phone scanner: choose post (desk or zone entrance/exit), scan a code, allow/deny verdict with reason, PIN override, offline toggle. Sample codes: `EXC-DEMO-4821`, `EXC-VIP-1001`, `EXC-CANC-0007`. |

Scan verdict order (as in the PRD): valid badge → entitled here, now → anti-passback → zone capacity. Accrediting at the desk marks the delegate checked in for the day.

## Deal Room module

An add-on switched on per event that qualifies capital seekers and finance providers, matches them only when both are ready and have accepted an introduction, schedules timed meetings in Deal Room rooms, and tracks each opportunity to evidenced money for six months. It runs on a seeded Bouer event, Connected Africa 3.0 (15 to 18 March 2027). The product documents are [01-Deal-Room-PRD.md](docs/01-Deal-Room-PRD.md) to [04-Deal-Room-Research.md](docs/04-Deal-Room-Research.md); what is covered is in [docs/deal-room-coverage.md](docs/deal-room-coverage.md) and the flow-by-flow test in [docs/deal-room-use-case-test.md](docs/deal-room-use-case-test.md).

| Route | Persona | What it shows |
| --- | --- | --- |
| `/e/connected-africa-3/deal-room` | Public | Who it is for, the eligibility self-check, how it works, missions, questions |
| `/e/connected-africa-3/deal-room/apply` | Applicant | One-time code (prototype: `482913`), seeker or provider form, autosave and resume link, gaps named on submit |
| `/dr/[appId]` | Participant | Status, requests, decision, profile and teaser, verification and NDA, mandate; then directory, introductions with consent, meetings, deals and the access log. Try `dr_cs54` (seeker), `dr_fp19` (investor), `dr_cs24`, `dr_fp10` |
| `/dealroom` | Deal Room team | Dashboard against the targets, applications and review, matching, meetings, live board, opportunities, reports, notifications, settings. Switch who you are in the rail |
| `/scan?event=ev_ca3&post=drdesk` | Desk staff | Deal Room desk and room doors, judged against each participant's meetings |
| `/print/deal-room` | Operations | Printable schedules per day, room or participant, and the briefs |
| `/admin/deal-room` | Algotech | Staff accounts, support access under a grant, the live window, incidents, the archive date |

**The demo clock.** The rail's clock starts at summit day 2, 10:40, and only moves forward: +25 minutes, 19:00 (daily report), 15 June (the seeded opportunities have moved on; weekly digests and monthly reports sent) and 19 September (archived, read-only). Expiries, lapses, late flags and overdue actions are worked out from it, never stored. Reset the demo data from the home page to start again.

**Where the rules live.** Every rule (clashes, caps, both-accept, consent, roles, second decider, read-only archive) is enforced in `src/lib/dealroom/` reducers; screens call the same functions in `logic.ts` to explain a refusal before it happens. Settings, Checks runs three 50-request booking bursts and the invariant check.

## Exhibition module

Halls, floor plans and booths; exhibitor applications and approval; booth holds, contracts, stand invoices, payments and reconciliation; the exhibitor portal with staff, branding, equipment orders and requirements; build-up, deliveries, contractors and dismantling; show-day check-in, hall doors, occupancy and issues; and reports. It runs on the Nairobi Brand & PR Summit 2026 (Sarit Expo Centre, 25 to 27 November 2026). Stand fees are the organiser's own receivables, with no commission. The use cases are in [docs/exhibition-use-cases.md](docs/exhibition-use-cases.md); what is covered is in [docs/exhibition-coverage.md](docs/exhibition-coverage.md) and the flow-by-flow test in [docs/exhibition-use-case-test.md](docs/exhibition-use-case-test.md).

| Route | Persona | What it shows |
| --- | --- | --- |
| `/e/nairobi-brand-summit-2026/exhibit` | Public | Halls, the live plan, prices, what a stand includes, who is exhibiting, the application |
| `/exhibitor/[id]` | Exhibitor contact | Status, booth choice and hold, contract, invoices; once signed, people and contractors, branding, equipment, requirements, move-in, deliveries, problems and dismantling. Try `ex_rafiki-translation-services` (approved, no booth), `ex_upesi-displays` (booked), `ex_lulu-cosmetics` (under review) |
| `/exhibition` | Exhibition team, Finance | Overview, floor plan, exhibitors, sales and payments, stand services, logistics, operations, reports, messages, settings. Switch who you are in the rail; each role sees what the organiser's role matrix allows |
| `/scan?event=ev_nairobi_summit` | Accreditation | The desk accredits a stand's people only when its stand is paid in full (PIN override with a reason); the hall doors admit contractors in build-up and dismantling, stand staff from 07:30 |

**The exhibition clock.** The rail's clock starts at show day 1, 10:30, and only moves forward: +15 minutes, +1 hour, day 2, day 3, dismantling, after the show. Hold expiries, overdue invoices, late surcharges, delivery slots, issue service times and the door rules are worked out from it; passing a later show day's opening plays that morning's arrivals. Reset the demo data from the home page to start again.

**Where the rules live.** In `src/lib/expo/`: `logic.ts`, `onsite.ts` and `ops.ts` hold the rules as pure functions; `reducer.ts` and `onsite-reducer.ts` enforce them, and the store's `accredit` and `scanVerdict` apply the desk and door rules. Settings, Checks sends 50 hold requests through the real reducer and runs the invariant check.

## Structure

```
src/lib/types.ts     domain types (Event, Tier, Delegate, Order, Zone, Room, Session, Message)
src/lib/seed.ts      deterministic mock data: 3 events, 5 tiers, 5 zones, 15 sessions, 212 delegates, orders
src/lib/store.tsx    client store (reducer + localStorage, versioned) and domain helpers: scanVerdict, makeOrder, money
src/lib/dealroom/    Deal Room types, rules (logic.ts), reducers (reducer, meetings, conversion) and seed
src/lib/expo/        Exhibition types, rules (logic, onsite, ops), reducers (reducer, onsite-reducer) and seed
src/lib/clock.ts     which module clock an event runs on (Deal Room, Exhibition, or the wall clock)
src/lib/time.ts      minute and date arithmetic; csv.ts for exports
src/components/      ui primitives, programme view, floor plan, reset button
src/app/             routes per persona
public/brand/        ExcursiaConnect logo files
```

## Where a real build diverges

- Store becomes PostgreSQL behind an API; the reducer actions map one-to-one onto endpoints.
- M-Pesa (Daraja STK push + callback), Paystack and SMS/email are simulated with timeouts.
- QR codes are signed in the PRD; here they are plain text.
- Offline scanning is a toggle; the real staff app caches entitlements and queues scans.
- No auth: personas are reached by URL.
