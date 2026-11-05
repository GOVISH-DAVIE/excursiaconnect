# Click-through findings

A pass through every screen of the prototype on 5 November 2026: a static scan for controls with no handler, then the main flows driven in the browser. What works is listed first so the gaps read against it; [coverage.md](coverage.md) has the use-case view.

## Flows that work end to end

- **Register a group**: Full conference plus one colleague, M-Pesa. Two delegates created as Confirmed, two paid orders of KES 12,000, the tier's sold count up by two, the payer's badge opens from Done.
- **Scanner**, all four checks in order on one badge: desk → "Accredited, badge printed"; Main hall entrance → allow; the same again → "Anti-passback: already inside"; VIP lounge → "Not entitled"; Dining outside its window → "Dining opens 12:30 to 14:00"; a cancelled badge → "Invalid or cancelled badge".
- **Badge**: enrol in a breakout (the seat count and the button update), People and Messages open on a person from the public page's speaker links.
- **Admin approval chain**: Mark KYC verified enables Approve with these terms; the event moves to Approved with a history entry.
- **Reconciliation and payouts**: both exceptions resolved with a reason, the Friday run unlocks, both organisers show Scheduled.
- **Facilitator**: Start session, End session (attendance frozen), Upload slides.
- **Organiser delegates**: approve a pending registration; the duplicate finder lists pairs sharing an email or phone (the seed produces 12, because its random names collide).

## Controls on screen that do nothing

The tier, field, session, zone, room and brand editors were built after this pass (6 November); the rows below are what remains.

| Screen | Control | What it should do |
| --- | --- | --- |
| Event → Finance | Export .xlsx | The ledger as a workbook; the CSV export on Delegates and the closed-event report exist |
| Finance and payouts | Download statements | Every statement as one PDF |
| Payout statement | Download PDF | The statement as PDF |
| KYC | Sign now | E-signature of the data processing agreement |
| Admin organiser | Request KYC refresh | Sets KYC back to Pending and emails the organiser |
| Admin performance | Export workbook | Every event's figures as a workbook |
| Badge → Messages | Report | Reported thread goes to the organiser for moderation (OS-13) |
| Badge → Programme | Join waitlist on a full breakout | Disabled today; a session waitlist does not exist |

## Features the docs ask for that are not on screen

- **Sign-in.** No authentication anywhere: personas are reached by URL, the organiser is always Epic PR, the badge is always Amina unless a URL names another delegate. Roles exist (Team and roles) but nothing enforces them.
- **Tier, form, zone and session editing** (above). The event's own brand colour and logo text cannot be changed either; a new event gets the default blue.
- **Re-review on a money change** (OR-14): a price change on a live event should send it back to Algotech; there is no price change to make.
- **Campaign delivery status** (OS-5): a campaign records the segment and count, nothing per message.
- **Assign delegates to sessions** (OS-8) and a **session waitlist**.
- **Resume an abandoned registration** (DE-7) and the 72-hour expiry; **claim a group record** by one-time code (DE-16): a colleague gets a record and badge, but no claim step.
- **Session ratings** (DE-14, SP-6): the ratings and comments shown are seed data; nothing collects them.
- **Chargebacks** (FI-6) and the **eTIMS invoice** (PA-8): both described, neither produced.
- **Scanner**: no search by name, phone or ID for a delegate without a badge (AZ-3); rooms are not posts, so a room-door scan with the enrolled-only rule does not exist (AZ-6); Offline is a toggle with a fixed "3 queued", nothing is cached or synced (AZ-7); the day is hard-coded to day 1; signing in binds no device to the rota's post (AZ-1).
- **Organiser suspension** (PA-9): only a live event can be suspended.
- **Payout request** (OR-16): payouts run weekly by the admin; the organiser cannot request one.
- **Email, SMS and M-Pesa** are simulated with timeouts; nothing is sent.

## Data that is drawn, not computed

- The "Registrations, last 12 days" bars on the overview and the performance page are a fixed array per event; new registrations do not move them.
- A zone's "Occupancy by hour" curve is a shape scaled to capacity, not scans.
- The reconciliation exceptions are seeded; the nightly comparison is not run.
- The delegate record's activity log labels every accreditation "Accreditation desk 1" and every door scan "Door staff"; the rota knows who was on the post and could name them.
- The seed's random delegates reuse 30 first names and 20 surnames, so the duplicate finder reports 12 pairs on a fresh reset.

## Smaller things noticed

- The public page's "Registration opens soon" pill replaces every button on an event that is not Live, including the close's big one; a Draft or Closed event could say so.
- Refund request and Close event use the browser's own confirm dialog; the rest of the system uses in-page confirmation.
- The Next dev console logs "params accessed outside Suspense" for `/e/[slug]`, `/e/[slug]/register` and `/organiser/events/[id]`; harmless in dev, worth wrapping before a real build.
- Three React Compiler lint notes remain on `Math.random` in registration and badge reissue, and one unescaped apostrophe on the admin queue.
- A browser keeps the state it first loaded; new seed data appears only after Reset demo data on the home page.
