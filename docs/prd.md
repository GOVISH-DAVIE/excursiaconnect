# ExcursiaConnect — Stakeholder Use Cases and Processes

Nov 4, 2026 · @david

## Stakeholders at a glance

Seven stakeholders touch an ExcursiaConnect event. Algotech approves and operates; the organiser owns the event and the money; everyone else acts inside the event the organiser built. Use case IDs below are prefixed by stakeholder (PA, OR, OS, DE, AZ, SP, FI) and each one names the PRD section and release phase that delivers it.

| Stakeholder | Who | What they want from the system |
| --- | --- | --- |
| Platform admin | Algotech operations and finance staff | Only KYC'd organisers go live; commission and staffing are fixed before money moves; every event is visible in one queue |
| Organiser (owner) | The agency or body hosting the event | Build the event once, sell tickets without manual reconciliation, see who came, get paid on time |
| Organiser staff | The organiser's event team | Manage delegates and sessions day to day without touching money or settings they should not |
| Delegate | Attendee, including speakers, sponsors, exhibitors, VIPs | Register and pay on a phone in minutes, get a badge that works everywhere they are entitled to be |
| Accreditation and zone staff | Desk operators, ushers, security | A scanner that answers in one second, works offline, and tells them why a badge is refused |
| Speaker / facilitator | Runs a breakout session | Know who is in their room, start and end on time, see their feedback |
| Finance | Organiser's accountant and Algotech's finance | A ledger that ties to the gateway to the shilling; payouts, refunds and invoices that need no spreadsheet |

&#91;embedded content: stakeholder map · 7 roles around one event\]

Algotech and the organiser act on the event from above (approval, ownership); delegates and venue staff act inside it on the day; finance and speakers read from it.

## Platform admin (Algotech)

The platform admin's job is gatekeeping and oversight: nothing goes live, and no money moves, without their approval record.

**Use cases**

| ID | Use case | Trigger | Outcome | PRD section | Phase |
| --- | --- | --- | --- | --- | --- |
| PA-1 | Onboard an organiser | A signed client agreement | Organiser account exists with owner login; KYC pack requested | Event setup and approval | MVP |
| PA-2 | Verify organiser KYC | Organiser uploads KYC documents | KYC status set to verified, or specific documents sent back with a note | Event setup and approval | MVP |
| PA-3 | Review and approve an event | Organiser submits an event | Event approved with commission, fees, gateway-fee allocation and staffing fixed; or changes requested; or rejected with reason | Event setup and approval | MVP |
| PA-4 | Set an organiser's pricing | Rate card agreed with a client | Licence, commission and on-site rates stored as that organiser's defaults | Commercial model | MVP |
| PA-5 | Monitor all events | Any time | One dashboard of events by state, with KYC status, gross processed and commission earned | Analytics | MVP |
| PA-6 | Clear reconciliation exceptions | Nightly job flags a mismatch | Each exception explained and linked to a ledger correction or gateway ticket | Payments and commission | MVP |
| PA-7 | Run and confirm payouts | Weekly payout run | Payout batch sent; statements emailed; failed payouts retried or held | Payments and commission | MVP |
| PA-8 | Issue monthly commission invoice | Month end | eTIMS-compliant invoice per organiser, netted against commission already deducted | Payments and commission | Phase 2 |
| PA-9 | Suspend an organiser or event | Fraud, chargeback spike or policy breach | Registrations stop, payouts held, organiser notified with reason | Non-functional (security) | Phase 2 |

**Process: event approval**

&#91;embedded content: event approval · 2 decisions, 2 loops back to the organiser\]

An unverified organiser is sent to complete KYC before anyone at Algotech looks at the event. Review ends in one of three states; only Approved lets the organiser open registration, and the pricing and staffing fixed at review become the event's record.

## Organiser (owner)

The organiser builds and owns the event. Everything they do before approval is private; everything after approval is live to delegates.

**Use cases**

