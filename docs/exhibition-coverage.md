# Exhibition coverage

What the prototype covers of the 49 use cases in [exhibition-use-cases.md](exhibition-use-cases.md), grouped by the eight areas of the brief, as of 9 November 2026 on branch `exhibition`, after a review of each use case and user journey. The flow-by-flow test is in [exhibition-use-case-test.md](exhibition-use-case-test.md).

**Built** means the use case works end to end on mock data, with its rules enforced in the reducer. **Partial** means the screen exists but a step is simulated, or the use case is met more narrowly than it asks. **Not built** means nothing on screen.

The module runs on the Nairobi Brand & PR Summit 2026 (Sarit Expo Centre, 25 to 27 November 2026). An exhibition clock in the workspace rail starts at show day 1, 10:30, and only moves forward: +15 minutes, +1 hour, day 2, day 3, dismantling and after the show. Hold expiries, overdue invoices, late surcharges, delivery slots, issue service times and the hall door rules are worked out from it, and the scanner reads it for this event.

All 49 are covered: 47 built, 2 partial.

## 1. Exhibition setup (SET)

Exhibition halls, floor plans, booth sizes, categories and pricing.

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| SET-1 | Define the exhibition halls | Built | Settings, Halls: add a hall, or remove an empty one; name and size in metres; entrances, loading doors and fire exits placed along a wall, pillars on the floor; a hall cannot shrink past its booths, a pillar cannot go under a booth, and every hall needs an entrance. All halls open through the Exhibition zone |
| SET-2 | Lay out booths on the floor plan | Built | `/exhibition/plan`: add, drag on a 1 m grid, nudge with the arrow keys, code, block; overlaps, pillars and walls refused with the reason |
| SET-3 | Set booth types and sizes | Built | Plan, booth panel: shell scheme or space only, width and depth; fixed while booked. Settings: what each type includes, shown on the exhibit page with the pass allowance from the terms |
| SET-4 | Set booth categories | Built | Plan, booth panel: standard, corner, island, premium location, each with its factor |
| SET-5 | Set the prices | Built | Settings, Prices and terms: rate per m² by type, category factors, VAT, agreed prices per booth; every change logged with a reason |
| SET-6 | Set the terms and deadlines | Built | Settings: hold hours, deposit, balance date, full-invoice window, cancellation, contract version, order and branding deadlines |

## 2. Exhibitor management (EXH)

Applications, company profiles, approvals and exhibitor registration.

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| EXH-1 | Publish the exhibit page | Built | `/e/nairobi-brand-summit-2026/exhibit`: halls, live plan, prices, what a stand includes, today's payment terms, who is exhibiting |
| EXH-2 | Apply to exhibit | Built | The same page: company, products, size, hall and booth preference (the booths offered follow the size and hall asked for, and the form says when none is free); a reference and a portal link |
| EXH-3 | Review applications | Built | `/exhibition/exhibitors` with filters by status, sector, hall and booth; the record shows the size, hall and booth asked for and starts the review |
| EXH-4 | Approve, waitlist or decline | Built | Record, Decision: a reason needed to waitlist or decline; the company is told |
| EXH-5 | Keep the company profile | Built | Portal Profile and the record's Profile; changes logged |
| EXH-6 | Register the exhibitor's people | Built | Approving a company confirms its waiting staff; the portal's People tab registers more (POR-2) |
| EXH-7 | Bring in existing exhibitors and sponsors | Built | Seed: the summit's Exhibitor and Sponsor delegates belong to their companies, Exhibitor passes moved to the exhibitor tier |

## 3. Booth management (BTH)

Interactive floor plans, booth selection, allocation, reservations and availability tracking.

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| BTH-1 | See the interactive floor plan | Built | Plan, public page and portal: to scale, coloured by status, tooltips on hover and focus, keyboard selection; legible at 375 wide by scrolling sideways |
| BTH-2 | Allocate a booth | Built | Plan booth panel or the record: to an approved company with no booth; held for 48 hours |
| BTH-3 | Choose and hold a booth | Built | Portal, Booth: approved companies only, one booking at a time |
| BTH-4 | Release an expired hold | Built | Expiry follows from the clock; when the clock passes it the booking logs it and the company is told |
| BTH-5 | Never sell a booth twice | Built | The hold rule in the reducer; Settings, Checks sends 50 requests for one booth (1 held) and over ten (10 held) |
| BTH-6 | Track availability | Built | Plan filters by status and category; each count in the availability table picks out that status and category; Overview and Reports by hall and category |
| BTH-7 | Move or release a booking | Built | Cancel under the terms, then allocate the new booth; a one-step swap is out of scope |

## 4. Sales and payments (SAL)

