# Use-case test, 6 November 2026

Every one of the 82 use cases in [stakeholders-and-processes.md](stakeholders-and-processes.md) was attempted as its stakeholder, in a real browser, after **Reset demo data**: the trigger performed in the UI, the stated outcome checked on screen and, where another persona should see it, on that persona's screen too. Two testers ran in parallel (delegate, accreditation and speaker in the desktop app's browser pane; admin, organiser, staff and finance in Chrome), after the fixes in [ui-test-report.md](ui-test-report.md). Downloads and file pickers were not clicked.

**Verdicts:** Pass = the outcome happened as written. Partial = the screen exists and the main step works, but a part of the outcome is simulated or missing. Fail = the outcome did not happen or the wrong thing happened. Not built / Not testable as named.

| | Pass | Partial | Fail | Not built | Not testable | Total |
| --- | --- | --- | --- | --- | --- | --- |
| MVP (49) | 30 | 15 | 1 | 2 | 1 | 49 |
| Phase 2 and 3 (33) | 6 | 13 | 0 | 12 | 2 | 33 |

The MVP fail is DE-12 (a zone door admits a delegate who never went through the desk). Everything else in the MVP works or is simulated as the coverage doc says; the defects below are what the pass-through turned up beyond the known list.

## Defects found by this pass (new)

U1 to U6 were fixed the same day: zone doors deny "Not accredited: go to the desk first"; Offer place holds the seat for 24 hours with a pay step on the badge (expired offers return to the waitlist); the payout run pays only verified organisers with a balance, one key per organiser and period; the suspension reason is shown on the organiser's event page; the brand mark is drawn on the public and register pages; a live price change waits as a pending price (shown "awaiting approval" on the tier) while the approved price keeps selling, and takes effect on approval.

| # | Severity | Where | Issue | Fix |
| --- | --- | --- | --- | --- |
| U1 | major | Scanner, zone posts | A paid delegate who was never accredited at the desk is allowed into a zone and flips to Checked in with `accredited: false`. `scanVerdict` never checks accreditation. | Deny at every zone post with "Not accredited, go to the desk" unless `accredited`; the desk stays the only post that sets it. |
| U2 | major | Waitlist (DE-8, OS-7) | After the organiser's Offer place the delegate is "Awaiting payment" with no way to pay: no order, no pay link on the badge, no 24-hour expiry. | Offer place writes a pending order and an `offerExpires` stamp; the badge shows "Pay KES … by <time>" leading to the payment step; the seat returns after expiry. |
| U3 | major | Admin finance, Run Friday payouts | The run marks every organiser Paid, including one held on KYC Pending with no payout account and one with KES 0 due. | `runPayouts` pays only ids whose organiser is Verified and whose net > 0; held rows stay held. |
| U4 | major | Organiser event page, Suspended | The admin must give a reason but the organiser sees only the Suspended pill. | Render the review note for Suspended as for Changes requested (the events list already does). |
| U5 | major | Brand (OR-6) | The brand mark (`brand.logoText`) is stored but the public page and the register page draw the organiser's initials. | Use `event.brand.logoText` in the mark on both pages. |
| U6 | major | OR-14 price change | While the event is Under review the public page already sells at the new price, against "registration continues on the approved terms". | Keep the approved price on the tier (`approvedPrice`) until the admin approves; the public page and register use it while `stateBefore === "Live"`. |
| U7 | minor | Session roster | The roster counts Cancelled and Pending delegates, so the speaker page says 17 where the badge says 14. | Count only Confirmed and Checked in (and Awaiting payment if the organiser allows). |
| U8 | minor | Scanner override | Overriding an anti-passback deny counts the person into the zone again (46 → 47). | An override on "already inside" does not add to occupancy. |
| U9 | minor | Group registration | Both orders of one group share an order id. | Suffix the colleague's index into the order id. |
| U10 | minor | Card payment | Empty card number, expiry and CVV are approved. | Require the three fields (test values stay prefilled). |
| U11 | minor | Finance labels | The organiser finance page and payout statements head with the organiser's current rate-card commission (5.5 %) while every line uses the rate fixed at approval (5 %). | Head with the event's `commissionPct`. |
| U12 | minor | Event history | `history` is written (created, submitted, under review, approved, closed) but no screen shows it; "approval is logged with your name and time" is not visible. | A History panel on the organiser event page and in the admin review pane. |
| U13 | minor | Draft visibility | A Draft is listed in the admin queue and its public page renders in full before it is submitted. | Queue shows Submitted, Under review and Changes requested only; a draft's public page shows a "Not published" notice. |
| U14 | minor | Refund, organiser side | Refund and cancel has no confirmation and the commission is returned, while the coverage doc says it is retained; a refund of an order already paid out is not netted against the next payout. | In-page confirm; decide and state the commission rule; net refunds against the next payout. |
| U15 | minor | Activity log | Approve, Decline, Reissue badge, Grant, profile edits and the organiser's refund write nothing; new registrations are stamped with the seed date (2026-10-02) rather than today. | Write an entry per action with the real date. |
| U16 | minor | Session start and end | Only `status` changes; no timestamps are recorded; after End, door scans still flip roster rows to In while Attended stays frozen. | `startedAt` / `endedAt` on the session; refuse room scans after End. |
| U17 | minor | Speaker page | The sidebar persona and "My badge" are always Esther / Amina, even on Lydia's session. | Resolve the persona from the session's first speaker's delegate record. |
| U18 | minor | Refunded badge | Still shows its QR and zone list; only the pill changes. | Hide the QR and zones once Refunded or Cancelled. |
| U19 | minor | Meeting booking (DE-18, DE-19) | The booked person sees nothing: no My day entry, no invite, no list of own slots; slots and location cannot be set. | Show bookings on both badges' My day; a slots editor on the badge. |
| U20 | minor | Campaign (OS-5) | Copy promises per-message delivery status; nothing per message, no list of sent campaigns. | A sent-campaigns list with a delivered count per channel (simulated). |
| U21 | minor | Zone occupancy (AZ-8) | The 90 % warning is colour only. | Add the words "Nearly full" / "Full" beside the count. |
| U22 | minor | Lock profile edits (OS-10) | The badge still renders "Edit my details" beside the "edits closed" notice. | Render one or the other. |
| U23 | cosmetic | Copy | Double full stop under the Changes-requested note; Performance shows "Live Not open" in one cell; the desk stamps "Day 1" on 6 November, 19 days before the event; an organiser page lists a "KES 0 Scheduled" payout before any sale. | Copy and date fixes. |

