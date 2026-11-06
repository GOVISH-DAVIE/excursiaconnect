# Prototype coverage against the use cases

Checked against [stakeholders-and-processes.md](stakeholders-and-processes.md) on 5 November 2026 and re-run as a full use-case pass on 6 November ([use-case-test.md](use-case-test.md), verdict per ID). **Built** means the flow works end to end in the prototype on mock data; **Partial** means the screen exists but a step is simulated or missing; **Not built** means nothing on screen. Phase 2 and 3 items are listed only where the prototype already reaches into them.

## Platform admin (PA)

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| PA-1 | Onboard an organiser | Built | `/admin/organisers`, Onboard organiser: account created with KYC Pending |
| PA-2 | Verify organiser KYC | Built | `/admin`, `/admin/organisers/[oid]`: Mark KYC verified |
| PA-3 | Review and approve an event | Built | `/admin`: commission, fees, gateway-fee allocation and staffing fixed; approve, request changes, reject; approve is blocked until KYC is verified |
| PA-4 | Set an organiser's pricing | Built | `/admin/organisers/[oid]`: Save rate card |
| PA-5 | Monitor all events | Built | `/admin/performance`: every event by state, fill, gross, commission; per organiser |
| PA-6 | Clear reconciliation exceptions | Built | `/admin/finance`: each exception resolved with a reason; the payout run is blocked while any is open |
| PA-7 | Run and confirm payouts | Built | `/admin/finance`: Run Friday payouts pays each verified organiser's scheduled balance, one record per organiser and period; held while KYC is pending or the balance is zero |
| PA-8 | Monthly commission invoice | Partial | `/organiser/finance` shows the invoice line; no eTIMS document |
| PA-9 | Suspend an organiser or event | Partial | `/admin`: Suspend event with a required reason, Lift suspension; registration and scanning stop; no organiser-level suspension |

## Organiser (OR)

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| OR-1 | Complete KYC once | Partial | `/organiser/kyc` shows the pack; the data processing agreement is e-signed by typed name |
| OR-2 | Create an event in Draft | Built | `/organiser`, New event |
| OR-3 | Define ticket tiers | Built | Tickets and form: add and edit tiers (price, cap, sale window, visibility, approval, entitlements); pause sales on the tier page |
| OR-4 | Build the registration form | Built | Tickets and form: custom fields (text, long text, choice, file) shown per category; the registration form renders them |
| OR-5 | Set delegate categories | Partial | Six categories fixed, with badge colours |
| OR-6 | Brand the event | Built | Edit brand (colour, mark, tagline); the colour drives the public page and badge; banner, floor plan, logos and links under Media |
| OR-7 | Submit for approval | Built | Blocked until KYC is verified; history kept on the event |
| OR-8 | Respond to Changes requested | Built | The note is shown on the event; Resubmit for approval |
| OR-9 | Open registration | Built | Open registration on an approved event |
| OR-10 | Invite staff | Built | `/organiser/team`: roles, responsibilities, event scope, invitations |
| OR-11 | Import sponsored delegates | Built | Delegates tab, Import CSV: per-row errors, badges issued without payment |
| OR-12 | Define zones and rooms | Built | Zones and rooms: add and edit zones (capacity, window) and rooms (seats, zone) |
| OR-13 | Build the agenda | Built | Programme: add and edit sessions with a room clash check and the seats offered against the room |
| OR-14 | Change a live event | Built | A price change on a live tier returns the event to Under review; registration continues at the approved price and the new one takes effect when Algotech approves, which returns the event to Live |
| OR-15 | Watch the event live | Built | Overview: registrations, attendance, occupancy, revenue, with a drill-down behind every number |
| OR-16 | Request a payout | Partial | Payouts and statements shown; the weekly run is automatic |
| OR-17 | Close the event and get the report | Built | Close event on a live event; Download report at any time (delegates, orders, rooms, sessions, zones); the Reports tab shows room performance, session attendance, zone traffic, desk check-ins and tickets |

## Organiser staff (OS)

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| OS-1 | Find and correct a delegate | Built | Delegate record: edit profile, activity log |
| OS-2 | Approve or decline a registration | Built | Delegates tab and record |
| OS-3 | Merge duplicates | Built | Delegates tab: possible duplicates by email or phone, merge keeping scans and payments |
| OS-4 | Grant or revoke zone access | Built | Delegate record: manual grants, effective on the next scan |
| OS-5 | Send a campaign | Partial | Delegates tab: segment, channel, subject; sent count logged; no per-message delivery status |
| OS-6 | Reissue a badge | Built | Delegate record |
| OS-7 | Manage a waitlist | Built | Sold-out tiers take waitlist registrations; Offer place when a seat is free; refunds free the seat |
| OS-8 | Assign delegates to sessions | Not built | Enrolment is delegate-side only |
| OS-9 | Export a list | Built | Delegates tab, Export CSV on the filtered list |
| OS-10 | Lock profile edits | Built | Delegates tab toggle; the badge then refuses edits |
| OS-11 | Publish the programme | Partial | The programme is always public |
| OS-12 | Public booking page | Not built | |
| OS-13 | Moderate chat | Not built | Report is a button |