Booth bookings, contracts, invoicing, payment tracking and reconciliation.

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| SAL-1 | Sign the participation contract | Built | Portal, Contract: typed name and title; the team records a paper copy |
| SAL-2 | Invoice the deposit and balance | Built | Issued on signing: deposit and balance, or one invoice in full inside 14 days of the show; staff beyond the pass allowance go on an Extras invoice |
| SAL-3 | Pay by M-Pesa | Partial | Portal, Invoices: the STK prompt and its callback are simulated; the payment is recorded through the real rule |
| SAL-4 | Record a bank transfer | Built | Record, invoice row: method, reference, amount, date; never more than is owed |
| SAL-5 | Reconcile bank lines | Built | Sales, Reconciliation: suggested match, an overpayment refused with the reason, a note for what stays open |
| SAL-6 | Chase overdue invoices | Built | Overdue from the clock, on the Overview, Sales and the record; reminders sent |
| SAL-7 | Cancel a booking | Built | Record: a reason; unpaid invoices voided, payments kept, the booth back on sale |
| SAL-8 | See stand fees in organiser Finance | Built | Organiser event, Finance: stand fees as their own line, no commission |

## 5. Exhibitor portal (POR)

Booking management, staff registration, branding uploads and special requirements.

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| POR-1 | Manage the booking | Built | `/exhibitor/[id]`: status tracker, booth, contract, invoices, messages; once signed, the Status tab lists what the stand still needs (staff, contractors, branding, orders, move-in, dismantling), each opening its tab |
| POR-2 | Register stand staff | Built | Portal, People: one at a time or a pasted or uploaded CSV; extra passes invoiced in one invoice; each person gets a badge; a pass not yet used can be cancelled |
| POR-3 | Upload branding | Built | Portal, Stand: fascia name (24 characters), logo and artwork, kept as file metadata; marked late after the deadline |
| POR-4 | Order equipment and services | Built | Portal, Stand: catalogue by group, the late surcharge after the order deadline, one invoice per order |
| POR-5 | State special requirements | Built | Portal, Stand: kind and text; shows when the floor team has seen it |
| POR-6 | Approve branding | Built | `/exhibition/services`, Branding: approve for print, or return with a reason; the company is told |

## 6. Exhibition logistics (LOG)

Setup schedules, equipment, utilities, deliveries and dismantling.

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| LOG-1 | Set the build-up and dismantle schedule | Partial | `/exhibition/logistics`, Schedule: one build-up and one dismantling window for the venue, kept around the show in the reducer; a move-in time per stand, shown in the portal. The use case asks for windows per hall; both halls share the venue's windows |
| LOG-2 | Register contractors | Built | Portal People or Logistics, Contractors: contractor passes on their own tier and category |
| LOG-3 | Book a delivery | Built | Portal On site or Logistics, Deliveries: bay and slot, a full or past slot refused; arrivals and missed vehicles on the bay board |
| LOG-4 | Fulfil equipment and utility orders | Built | Stand services, Orders: ordered, delivered, collected; collection opens with dismantling |
| LOG-5 | Sign off dismantling | Built | Portal checklist; Logistics, Dismantling: cleared, rentals collected, damage noted, signed off |

## 7. Exhibition operations (OPS)

Booth occupancy, exhibitor check-in, access passes and issue management.

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| OPS-1 | Check exhibitor staff in | Built | `/scan` desk: a stand's people are accredited only when its stand is paid in full (rule in the store's accredit); PIN override with a reason, only for a stand that still owes (a company not approved or without a signed stand is the exhibition team's call), approved by someone the role matrix lets override, logged with who approved it and listed in Operations |
| OPS-2 | Control hall access by pass | Built | `/scan` hall doors: contractor passes in build-up and dismantling only, stand staff from 07:30 on show days, on the exhibition clock |
| OPS-3 | See booth occupancy | Built | `/exhibition/operations`: the plan coloured by stands staffed each day, from check-ins or the floor walk's call |
| OPS-4 | Report an issue | Built | Portal On site, and Operations for the floor team |
| OPS-5 | Resolve issues within the SLA | Built | Operations: assign, resolve with a note; due by priority (30 minutes, 2 hours, 8 hours), past due flagged here and on the Overview |

## 8. Reporting (REP)

Booth sales, occupancy, exhibitor attendance, revenue and outstanding payments.

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| REP-1 | Booth sales | Built | `/exhibition/reports`: booths by hall, floor sold by category, a table by hall and category with CSV; every bar and count opens those booths on the plan; Overview graphs |
| REP-2 | Occupancy | Built | Reports: stands staffed by show day, each day opening Operations |
| REP-3 | Exhibitor attendance | Built | Reports: companies present and people checked in by day, table and CSV |
| REP-4 | Revenue | Built | Reports (Finance): contracted, invoiced and paid, by hall and category, CSV |
| REP-5 | Outstanding payments | Built | Reports (Finance): owed by age and by exhibitor with the oldest invoice, CSV; each age opens its invoices |

## Not built, by design

Native apps; real payments, messages and e-signature; card payment, credit notes and one-step booth swaps; printing badges and passes; importing a CAD floor plan; commission on stand fees. Files are kept as metadata only.