## Platform admin (PA)

| ID | Use case | Phase | Verdict | What happened |
| --- | --- | --- | --- | --- |
| PA-1 | Onboard an organiser | MVP | Pass | Onboard organiser → row with KYC Pending, payout Not set, rate card stored. |
| PA-2 | Verify organiser KYC | MVP | Partial | Mark KYC verified flips the queue, the review pane and the organiser page, and unlocks the organiser's Resubmit. No path to send specific documents back with a note; Request KYC refresh is dead (known). |
| PA-3 | Review and approve an event | MVP | Pass | Approve disabled while KYC Pending; Request changes with a note; Mark under review; commission 7 % and staff 3 fixed on approval and shown on the organiser page; organiser sees Open registration. The approval record is written but not shown (U12). |
| PA-4 | Set an organiser's pricing | MVP | Pass | Rate card saved and shown on the list and Performance. Side effect U11. |
| PA-5 | Monitor all events | MVP | Pass | Every event by state with KYC, fill, gross and commission; new organisers and events appear. |
| PA-6 | Clear reconciliation exceptions | MVP | Pass | Both resolved with a reason; payouts flip to Scheduled; the run unlocks. Reason only, no link to a ledger correction. |
| PA-7 | Run and confirm payouts | MVP | Partial | In-page confirm; Epic Scheduled → Paid; the statement lists the orders; organiser's next payout 0. Held and zero rows are paid too (U3). |
| PA-8 | Monthly commission invoice | 2 | Partial | Amount shown, no document. |
| PA-9 | Suspend an organiser or event | 2 | Partial | Suspend with a required note → public page "Registration paused" → Lift suspension → Live. The organiser does not see the reason (U4); no organiser-level suspension. |

## Organiser (OR)