| ID | Use case | Trigger | Outcome | PRD section | Phase |
| --- | --- | --- | --- | --- | --- |
| OR-1 | Complete KYC once | First login | KYC pack uploaded; status Pending until Algotech verifies | Event setup and approval | MVP |
| OR-2 | Create an event in Draft | A new event to run | Event with name, dates, venue, time zone and currency, visible only to the organiser | Event setup and approval | MVP |
| OR-3 | Define ticket tiers | Draft event | Tiers with price, cap, sale window, visibility and entitlements (days, zones, sessions, dinner, stream) | Self-registration | MVP |
| OR-4 | Build the registration form | Draft event | Standard plus custom fields, shown per tier or category; preview on a phone | Self-registration | MVP |
| OR-5 | Set delegate categories | Draft event | Speakers, Panelists, Sponsors, Exhibitors, VIPs, General Delegates, each with zone defaults and badge colour | Delegates | MVP |
| OR-6 | Brand the event | Draft event | Logo, colours and fonts applied to page, emails, badges and reports | Self-registration | MVP |
| OR-7 | Submit for approval | Draft complete | Event moves to Submitted; organiser sees review status and any notes | Event setup and approval | MVP |
| OR-8 | Respond to Changes requested | Algotech returns the event | Edits made and resubmitted; history kept | Event setup and approval | MVP |
| OR-9 | Open registration | Event Approved | Organiser sets Live; public page and payments switch on | Event setup and approval | MVP |
| OR-10 | Invite staff | Any time | Organiser staff accounts scoped to this event, with or without revenue access | Users and roles | MVP |
| OR-11 | Import sponsored delegates | Invite list from a sponsor | CSV imported, errors returned per row, badges issued without payment | Delegates | MVP |
| OR-12 | Define zones and rooms | Venue plan agreed | Zones with capacity and access rules; rooms inside zones | Zones; Breakout rooms | Phase 2 |
| OR-13 | Build the agenda | Speakers confirmed | Sessions placed in rooms and slots with no clashes; enrolment window set | Breakout rooms | Phase 2 |
| OR-14 | Change a live event | Price, tier, date or payout change | Event returns to Under review; registration continues on approved terms | Event setup and approval | MVP |
| OR-15 | Watch the event live | Event day | Dashboard of registrations, attendance, occupancy and revenue, refreshing every minute | Analytics | MVP |
| OR-16 | Request a payout | Balance available | Payout requested against verified account; statement attached | Payments and commission | MVP |
| OR-17 | Close the event and get the report | Last event day ends | Event Closed; post-event workbook and PDF report delivered | Analytics | MVP |

**Process: build and submit an event**

1. Create the event in Draft with its basics (OR-2) and confirm KYC is verified (OR-1); submission is blocked until it is.
2. Set up what delegates will see: tiers (OR-3), the form (OR-4), categories (OR-5) and branding (OR-6). Preview the registration page on a phone from the portal.
3. Set up what staff will use: zones, rooms and the agenda (OR-12, OR-13) where the event needs them; these can be added after approval without re-review.
4. Submit (OR-7). The portal shows a checklist of what Algotech will review and the 2-working-day target.
5. On Changes requested, edit and resubmit (OR-8); on Approved, set the event Live when the sale should open (OR-9).
6. After going live, only money-related changes trigger re-review (OR-14); content changes apply at once.

## Organiser staff

Staff run the delegate side of the event day to day. They see everything except revenue unless the owner grants it, and every edit they make is attributed to them.

**Use cases**

| ID | Use case | Trigger | Outcome | PRD section | Phase |
| --- | --- | --- | --- | --- | --- |
| OS-1 | Find and correct a delegate | A delegate emails about a typo or wrong organisation | Record updated from the portal or live dashboard; change logged | Delegates | MVP |
| OS-2 | Approve or decline a registration | Approval-mode tier gets a submission | Delegate moved to Awaiting payment (payment link sent) or Cancelled with reason | Self-registration | MVP |
| OS-3 | Merge duplicates | Duplicate alert on email or phone | One record kept, scans and payments preserved | Delegates | MVP |
| OS-4 | Grant or revoke zone access | A VIP upgrade or a revoked press pass | Entitlement changed; effective on next scan | Zones | Phase 2 |
| OS-5 | Send a campaign | Reminder, schedule change, dinner invite | Email and SMS to a filtered segment; delivery status per message | Delegates | Phase 2 |
| OS-6 | Reissue a badge | Lost phone or wrong name on badge | Old QR cancelled, new one issued and printed; reason logged | Delegates; Zones | MVP |
| OS-7 | Manage a waitlist | Tier sells out | Released places offered in order; expired offers roll to the next | Self-registration | MVP |
| OS-8 | Assign delegates to sessions | Organiser-assigned enrolment mode | Rosters filled without clashes; delegates notified | Breakout rooms | Phase 2 |
| OS-9 | Export a list | A sponsor wants the attendee list | Filtered Excel or CSV export, with the export logged | Delegates | MVP |
| OS-10 | Lock profile edits | 24 hours before the event | Delegates can no longer change profile fields; badges print from final data | Delegates | MVP |
| OS-11 | Publish the programme | Agenda agreed | Day-by-day programme live on the public page; later changes marked for delegates | Programme, networking and messaging | Phase 2 |
| OS-12 | Set up a public booking page | A sponsor or speaker wants meetings from the public page | Booking page reachable without registering; requests held for approval | Programme, networking and messaging | Phase 3 |
| OS-13 | Moderate chat | A delegate reports a message | Reported thread reviewed; sender muted for the event if needed | Programme, networking and messaging | Phase 3 |

