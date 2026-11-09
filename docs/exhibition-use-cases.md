# ExcursiaConnect Exhibition — Stakeholders and Use Cases

Nov 8, 2026 · drafted for the build

The Exhibition module lets an organiser sell and run the stands at an event: halls and a floor plan, exhibitor applications, booth selection and allocation, contracts and invoices, an exhibitor portal, logistics, operations on the show floor, and reports. It is built on the Nairobi Brand & PR Summit 2026 (Sarit Expo Centre, 25 to 27 November 2026).

Stand fees are the organiser's own receivables. They are invoiced, paid and reconciled in the module and show as their own line in organiser Finance. Algotech takes no commission on them, and they do not touch ticket orders or payouts.

## The scope, as given

1. Exhibition Setup: Exhibition halls, floor plans, booth sizes, categories and pricing.
2. Exhibitor Management: Applications, company profiles, approvals and exhibitor registration.
3. Booth Management: Interactive floor plans, booth selection, allocation, reservations and availability tracking.
4. Sales & Payments: Booth bookings, contracts, invoicing, payment tracking and reconciliation.
5. Exhibitor Portal: Booking management, staff registration, branding uploads and special requirements.
6. Exhibition Logistics: Setup schedules, equipment, utilities, deliveries and dismantling.
7. Exhibition Operations: Booth occupancy, exhibitor check-in, access passes and issue management.
8. Reporting: Booth sales, occupancy, exhibitor attendance, revenue and outstanding payments.

Use case IDs follow these areas: SET, EXH, BTH, SAL, POR, LOG, OPS, REP. Each names the cut that delivers it.

## Stakeholders

| Stakeholder | Who | Can do | Cannot do |
| --- | --- | --- | --- |
| Exhibition manager | The organiser's Staff role (with `expo.manage` and `expo.floor`) | Set up halls and the plan, review exhibitors, allocate booths, run logistics and the show floor | Record payments unless also given the money capabilities |
| Finance | The organiser's Finance role (`money.view`, `money.markPaid`, `money.refund`) | Issue and void invoices, record payments, reconcile bank lines, cancel bookings under the terms | Change the floor plan or decide applications |
| Accreditation | Desk and door staff (`access.scan`, `access.override`) | Check exhibitor staff in, admit contractors in their windows, override a refusal with a PIN and a reason | Anything outside the scanner |
| Owner | The organiser's owner | Everything | — |
| Exhibitor contact | The person who applies for a company | Apply, keep the company profile, choose a booth once approved, sign the contract, pay, register staff, upload branding, order services, book deliveries, report issues | See other exhibitors' bookings or invoices |
| Exhibitor staff and contractors | People on a company's stand or building it | Hold a pass that works at the desk and the hall doors | Enter the hall outside their pass's hours |
| Public visitor | Anyone | Read the exhibit page, see the plan and prices, apply | Anything behind the portal |

The organiser's role matrix gives capabilities to roles, not people. Three team members hold the Staff role, so all three can manage the exhibition; the matrix cannot single one of them out.

## 1. Exhibition setup (SET)

| ID | Use case | Who | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- | --- |
| SET-1 | Define the exhibition halls | Exhibition manager | Venue confirmed | Each hall with a name, size in metres, its access zone, and fixed features (entrances, pillars, loading doors) | 1 |
| SET-2 | Lay out booths on the floor plan | Exhibition manager | Halls defined | Booths placed to scale, moved and resized on a 1 m grid, coded (A12) and blockable; overlaps and out-of-bounds placements refused | 1 |
| SET-3 | Set booth types and sizes | Exhibition manager | Before sales open | Shell scheme and space only, with standard sizes (3 × 3, 3 × 6, 6 × 6) and what each includes | 1 |
| SET-4 | Set booth categories | Exhibition manager | Before sales open | Standard, Corner, Island and Premium location, each with a price factor | 1 |
| SET-5 | Set the prices | Exhibition manager | Before sales open | A rate per m² by type, the category factor, VAT, and a per-booth override where agreed | 1 |
| SET-6 | Set the terms and deadlines | Exhibition manager | Before sales open | Hold hours, deposit share and days to pay, balance date, pass allowance, order and branding deadlines, cancellation terms | 1 |

