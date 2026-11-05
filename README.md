# ExcursiaConnect — clickable prototype (v0.2)

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

## Structure

```
src/lib/types.ts     domain types (Event, Tier, Delegate, Order, Zone, Room, Session, Message)
src/lib/seed.ts      deterministic mock data: 3 events, 5 tiers, 5 zones, 15 sessions, 212 delegates, orders
src/lib/store.tsx    client store (reducer + localStorage) and domain helpers: scanVerdict, makeOrder, money
src/components/      ui primitives, programme view, reset button
src/app/             routes per persona
public/brand/        ExcursiaConnect logo files
```

## Where a real build diverges

- Store becomes PostgreSQL behind an API; the reducer actions map one-to-one onto endpoints.
- M-Pesa (Daraja STK push + callback), Paystack and SMS/email are simulated with timeouts.
- QR codes are signed in the PRD; here they are plain text.
- Offline scanning is a toggle; the real staff app caches entitlements and queues scans.
- No auth: personas are reached by URL.