| ID | Use case | Phase | Verdict | What happened |
| --- | --- | --- | --- | --- |
| OR-1 | Complete KYC once | MVP | Partial | The data processing agreement is signed by typed name and stamped. The rest of the pack is pre-verified in the seed; no upload path. |
| OR-2 | Create an event in Draft | MVP | Pass | New event → Draft with Submit for approval. The draft is visible to the admin and its public page renders (U13). |
| OR-3 | Define ticket tiers | MVP | Pass | Add tier with price, cap, sale window, entitlements; the row and the edit form keep every value. |
| OR-4 | Build the registration form | MVP | Partial | Custom Choice field, required, Speaker only; rendered on the register page. No phone preview in the portal. |
| OR-5 | Set delegate categories | MVP | Partial | Six fixed categories with colours; none editable. |
| OR-6 | Brand the event | MVP | Partial | Colour and tagline apply on the public page; the mark does not (U5). |
| OR-7 | Submit for approval | MVP | Pass | Submitted; the admin queue counts it. History not shown (U12). |
| OR-8 | Respond to Changes requested | MVP | Pass | The note is shown on the event; a tier added; Resubmit blocked until KYC verified, then Submitted again. |
| OR-9 | Open registration | MVP | Pass | Approved → Open registration → Live on the public page, admin and Performance. |
| OR-10 | Invite staff | MVP | Pass | Invite with role and event scope → Invited row. |
| OR-11 | Import sponsored delegates | MVP | Not testable | File picker. |
| OR-12 | Define zones and rooms | 2 | Pass | Zone with capacity and window, room inside it; both usable in sessions and on records. |
| OR-13 | Build the agenda | 2 | Pass | Room clash refused; moved to a free room; visible in the programme and on the public page. |
| OR-14 | Change a live event | MVP | Partial | Price change → Under review → "Approve and keep live" → Live. The public page sells at the new price meanwhile (U6). |
| OR-15 | Watch the event live | MVP | Pass | Overview counts move after Mark paid, refund and approve; occupancy per zone; breakout fill. |
| OR-16 | Request a payout | MVP | Partial | Payouts and statements shown; no request action. |
| OR-17 | Close the event | MVP | Pass | In-page confirm → Closed with a stamp, Download report, public page "This event has ended". Download not clicked. |

## Organiser staff (OS)

| ID | Use case | Phase | Verdict | What happened |
| --- | --- | --- | --- | --- |
| OS-1 | Find and correct a delegate | MVP | Partial | Edit → Save updates the record everywhere; not logged (U15). |
| OS-2 | Approve or decline a registration | MVP | Partial | Approve → Awaiting payment with Mark bank transfer paid; Decline → Cancelled. No reason asked, nothing logged (U15). |
| OS-3 | Merge duplicates | MVP | Pass | 12 pairs → Keep one → 11 left, the kept record holds the paid order. |
| OS-4 | Grant or revoke zone access | 2 | Pass | Manual grant shown with Revoke. |
| OS-5 | Send a campaign | 2 | Partial | Segment count, send, counter moves; nothing per message (U20). |
| OS-6 | Reissue a badge | MVP | Partial | New code; old code refused at the scanner. No reason or log; allowed on a Cancelled delegate. |
| OS-7 | Manage a waitlist | MVP | Pass | Sold-out tier → waitlist registration → cap raised → Offer place → Awaiting payment. The delegate then cannot pay (U2). |
| OS-8 | Assign delegates to sessions | MVP | Not built | |
| OS-9 | Export a list | MVP | Not testable | Download. |
| OS-10 | Lock profile edits | MVP | Pass | Toggle; the badge refuses edits (U22). |
| OS-11 | Publish the programme | 2 | Partial | Always public; no publish step. |
| OS-12 | Public booking page | 3 | Not built | |
| OS-13 | Moderate chat | 3 | Not built | Report is dead (known). |

## Delegate (DE)