## 2. Exhibitor management (EXH)

| ID | Use case | Who | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- | --- |
| EXH-1 | Publish the exhibit page | Exhibition manager | Sales open | A public page with the halls, the plan with live availability, prices and what a stand includes | 1 |
| EXH-2 | Apply to exhibit | Exhibitor contact | Wants a stand | An application with the company profile, products, preferred size and hall, and a booth preference; a reference and a portal link | 1 |
| EXH-3 | Review applications | Exhibition manager | Applications arrive | A queue with filters by status, sector and hall; each application opened with its profile and preference | 1 |
| EXH-4 | Approve, waitlist or decline | Exhibition manager | Review done | The decision with a reason, recorded and sent; approval opens booth choice in the portal; a waitlisted company can be approved later | 1 |
| EXH-5 | Keep the company profile | Exhibitor contact or manager | Details change | Name, sector, description, website, logo and contacts current; shown on the public exhibitor list once booked | 1 |
| EXH-6 | Register the exhibitor's people | Exhibitor contact | Approved | Staff become exhibitor delegates linked to the company; approving a company approves its waiting staff | 1 (link), 2 (portal) |
| EXH-7 | Bring in existing exhibitors and sponsors | Exhibition manager | Module switched on | Companies already registered as Exhibitor or Sponsor delegates appear as exhibitors with their people | 1 |

## 3. Booth management (BTH)

| ID | Use case | Who | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- | --- |
| BTH-1 | See the interactive floor plan | Everyone | Any time | The plan to scale, each booth coloured and labelled by status, with size, category and price on hover or focus | 1 |
| BTH-2 | Allocate a booth | Exhibition manager | Exhibitor approved | The booth held for that exhibitor, who is told and can sign the contract | 1 |
| BTH-3 | Choose and hold a booth | Exhibitor contact | Approved | An available booth held for 48 hours while the contract is signed | 1 |
| BTH-4 | Release an expired hold | System | 48 hours pass unsigned | The booth available again, the exhibitor told | 1 |
| BTH-5 | Never sell a booth twice | System | Two requests for one booth | The second refused; a 50-request test books one | 1 |
| BTH-6 | Track availability | Exhibition manager | Any time | Booths and m² available, held, reserved and booked, by hall and category, each count opening its booths | 1 |
| BTH-7 | Move or release a booking | Exhibition manager | Exhibitor asks, or a booth must change | The booking cancelled under the terms and a new booth allocated | 1 |

## 4. Sales and payments (SAL)

| ID | Use case | Who | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- | --- |
| SAL-1 | Sign the participation contract | Exhibitor contact, or Finance for a paper copy | Booth held | Contract version, name, title and time recorded; the booking becomes Reserved and the deposit invoice is issued | 1 |
| SAL-2 | Invoice the deposit and balance | System | Contract signed | Deposit (50%, due in 7 days) and balance (due 11 Nov) with VAT; within 14 days of the show, one invoice in full, due at once | 1 |
| SAL-3 | Pay by M-Pesa | Exhibitor contact | Invoice open | Payment recorded against the invoice; deposit paid makes the booking Booked | 1 |
| SAL-4 | Record a bank transfer | Finance | Transfer arrives | Payment recorded with its reference against the invoice | 1 |
| SAL-5 | Reconcile bank lines | Finance | Statement imported | Each bank line matched to an invoice, or left open with the reason | 1 |
| SAL-6 | Chase overdue invoices | Finance | Due date passes | Overdue flagged on the dashboard and the exhibitor's record; a reminder sent | 1 |
| SAL-7 | Cancel a booking | Finance or manager | Exhibitor withdraws or does not pay | Booth released, unpaid invoices voided, the deposit kept under the terms | 1 |
| SAL-8 | See stand fees in organiser Finance | Finance | Any time | Stand fees as their own line: invoiced, paid, outstanding; no commission | 1 |