**Process: the day before the event**

1. Run the duplicate check and merge anything flagged (OS-3), then lock profile edits (OS-10).
2. Export the final list for the venue and catering (OS-9) and send the arrival reminder with badge links (OS-5).
3. Confirm zone rules and any manual grants (OS-4) and that every accreditation desk device has synced the entitlement list.
4. On the day, work from the live dashboard: fix records at the desk (OS-1), reissue badges (OS-6) and release waitlist places as no-shows become clear (OS-7).

## Delegate

A delegate should never need the organiser: registration, payment, badge, sessions and the stream are all self-service from a phone, with no password.

**Use cases**

| ID | Use case | Trigger | Outcome | PRD section | Phase |
| --- | --- | --- | --- | --- | --- |
| DE-1 | Register for an event | Event link from the organiser | Form completed in under 3 minutes; one ticket tier chosen | Self-registration | MVP |
| DE-2 | Register a group | One person paying for colleagues | Up to 10 delegates in one order, each with their own tier and badge | Self-registration | MVP |
| DE-3 | Apply a promo code | Code from a sponsor or partner | Discount shown before payment | Self-registration | MVP |
| DE-4 | Pay by M-Pesa | KES ticket | STK push to the phone; confirmed within 30 seconds of PIN | Payments and commission | MVP |
| DE-5 | Pay by card | International delegate or USD tier | Paystack hosted fields; confirmation on success | Payments and commission | MVP |
| DE-6 | Pay by bank transfer | Institutional delegate | Pro-forma invoice with reference; confirmed when the organiser marks it paid | Payments and commission | MVP |
| DE-7 | Resume an abandoned registration | Reminder email after 2 hours | Form resumes where it stopped; expires after 72 hours | Self-registration | MVP |
| DE-8 | Join a waitlist | Tier sold out | Place offered in order with a 24-hour window to pay | Self-registration | MVP |
| DE-9 | Receive and keep the badge | Payment confirmed | Email and SMS with badge link, receipt and .ics; mobile badge page with QR | Delegates | MVP |
| DE-10 | Edit own profile | Before the edit lock | Name, organisation and other profile fields updated; tier and status untouched | Delegates | MVP |
| DE-11 | Choose breakout sessions | Enrolment window opens | One session per slot, no clashes, seats remaining shown | Breakout rooms | Phase 2 |
| DE-12 | Get accredited and enter zones | Arrival at the venue | Badge scanned at the desk, then at each entitled zone and room | Zones | Phase 2 |
| DE-13 | Watch a hybrid session | Virtual tier or stream access | Embedded public stream on the badge page | Breakout rooms | Phase 3 |
| DE-14 | Rate a session | Session ends | 1–5 rating and one comment submitted | Breakout rooms | Phase 3 |
| DE-15 | Request a refund | Within the tier's refund policy | Refund to the original method; status Refunded | Payments and commission | Phase 2 |
| DE-16 | Claim a group-registered record | Badge link received from the payer | Delegate takes over their own record with a one-time code | Self-registration | MVP |
| DE-17 | Browse the event programme | Before buying or any time after | Day-by-day programme with sessions, rooms and speakers; My day shows only what they are in | Programme, networking and messaging | Phase 2 |
| DE-18 | Open a bookable calendar | Delegate wants to take meetings | Slots, location and who may book set; calendar listed in the directory | Programme, networking and messaging | Phase 3 |
| DE-19 | Book a meeting with another delegate | A sponsor or speaker worth meeting | Free slot booked, both sides confirmed with a calendar invite; no clash with sessions | Programme, networking and messaging | Phase 3 |
| DE-20 | Send a brief message | Both delegates opted in to the directory | Short text thread between two delegates; block and report available | Programme, networking and messaging | Phase 3 |

