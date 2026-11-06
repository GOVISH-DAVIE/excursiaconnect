# UI test report, 6 November 2026

Run with the method in `ClaudeCodeAgents/ui-comprehensive-tester.md` (Puppeteer and Playwright MCPs are not set up in this environment, so the same plan ran in two real browsers in parallel: the delegate side in the desktop app's browser pane, the organiser and admin portals in Chrome). Every control was clicked with real pointer events at desktop size; the delegate side also at 375×812. Mock data in localStorage, dev server on port 3010. Nothing in the source was changed by the test.

**Headline:** no screen crashes and no runtime console errors. The front-of-house flows (public page, register, pay, badge, scan, speaker) work end to end. The defects are in validation and state logic: a live event drops out of Live after a price re-approval, Suspend writes "Rejected", an empty colleague row is charged, a USD ticket can be "paid" by M-Pesa, and several forms accept values the rest of the system cannot handle.

Severity: **critical** breaks a core flow or corrupts state; **major** wrong result or dead control on a main path; **minor** wrong but recoverable, or missing validation; **cosmetic** copy and layout.

## Fix first

All fifteen were fixed on 6 November, after the test: a live event keeps a `stateBefore` and returns to Live on re-approval; `Suspended` is a state of its own with an in-page confirm, a required note, a Lift suspension action, a paused public page and refused scans; colleagues must be named; a dollar ticket defaults to Card and cannot pay by M-Pesa; the phone is `tel` with a pattern; Approve opens an order (Awaiting payment) on a paid tier; `enrol` refuses a clashing session and the programme says "Clashes with …" or "Full" instead of a dead button; speaker actions show only where a delegate record exists; the tier, zone and room editors refuse capacity below what is sold, inside or offered and an inverted sale window; admin terms are bounded 0–100 and a note is required to reject, request changes or suspend; the data processing agreement is e-signed by typed name; session counters come from the roster (seed included); Close event, Request a refund and Run Friday payouts confirm in the page.

| # | Severity | Screen | Issue | Fix |
| --- | --- | --- | --- | --- |
| 1 | critical | Admin queue | Re-approving a live event that went **Under review** after a price change lands it in **Approved**, not Live: registration stops, "Close event" disappears, Live count drops to 0, although the copy promises registration continues. Repro: Tickets and form → Edit Full conference → price 13,000 → Save; Admin → Nairobi → Approve with these terms. | Keep the previous state on the event (`stateBefore`) and return to it on approval; the review note already carries the change. `src/lib/store.tsx` setEventState / upsertTier. |
| 2 | critical | Admin queue | **Suspend event** writes state `Rejected` with the note "Suspended by Algotech"; no confirmation, no reason asked. [admin/page.tsx:166](../src/app/admin/page.tsx) | Add a `Suspended` state (`EventState`), an in-page confirm with a required note, and a Lift suspension action. |
| 3 | major | Register → Your details | An empty colleague row passes validation and is charged: Payment lists one ticket but totals two. | Make colleague name and email `required`, or drop rows with both empty before building the order. |
| 4 | major | Register → Payment | On the USD Virtual tier M-Pesa is disabled but stays selected; "Pay USD 50" runs the M-Pesa simulation and confirms. | Default `method` to `card` when the tier is USD; disable Pay while the selected method is disabled. |
| 5 | major | Register → Your details | Phone accepts anything ("+254abc" reaches Payment). | `type="tel"`, `inputMode="numeric"`, pattern `^\+?\d{9,13}$`, message. |
| 6 | major | Organiser → Delegates | **Approve** on a paid tier jumps a Pending delegate straight to Confirmed with no order; the tier counts her as sold but the ledger does not. [store.tsx:87](../src/lib/store.tsx) | Approve → `Awaiting payment` when the tier price > 0 (then Mark paid writes the order); Confirmed only for free tiers. |
| 7 | major | Badge → Programme | Double-booking: enrolling in two breakouts in the same slot succeeds; My day lists both. The seed also enrols delegates in overlapping sessions. | In `enrol`, reject or swap a session that overlaps an existing enrolment on the same day; fix the seed. |
| 8 | major | Badge → Programme | "Join waitlist" on a full breakout is a disabled button that looks like an action; there is no session waitlist. | Render "Full" as text until a session waitlist exists (OS-8). |
| 9 | major | Public page → Speakers | Book a meeting / Message on 8 of 12 speakers (no delegate record) land on People with "No one matches." | Show the two actions only when the speaker has a delegate record and is bookable; otherwise a plain "Not taking meetings". |
| 10 | major | Tickets and form → Add tier | Accepts capacity 0 and an on-sale window ending before it starts (the until date is then silently dropped). | `min=1` on capacity in the add form (the edit form has it); validate until ≥ from. |
| 11 | major | Zones and rooms → Edit | Room seats can be cut below what sessions already offer (Room A 60 → 30 with 53 enrolled); zone capacity can be cut below the people inside now (Main hall → 20 with 45 inside). | Mirror the add-session check: block or warn when seats < the largest session in the room, capacity < inside now. |
| 12 | major | Admin queue | Approve accepts commission −5 % (Performance then shows "Rate −5%"); Onboard organiser accepts 150 %. Request changes and Suspend succeed with an empty note. | `min=0 max=100` on commission and fees; require the note for Request changes, Reject, Suspend. |
| 13 | major | Organiser → KYC | **Sign now** does nothing. | Simulated e-signature: name + date, status → Signed, history entry. |
| 14 | major | Speaker page | Enrolled counter and roster disagree (s5: "40 of 40 seats" vs "Roster, 51"; s3: 53 vs 55). | Derive `enrolled` from the roster, or clamp the seed to capacity. |
| 15 | major | Admin → Finance | **Run Friday payouts** uses `window.confirm`, which froze the automated browser and is inconsistent with the in-page confirms elsewhere (same for Close event and Request a refund). | In-page confirm rows, as the rest of the system. |

## Delegate side

### Home
- PASS: six persona links; stacks on a phone.
- minor: **Reset demo data** gives no feedback. Show "Demo data reset" and reload.

### Public event page `/e/nairobi-brand-summit-2026`
- PASS: nav anchors with header offset; every Get a ticket / Choose / Choose this ticket link lands on register with the right `?tier`; Open in maps; mailto; footer anchors; mobile menu opens, closes on tap and scrolls; fixed bottom bar on phones only when live; no horizontal overflow.
- major: speaker meeting links (fix-first 9).
- minor: Message goes to People for some speakers and to a Messages thread for others.
- minor: footer Day 1 / 2 / 3 all point at `#programme`; give each day an id.
- cosmetic: the menu button stays labelled "Menu" when open (aria-expanded is right).
- cosmetic: counts use different definitions: "12 speakers across ten sessions" beside "15 sessions"; "159 registered" in two places with different wording.
- not tested: waitlist copy (no tier is sold out in the seed).

### Public page of an event that is not live `/e/coastal-tourism-media-week`
- PASS: no Get a ticket anywhere, "Registration opens soon" pills, no bottom bar, nothing throws.
- minor: empty states read as broken: "Zero sessions, 0 speakers", day headings with nothing under them, a Tickets section with only the payment copy, an empty footer column, a venue plan with only the foyer. Hide each section until it has content, or give it one line ("Programme published soon").
- cosmetic: the closing pill stretches full width on desktop.

### Registration `/e/…/register`
- PASS: step strip; each tier choice and `?tier=` deep links; HTML validation on empty and bad email; category changes the custom fields (Speaker and Panelist get Short bio and Headshot, Sponsor and Exhibitor get Stand number); Add a colleague up to ten with per-person tier; Back keeps every value; EARLY10 updates the total; M-Pesa, Card and Bank transfer each end on the right Done copy; Sponsor pass ends on "Submitted for approval"; Open my badge opens the new badge; tier counts fall after confirmed payments and not after a pending transfer; phone layout fine.
- major: empty colleague charged, USD paid by M-Pesa, phone free text (fix-first 3 to 5).
- minor: a wrong promo code gives no feedback.
- minor: EARLY10 discounts only the payer's ticket (−1,200 on 17,000); either label it "10 % off your ticket" or apply it to the subtotal.
- minor: the invite-only **Sponsor pass** is listed on the public register page (it is correctly left out of the colleague tier select). Filter `visibility === "invite"`.
- minor: on the Virtual tier the phone is still "Phone (M-Pesa)" and required.
- minor: after a bank transfer or a sponsor submission, Done still says "Open my badge" and the pending badge shows a QR, zones and Print badge with only a small Pending pill. Say "Track my request" and hold the QR until confirmed.
- minor: the three payment tiles are unnamed buttons. `aria-label="Pay with M-Pesa"` etc.
- cosmetic: at 375 "Back to the event →" wraps with the arrow alone on a line.
- not tested: sold-out → waitlist (no sold-out tier); Headshot upload (file picker).

### Badge `/badge/[id]`
- PASS: new badge renders with tier, QR, status and zones; tabs; day tabs; Enrol increments the room count and flips to "Enrolled, leave"; People search; booking a slot flips to booked; Messages send appends, empty send ignored; `?tab=Messages&with=` deep link; Edit my details saves and shows everywhere including the scanner; unknown id → "Badge not found."; phone layout fine.
- major: double-booking; dead "Join waitlist" (fix-first 7, 8).
- minor: My day omits the meeting just booked, and lists the Gala dinner for a Full-conference delegate with no dinner entitlement.
- minor: "Open my calendar / Close my calendar" is the accept-meeting-requests toggle and gives no feedback. Rename "Accept meeting requests: On / Off".
- minor: Messages **Report** has no handler.
- minor: "Badge not found." has no link home.
- cosmetic: "53 of 60 seats" is ambiguous (the public page says "places left"); new messages are stamped with wall-clock time and sort before the seed messages.
- not tested: Request a refund (`window.confirm`), Print badge.

### Scanner `/scan`
- PASS: posts; typed id and Return; quick buttons; every verdict in order: desk Accredited then Already accredited; Cancelled → Invalid; Unpaid → Registration not paid; Main hall allow then Anti-passback; VIP lounge Not entitled → Override with PIN → Override logged and occupancy 1/40; Dining opens 12:30 to 14:00; unknown id → Invalid; VIP at VIP lounge allow; Offline keeps returning verdicts; log with timestamps; phone layout fine.
- minor: Confirm override with no PIN, a short PIN or no reason does nothing. Inline message.
- minor: any four digits are accepted as the PIN (say so in the prototype).
- cosmetic: Offline shows "3 queued" before anything was scanned offline.

### Speaker `/speaker/[sid]`
- PASS: Upload slides (simulated); walk-ins toggle; Start session → Live now → End session → Ended, stat relabelled Attended; ended session shows rating and quotes; roster with door scans; unknown id → "Session not found."
- major: enrolled vs roster mismatch (fix-first 14).
- minor: after End session the Rating tile still says "Opens when the session ends".
- cosmetic: at 375 the title is squeezed beside the Upload slides pill; the sidebar persona is always Esther even on Lydia's session.

## Organiser portal

- not tested at phone width: the Chrome window ignored the viewport resize (maximised); the organiser pages were only checked at 1512 wide.

### `/organiser` and New event
- PASS: list; validation on name, venue, dates, attendance; Create draft; Submit → "With Algotech, 2 working days"; Approved → Open registration → Live.
- minor: an event with no tiers can be submitted. Gate on at least one tier.

### Event header and lifecycle
- critical: re-approval drops Live; Suspend writes Rejected (fix-first 1, 2).
- minor: the organiser's event page gives no explanation for "Under review" after a price change; show the review note.

### Overview
- PASS: stats, drill-down links, tier table, breakout fill, occupancy, zone links; counts move after approve and mark paid.

### Delegates
- PASS: filters, search, Approve, Decline, Mark paid, Lock profile edits, duplicates and Merge, campaign form with segment counts.
- major: Approve skips payment (fix-first 6).
- minor: the two Merge buttons both read "Keep Terry" with nothing to tell the records apart. Add tier, status or email.
- minor: "Send to 0" stays enabled on an empty segment.
- minor: changing the status or category select does not update `?status=`; a reload loses the filter.
- cosmetic: "1 campaigns sent"; no list of sent campaigns, only a counter.
- not tested: Export CSV (download), Import CSV (file picker), Waitlisted and Refund requested filters on real rows (none in the seed).

### Tickets and form
- PASS: Add tier; Edit tier with cap ≥ sold; "A tier with sales cannot be removed"; price change → Under review; Add and Edit field including choices; Edit brand persists.
- major: Add tier accepts capacity 0 and an inverted sale window (fix-first 10).
- minor: a Choice field saves with no options.
- minor: the brand mark accepts "TOOLONGMARK" against the "two to four letters" hint. `maxLength=4`.
- minor (usability): Edit forms open at the top of the page; clicking Edit low on a long page shows nothing until you scroll. Scroll the form into view.

### Programme and session page
- PASS: day tabs; Add session validation for room clash, seats over room, end before start; session page toggles, Start and End, Edit with the same checks; new speakers appear under Media.
- minor: after End session the rating and feedback still say "opens when the session ends".
- cosmetic: "QA Track track."; the Ended pill sits beside Edit session instead of by the title.

### Media
- PASS: links, hashtag, speaker fields save on blur; sponsors add, edit and remove.
- minor: link fields accept non-URLs. `type="url"`.
- not tested: uploads (file picker). The banner stored in the test browser is a screenshot used as a stand-in.

### Zones and rooms, zone page
- PASS: Add zone and room with minimums; Edit forms; "People are inside" and "sessions use this room" guards on remove; zone page stats, chart, rules, denies, log with delegate links.
- major: edits allowed below what is in use (fix-first 11).
- minor: Opening window is free text ("garbage" accepted). Two time inputs.
- minor (data): zone page shows "Peak today 475, Entries today 2,894" for an event with 212 delegates.
- cosmetic: "Denied scans 5 — see reasons" looks like a link and is not.

### Finance tab, `/organiser/finance`, statement
- PASS: totals reconcile; ledger rows link to delegates; statements match their headers.
- minor: the ledger is unsorted and stops at "First 30 of 137" with no paging or filter.
- minor (data): the USD 50 Virtual tier is summed into KES totals as 50. Convert or label per row.

### Tier page
- PASS: stats, rules, channel split, delegates, Pause and Resume, Edit.
- minor: a paused tier shows it only in the button label; add a "Sales paused" pill here and on the Tickets tab.

### Delegate record
- PASS: profile, payment split, Grant and Revoke, Reissue badge (new code), Edit profile persists, sessions, breadcrumbs.
- minor: the activity log does not record reissue, grants or edits, although Team and roles says every staff edit is logged.
- minor (data): the seed enrols the delegate in two sessions at the same time.

### Team and roles
- PASS: invite adds an Invited row and updates the counts; role changes update "With revenue access"; matrix toggles with Owner locked; rota assignments with the busy and invited hints.
- usability: no confirmation after Send invitation; the row appears at the foot of the list.

### KYC
- major: Sign now dead (fix-first 13).

## Admin portal

### Approval queue `/admin`
- PASS: list and pills; detail with facts and KYC pack; Mark KYC verified; Request changes; Approve; counters; a live event shows only Suspend.
- critical ×2 and major: see fix-first 1, 2, 12.
- minor: after Approve, Reject and Request changes stay enabled with no confirmation.
- not verified: that Approve is disabled while KYC is Pending (the gate exists in code; the tester did not capture the disabled state).

### Organisers `/admin/organisers`, `/admin/organisers/[oid]`
- PASS: list; Onboard organiser creates a Pending row; Save rate card persists across reload.
- minor: commission 150 % accepted.
- known: Request KYC refresh does nothing.

### Performance
- PASS: stats, per-event table with sparkline, per organiser including a new organiser; sort buttons switch.
- not verified: sort order (only one event carries data).

### Finance `/admin/finance`
- PASS: Run is disabled with "Clear every reconciliation exception first" until both are resolved; Resolve with a reason; counter; payouts flip to Scheduled.
- major: Run Friday payouts uses `window.confirm` (fix-first 15).
- minor: both Resolve buttons open one shared form with nothing saying which exception it is for.
- minor: resolved stamps are UTC ("07:17") while the app is Nairobi time.

## Dev console
- One repeated Next.js dev warning on `/e/[slug]`, `/e/[slug]/register` and `/organiser/events/[id]`: `params or searchParams accessed outside of <Suspense>`. Harmless in dev; wrap the `useSearchParams` reads in `<Suspense>` before a real build.

## Not covered
- Native dialogs (Close event, Request a refund, Run Friday payouts, Print badge) and file pickers (CSV import, every upload) were not clicked.
- Downloads (Export CSV, Export .xlsx, Download statements, Download PDF, Export workbook) were not clicked.
- Sold-out and waitlist paths: no tier in the seed is sold out.
- Organiser and admin pages at phone width.

## Test data left in the browsers
The Chrome profile now holds the tester's data: a "QA Test Event", a 0-capacity "QA Tier", a "QA Choice" field, a "QA Clash Session", a "QA Zone" with the window "garbage", a "QA Room", a "QA Sponsor" (Strathmore removed, KCB renamed), speaker and hashtag edits, Full conference at KES 13,000, several delegate status changes, a merged duplicate, an extra campaign, a "QA Invitee" staff member, the Coastal event Approved, a "QA Org Ltd" organiser at 150 %, both exceptions resolved. The pane's storage holds a few test registrations and a stand-in banner and gallery. **Reset demo data** on the home page clears either browser.