| ID | Use case | Phase | Verdict | What happened |
| --- | --- | --- | --- | --- |
| DE-1 | Register for an event | MVP | Pass | Confirmed with a badge; on the organiser's Delegates tab; the scanner finds the code. |
| DE-2 | Register a group | MVP | Pass | Two delegates, two badges, each with their own tier; the payer's promo applied. Shared order id (U9). |
| DE-3 | Apply a promo code | MVP | Pass | EARLY10 shows the discount and the new total before paying (payer's ticket only, known). |
| DE-4 | Pay by M-Pesa | MVP | Partial | Prompt, wait, "Payment confirmed by Safaricom"; order paid. Simulated. |
| DE-5 | Pay by card | MVP | Partial | Approved; order paid. Empty card fields accepted (U10). |
| DE-6 | Pay by bank transfer | MVP | Pass | Invoice requested → Awaiting payment, seat not counted → organiser Mark paid → Confirmed, seat counted. |
| DE-7 | Resume an abandoned registration | 2 | Not built | Needs a server. |
| DE-8 | Join a waitlist | MVP | Partial | Waitlisted without payment; Offer place disabled until a seat is free; then Awaiting payment with no way to pay (U2). |
| DE-9 | Receive and keep the badge | MVP | Partial | Badge with QR, code, status and zones; email and SMS simulated. |
| DE-10 | Edit own profile | MVP | Pass | Saved; shown on the badge, the organiser's list and the scanner. |
| DE-11 | Choose breakout sessions | MVP | Pass | Leave and enrol move the seat counts; parallel sessions say "Clashes with …"; My day follows. |
| DE-12 | Get accredited and enter zones | MVP | **Fail** | The desk accredits and checks in correctly; zones allow and deny correctly for an accredited delegate. An unaccredited delegate is admitted at a zone door (U1). |
| DE-13 | Watch a hybrid session | 2 | Partial | Stream placeholder on the virtual badge. |
| DE-14 | Rate a session | 2 | Not built | No rating control after a session ends. |
| DE-15 | Request a refund | MVP | Pass | In-page confirm → Refund requested → organiser approves → Refunded, order refunded, seat freed, scanner refuses the badge (U18). |
| DE-16 | Claim a group-registered record | 2 | Partial | Own record and badge; no one-time code. |
| DE-17 | Browse the programme | MVP | Pass | Day by day with rooms, speakers and seats; My day filtered (U7 on counts). |
| DE-18 | Open a bookable calendar | 2 | Partial | The toggle lists or hides the person with default slots; slots not settable (U19). |
| DE-19 | Book a meeting | 2 | Partial | Booker sees "booked"; the booked person sees nothing (U19). |
| DE-20 | Send a brief message | 3 | Pass | Thread appends on both badges. |

## Accreditation and zone staff (AZ)

| ID | Use case | Phase | Verdict | What happened |
| --- | --- | --- | --- | --- |
| AZ-1 | Sign in to a device for an event | MVP | Partial | Post chosen from a list; no device binding. |
| AZ-2 | Accredit a delegate | MVP | Pass | "Accredited, badge printed", status Checked in, check-in stamped, logged on the record; a second scan says "Already accredited". |
| AZ-3 | Delegate with no badge | 2 | Partial | Reissue from the record works; the old code is refused. No search on the scanner. |
| AZ-4 | Scan at a zone entrance or exit | MVP | Pass | Allow with occupancy +1, anti-passback deny, exit, not entitled, dining window; every scan in the delegate's log. Accreditation not required (U1). |
| AZ-5 | Override a deny | 2 | Pass | PIN and reason; logged with the reason. Occupancy double-counted on an "already inside" override (U8). |
| AZ-6 | Scan at a room door | 2 | Partial | Rooms are not posts; a wing scan marks the roster In. |
| AZ-7 | Keep scanning offline | 2 | Partial | A toggle; verdicts still written straight to state; "3 queued" is fixed. |
| AZ-8 | Watch occupancy at a post | 2 | Partial | Live count; coral at 90 %, no words (U21). |

## Speaker / facilitator (SP)

| ID | Use case | Phase | Verdict | What happened |
| --- | --- | --- | --- | --- |
| SP-1 | Register as a speaker | MVP | Pass | Speaker category with a required bio; badge in the speaker colour. |
| SP-2 | See own sessions | 2 | Partial | Time, room, seats and zone shown; persona and badge link fixed to Esther and Amina (U17). |
| SP-3 | Upload slides | 2 | Partial | Simulated flag. |
| SP-4 | View the roster | 2 | Pass | Door scan flips the row to In and the count. Cancelled and Pending included (U7). |
| SP-5 | Start and end the session | 2 | Partial | Live now → Ended; attendance frozen. No timestamps; scans after End still flip rows (U16). |
| SP-6 | Read feedback | 3 | Partial | Seeded rating and comments. |
| SP-7 | Take meeting requests | 3 | Partial | Bookings land without approval; the speaker sees nothing (U19). |

## Finance (FI)

| ID | Use case | Phase | Verdict | What happened |
| --- | --- | --- | --- | --- |
| FI-1 | Check an order's split | MVP | Pass | Gross, commission, gateway fee and net agree on the record, the ledger and the statement. |
| FI-2 | Reconcile an event | MVP | Partial | Seeded exceptions, resolvable; nothing computed. |
| FI-3 | Receive a payout | MVP | Pass | Paid after the run; the statement lists every order and its totals tie. Header rate wrong (U11). |
| FI-4 | Mark a bank transfer paid | MVP | Pass | Confirmed, reference, ledger row, gross and commission and next payout move on both sides. |
| FI-5 | Process a refund | 2 | Partial | Refunded, ledger row, seat freed, gross down. No confirm on the organiser side; commission returned without saying so; not netted against a paid-out payout (U14). |
| FI-6 | Handle a chargeback | 2 | Not built | |
| FI-7 | Commission invoice | 2 | Partial | Amount only. |
| FI-8 | Export the reconciliation sheet | MVP | Not testable | Download. |

## Test data left in the browsers

Both browsers hold the testers' data (extra delegates, a refund, a waitlist offer, new events and tiers, a new organiser, the payout run, and in Chrome the Nairobi event **Closed**). **Reset demo data** on the home page clears either browser.