**Process: register and pay**

1. Open the event page (DE-1), pick a ticket tier and fill the form; fields shown depend on tier and category.
2. Apply a promo code if any (DE-3) and review the total, including any service fee the organiser has set to pass on.
3. Choose a payment method (DE-4 to DE-6). For approval-mode tiers the form is submitted first and payment is requested only after the organiser approves (OS-2).
4. On confirmation, receive the badge, receipt and calendar invite (DE-9). An unpaid form gets one reminder and expires after 72 hours (DE-7).
5. Before the event, edit profile details if needed (DE-10) and, once the window opens, pick sessions (DE-11).

The full flow with its approval and waitlist branches is drawn in the PRD under Self-registration.

## Accreditation and zone staff

Staff at the desk and the doors use the staff app only. Every scan gets a verdict in under a second, offline or online, and every deny says why.

**Use cases**

| ID | Use case | Trigger | Outcome | PRD section | Phase |
| --- | --- | --- | --- | --- | --- |
| AZ-1 | Sign in to a device for an event | Shift start | Device bound to the event and a post (desk, zone or room); entitlement list synced | Non-functional (offline) | MVP |
| AZ-2 | Accredit a delegate | Delegate arrives at the desk | Identity checked against the record, badge printed or activated, delegate marked accredited and checked in for the day | Zones; Delegates | MVP |
| AZ-3 | Handle a delegate with no badge | Lost link or no phone | Record found by name, phone or ID; badge reissued and printed (OS-6 on behalf of staff) | Delegates | MVP |
| AZ-4 | Scan at a zone entrance or exit | Delegate presents badge | Allow or deny with reason; occupancy updated | Zones | Phase 2 |
| AZ-5 | Override a deny | Organiser instruction at the door | Entry allowed with staff PIN and logged reason | Zones | Phase 2 |
| AZ-6 | Scan at a room door | Session about to start | Enrolled delegates admitted; walk-ins only if the session allows | Breakout rooms | Phase 2 |
| AZ-7 | Keep scanning offline | Venue Wi-Fi drops | Scans verified against the cached list and queued; synced within 2 minutes of reconnecting | Non-functional (offline) | Phase 2 |
| AZ-8 | Watch occupancy at a post | Any time | Live count for the staff member's zone, with a warning at 90% | Zones | Phase 2 |

**Process: scan verdict**

&#91;embedded content: scan verdict · 4 checks, 4 deny reasons, 1 override\]

Checks run in this order so the cheapest failure is reported first. Any deny can be overridden by staff with their PIN and a reason, and the override is logged against the scan.

## Speaker / facilitator

A speaker is a delegate with a session attached. Their view is their roster, their room and their feedback; nothing else.

**Use cases**

| ID | Use case | Trigger | Outcome | PRD section | Phase |
| --- | --- | --- | --- | --- | --- |
| SP-1 | Register as a speaker | Organiser's speaker link | Speaker-category form (bio, headshot) completed; badge with speaker colour | Self-registration; Delegates | MVP |
| SP-2 | See own sessions | Agenda published | Session times, rooms and seat counts on the badge page | Breakout rooms | Phase 2 |
| SP-3 | Upload slides | Before the session | File up to 50 MB attached to the session for the AV team | Breakout rooms | Phase 2 |
| SP-4 | View the roster | Session day | Enrolled list and live attendance count as delegates scan in | Breakout rooms | Phase 2 |
| SP-5 | Start and end the session | At the room | Timestamps recorded; attendance frozen at end; feedback opens | Breakout rooms | Phase 2 |
| SP-6 | Read feedback | After the session | Average rating and comments, visible to the speaker and the organiser | Breakout rooms | Phase 3 |
| SP-7 | Take meeting requests | Speaker opens a calendar around their session | Delegates book slots; speaker approves or declines; invites sent | Programme, networking and messaging | Phase 3 |

**Process: session day**