## 5. Exhibitor portal (POR)

| ID | Use case | Who | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- | --- |
| POR-1 | Manage the booking | Exhibitor contact | Any time | Status, booth on the plan, contract, invoices and what is due | 1 |
| POR-2 | Register stand staff | Exhibitor contact | Booking confirmed | Staff within the allowance (2 per 9 m²), extra passes invoiced; each gets a badge | 2 |
| POR-3 | Upload branding | Exhibitor contact | Before the branding deadline | Fascia name, logo and artwork submitted for approval | 2 |
| POR-4 | Order equipment and services | Exhibitor contact | Before build-up | Furniture, power, water, internet and AV ordered from the catalogue; a late surcharge after the order deadline; added to an invoice | 2 |
| POR-5 | State special requirements | Exhibitor contact | Any time before the show | Access, storage, rigging or other needs recorded for the floor team | 2 |
| POR-6 | Approve branding | Exhibition manager | Branding submitted | Approved, or returned with a reason | 2 |

## 6. Logistics (LOG)

| ID | Use case | Who | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- | --- |
| LOG-1 | Set the build-up and dismantle schedule | Exhibition manager | Before build-up | Windows per hall and a move-in slot per exhibitor, shown in the portal | 2 |
| LOG-2 | Register contractors | Exhibitor contact or manager | Before build-up | Contractors with contractor passes that only work in the build-up and dismantle windows | 2 |
| LOG-3 | Book a delivery | Exhibitor contact | Before build-up | A loading-bay slot with the vehicle; a full slot refused | 2 |
| LOG-4 | Fulfil equipment and utility orders | Exhibition manager | Orders placed | Each order moved from ordered to delivered to collected | 2 |
| LOG-5 | Sign off dismantling | Exhibition manager | After the show | A checklist per stand: cleared, rentals returned, damage noted | 2 |

## 7. Operations (OPS)

| ID | Use case | Who | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- | --- |
| OPS-1 | Check exhibitor staff in | Accreditation | Staff arrive | Accredited only when the company's booking is paid in full; otherwise refused, or let in with a PIN and a reason that is logged | 3 |
| OPS-2 | Control hall access by pass | Accreditation | At the hall doors | Exhibitor passes from 07:30 on show days; contractor passes only in build-up and dismantle windows | 3 |
| OPS-3 | See booth occupancy | Exhibition manager | Show days | The plan coloured by booths staffed today, from check-ins and the floor team's toggle | 3 |
| OPS-4 | Report an issue | Exhibitor contact or floor team | Something goes wrong | An issue with booth, category, priority and description | 2 (portal), 3 |
| OPS-5 | Resolve issues within the SLA | Exhibition manager | Issue open | Assigned, worked and resolved; an issue past its SLA flagged | 3 |

## 8. Reporting (REP)

| ID | Use case | Who | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- | --- |
| REP-1 | Booth sales | Manager, Finance | Any time | Booths and m² by hall, category and status, as graphs and tables, each count opening its booths | 1 (overview), 3 |
| REP-2 | Occupancy | Manager | Show days | Booths staffed by day | 3 |
| REP-3 | Exhibitor attendance | Manager | Show days | Exhibitors and staff checked in by day | 3 |
| REP-4 | Revenue | Finance | Any time | Contracted, invoiced and paid, by hall and category | 3 |
| REP-5 | Outstanding payments | Finance | Any time | Outstanding by age (not due, 1–14 days, 15+ days) and by exhibitor | 3 |

## Not in scope

Native apps; real payments, messages and e-signature; card payment, credit notes and booth swaps; printing badges and passes; importing a CAD floor plan; commission on stand fees.