## Delegate (DE)

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| DE-1 | Register for an event | Built | `/e/[slug]/register`, fields vary by category |
| DE-2 | Register a group | Built | Up to ten in one order, each with their own ticket and badge |
| DE-3 | Apply a promo code | Built | EARLY10 |
| DE-4 | Pay by M-Pesa | Partial | STK push and confirmation simulated |
| DE-5 | Pay by card | Partial | Paystack fields simulated |
| DE-6 | Pay by bank transfer | Built | Pro-forma; confirmed when the organiser marks it paid, which now writes the ledger and the seat |
| DE-7 | Resume an abandoned registration | Not built | Needs a server |
| DE-8 | Join a waitlist | Built | Register on a sold-out tier; Offer place holds the seat for 24 hours and the badge takes the payment |
| DE-9 | Receive and keep the badge | Partial | Badge page with QR; email and SMS simulated |
| DE-10 | Edit own profile | Built | Badge: Edit my details until the organiser locks edits |
| DE-11 | Choose breakout sessions | Built | Badge: enrol with seats left |
| DE-12 | Get accredited and enter zones | Built | Scanner: the desk accredits; every zone door refuses a badge that has not been through the desk |
| DE-13 | Watch a hybrid session | Partial | Stream placeholder on virtual tickets |
| DE-14 | Rate a session | Not built | Ratings are seeded only |
| DE-15 | Request a refund | Built | Badge: within seven days of the event; the organiser approves on the Delegates tab |
| DE-16 | Claim a group-registered record | Partial | Each colleague gets a record and badge; no one-time code |
| DE-17 | Browse the programme | Built | Public page and badge |
| DE-18, 19 | Open a calendar, book a meeting | Built | Badge People tab; Book a meeting on each speaker |
| DE-20 | Send a brief message | Built | Badge Messages; Message on each speaker |

## Accreditation and zone staff (AZ)

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| AZ-1 | Sign in to a device for an event | Partial | `/scan`: choose a post; the rota says who is where |
| AZ-2 | Accredit a delegate | Built | Desk scan marks accredited and checked in |
| AZ-3 | Delegate with no badge | Partial | Reissue from the record; no search on the scanner |
| AZ-4 | Scan at a zone entrance or exit | Built | Allow or deny with the reason; occupancy updated |
| AZ-5 | Override a deny | Built | PIN and reason, logged |
| AZ-6 | Scan at a room door | Built | `/scan`: every room is a post; enrolled delegates pass, walk-ins only where the facilitator allows and seats remain; one entry per session |
| AZ-7 | Keep scanning offline | Partial | A toggle |
| AZ-8 | Watch occupancy at a post | Built | Live count on the scanner |

The scan verdict now runs all four checks in order: valid badge, entitled here and now (the dining hall refuses outside 12:30 to 14:00), anti-passback, capacity.

## Speaker (SP) and finance (FI)

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| SP-1 | Register as a speaker | Built | Speaker category on the form |
| SP-2 to SP-5 | Sessions, slides, roster, start and end | Built | `/speaker/[sid]` |
| SP-6 | Read feedback | Partial | Seeded comments shown |
| SP-7 | Take meeting requests | Built | Badge calendar |
| FI-1 | Check an order's split | Built | Delegate record, ledger |
| FI-2 | Reconcile an event | Partial | Exceptions are seeded, not computed |
| FI-3 | Receive a payout | Built | `/organiser/finance`, statements per payout |
| FI-4 | Mark a bank transfer paid | Built | Order written to the ledger, commission booked, seat counted |
| FI-5 | Process a refund | Built | Refund frees the seat; commission retained |
| FI-6 | Handle a chargeback | Not built | |
| FI-7 | Commission invoice | Partial | Shown, not issued |
| FI-8 | Export the reconciliation sheet | Built | The event workbook |

## Still to build for a first paid event

In order of risk: per-message delivery status (OS-5) and the abandoned-registration reminder (DE-7, needs a server). Everything else in the MVP column of the use-case index now has a working path on mock data.