1. Scan in at the room door like any delegate (AZ-6); the facilitator role unlocks the roster and the start button.
2. Press Start (SP-5); the roster shows who has scanned in, so latecomers can be counted or admitted as walk-ins by the door staff.
3. Press End; attendance is frozen, feedback opens to enrolled delegates (DE-14), and the next session's facilitator takes the room.

## Finance (organiser and Algotech)

Money is split at the moment of payment and never touched by hand afterwards. The organiser's accountant and Algotech's finance team read the same ledger from opposite sides.

**Use cases**

| ID | Use case | Actor | Trigger | Outcome | PRD section | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| FI-1 | Check an order's split | Either | A query about one payment | Ledger entry shows gross, discount, gateway fee, commission and net per ticket | Payments and commission | MVP |
| FI-2 | Reconcile an event | Algotech | Nightly | Ledger total equals gateway settlement to the shilling; mismatches flagged (PA-6) | Payments and commission | MVP |
| FI-3 | Receive a payout | Organiser | Weekly run | Net balance paid to the verified account with a statement listing every order | Payments and commission | MVP |
| FI-4 | Mark a bank transfer paid | Organiser | Funds arrive | Pro-forma invoice matched by reference; delegate confirmed; commission still booked | Payments and commission | MVP |
| FI-5 | Process a refund | Organiser | Delegate request within policy | Refund to the original method; commission returned or retained per policy and shown as such | Payments and commission | Phase 2 |
| FI-6 | Handle a chargeback | Algotech | Gateway notice | Logged against the order and netted from the next payout; organiser notified | Payments and commission | Phase 2 |
| FI-7 | Receive the commission invoice | Organiser | Month end | eTIMS-compliant invoice from Algotech matching commission already deducted | Payments and commission | Phase 2 |
| FI-8 | Export the reconciliation sheet | Either | Post-event or audit | Workbook of every order with settlement status | Analytics | MVP |

**Process: from payment to payout**

1. A delegate pays (DE-4 to DE-6). The gateway callback is verified and the order is written to the ledger per ticket: gross, discount, gateway fee, platform commission at the event's approved rate, organiser net (FI-1).
2. Organiser net accrues to the event balance; commission accrues to Algotech. Gateway fees are, for now, charged against the commission line, not the organiser's net.
3. Each night the reconciliation job compares the ledger with the gateway settlement report and flags any difference (FI-2); Algotech clears exceptions before the next payout (PA-6).
4. Weekly, the payout run pays each organiser's available balance, net of any refunds and chargebacks since the last run (FI-3, FI-5, FI-6), and emails the statement.
5. At month end Algotech issues the commission invoice per organiser (FI-7); because commission was deducted at source, the invoice is informational unless a licence or on-site fee is also due.

**Process: refund**

1. Delegate requests a refund from the badge page (DE-15); the system checks the tier's refund policy and the date.
2. If within policy, the organiser approves in the portal (or the policy is set to auto-approve) and the refund goes back to the original method; M-Pesa refunds need a B2C-enabled paybill, otherwise they are marked manual.
3. The ledger writes a refund entry; commission is returned to the organiser only if the event's policy says so.
4. The delegate's status becomes Refunded, the badge is cancelled, and the seat returns to the tier cap or the waitlist (OS-7).

## Use case index

82 use cases across seven stakeholders; 49 land in the MVP. Counts by stakeholder and phase:

| Stakeholder | MVP | Phase 2 | Phase 3 | Total |
| --- | --- | --- | --- | --- |
| Platform admin (PA) | 7 | 2 | 0 | 9 |
| Organiser (OR) | 15 | 2 | 0 | 17 |
| Organiser staff (OS) | 7 | 4 | 2 | 13 |
| Delegate (DE) | 11 | 4 | 5 | 20 |
| Accreditation and zone staff (AZ) | 3 | 5 | 0 | 8 |
| Speaker / facilitator (SP) | 1 | 4 | 2 | 7 |
| Finance (FI) | 5 | 3 | 0 | 8 |
| Total | 49 | 24 | 9 | 82 |

The MVP cut is the set a first paid event needs: approval and KYC, registration and payment, badges, desk accreditation, the live dashboard, payouts and reconciliation. Zones, rooms, the public programme, campaigns and refunds follow in Phase 2 once the first event has run; streaming, meeting booking, chat and feedback in Phase 3.