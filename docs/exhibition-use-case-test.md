# Exhibition use-case test

Run on 8 November 2026 against branch `exhibition` after all three cuts, from a reset of the demo data. Screens were driven in Chrome at desktop width and in the app's browser pane at 375 wide, with the exhibition clock at its default (Wed 25 Nov 2026, 10:30, show day 1) unless a step moves it. Clock moves that cannot be undone were made in the pane, which keeps its own data. The rules each flow depends on were also run directly against the reducers, so a refusal is proved where it is enforced and not only where a button is greyed out.

Each flow ends in a verdict: **Pass** when every step works as the use cases describe, **Pass with fixes** when the pass found a defect that was fixed and re-tested before this report. Coverage per use case is in [exhibition-coverage.md](exhibition-coverage.md).

## Flow 1 — Set up the floor

**Pass.** SET-1 to SET-6, BTH-1, BTH-5, BTH-6.

| Step | Result |
| --- | --- |
| Select a booth on the plan | D5: 3 × 3 m shell scheme, KES 135,000 + VAT, KES 156,600 in all |
| Drag D5 onto D4 | Refused: "D5 cannot go there: overlaps D4." The ghost turns red while dragging |
| Nudge E6 with the arrow keys | Moves 1 m and back; focus stays on the booth |
| Settings, Checks: 50 hold requests | 50 for one booth: 1 held. 50 over ten booths: 10 held. Invariants hold afterwards |

## Flow 2 — From application to a booked stand

**Pass with fixes.** EXH-1 to EXH-6, BTH-2, BTH-3, SAL-1 to SAL-3, POR-1.

| Step | Result |
| --- | --- |
| Public exhibit page | 58 stands for sale, 12 free, live plan, today's terms ("the show is inside 14 days, so a stand booked now is paid in full") |
| Apply as Kito Sound Labs | Reference NBS-EX-0053; the portal shows *Applied* |
| Rafiki chooses D5 in its portal | Held until Fri 27 Nov, 10:30; Contract and Invoices tabs open |
| Sign by typed name | One invoice in full, INV-EX-0081, KES 156,600, due at once |
| Pay by M-Pesa | Simulated prompt; *Paid*; the tracker reaches *Paid in full*; a receipt in Messages |
| Approve Lulu Cosmetics (under review) | Its three waiting staff become *Confirmed* |
| Allocate D6, record a paper contract | Reserved; the full invoice and an Extras invoice for one extra pass |

**Defect found and fixed.** Lulu has three people on a 3 × 3 m stand that includes two passes, and nothing charged for the third ("3 of 2 passes used"). Signing now invoices people beyond the allowance as extra passes, the contract and record say so beforehand, and the pass check counts only signed bookings.

## Flow 3 — Finance and roles

**Pass with fixes.** SAL-4 to SAL-8.

| Step | Result |
| --- | --- |
| Dennis (Finance) opens Lulu's record | Invoices with record payment, reminder and void; profile read-only |
| Reconciliation: Jua's line | Suggested from the amount; matched; owed and overdue fall by KES 156,600 |
| Gearbox's line, KES 10,000 over | Refused: "KES 88,300 is more than the KES 78,300 owed on INV-EX-0026" |
| Sample Traders, payer unknown | Noted; the line stays open |
| Agnes (Accreditation) | Sales, plan, exhibitors and the Overview refuse, with a link to the scanner |

**Defects found and fixed.** A link straight to Sales, Reconciliation opened Bookings: the tab was fixed at first render, before the saved acting member loaded. The Overview showed Accreditation numbers linking to pages that refuse them; it now refuses as they do.

## Flow 4 — The stand

**Pass with fixes.** POR-2 to POR-6, LOG-4.

| Step | Result |
| --- | --- |
| Upesi pastes three staff as CSV | Three badges (EXC-EX-…); one beyond the two passes, invoiced as an extra pass (KES 2,900 with VAT) |
| Open a badge | The Exhibitor staff pass with its QR code |
| Order 2 chairs and a socket after the deadline | KES 6,375 + VAT with the 25% surcharge, KES 7,395 in all; INV-EX-0102 |
| Send a requirement | Listed as *Sent*; *Seen* once the floor team marks it |
| Faith approves Gearbox's branding, returns Jua's with a reason | Counts move; a return without a reason is refused |
| Mark Upesi's order delivered | Moves column; collection waits for dismantling, said once for the column |

**Defects found and fixed.** Accreditation could approve branding: the decision had no capability check (caught by the reducer test). Seeded branding and orders could be dated before a late contract, or at midnight. Refusals printed raw dates ("2026-11-27"). The Delivered column repeated a disabled button and its reason on every card.

## Flow 5 — Logistics

**Pass with fixes.** LOG-1 to LOG-3, LOG-5.

| Step | Result |
| --- | --- |
| Upesi books a collection, Fri 27 Nov 18:30 | Booked, registration upper-cased; the full 18:00 slot is listed but cannot be chosen |
| Schedule | Windows editable, kept around the show; move-in times fixed once build-up is over |
| Deliveries board | Each bay by slot; the one missed build-up delivery counted on the tab |
| Move the clock to dismantling (pane) | Every stand shows what blocks its sign-off |
| KCB: clear, collect rentals, sign off with damage | Signed off; the portal's checklist shows it, with the damage noted |

**Defects found and fixed.** A slot already under way could still be cancelled. A signed-off stand still showed a step to do. The portal said a past move-in "starts". Collecting rentals sent the floor team to another page; it is now one button on the row.

## Flow 6 — Show day

**Pass with fixes.** OPS-1 to OPS-5.

| Step | Result |
| --- | --- |
| Desk: stand staff of M-KOPA, which owes | Refused: "M-KOPA's stand is not paid in full", with a PIN override |
| Override, "Payment confirmed by Finance" | Accredited; logged with the reason and listed in Operations |
| Hall door: a contractor on show day | Refused: contractor passes open the halls in build-up and dismantling only |
| Operations, day 1 | 29 of 42 stands staffed from check-ins; the stands that owe are among the empty ones |
| The urgent power issue, past its 30 minutes | Assigned to Brian, resolved with a note; the stand told by SMS |

**Defect found and fixed.** Most seeded stands had nobody registered, so only 8 of 42 were staffed at 10:30 on the first morning. Every stand now has at least two people, most of a paid stand through the desk that morning.

## Flow 7 — Reports

**Pass with fixes.** REP-1 to REP-5.

| Step | Result |
| --- | --- |
| Faith (Staff) | Booth sales and attendance; no money |
| Dennis (Finance) | Revenue and outstanding added; hall totals and category totals both come to the contracted KES 8,845,464 |
| Each bar and table | Opens its records; every table downloads as CSV |

**Defect found and fixed.** The booths-by-hall chart had five series on a three-colour kit, so blue repeated. It now shows sold, held and available, and says how many booths are kept off sale.

## Rules run against the reducers

| Suite | Checks |
| --- | --- |
| Cut 2: staff, branding, orders, deliveries, dismantling, roles, windows | 28 pass |
| Cut 3: desk rule and override, hall doors, occupancy, issues and roles, day 2 arrivals once | 19 pass |
| Hold lapses on a clock move | Both seeded holds lapse once, each message dated when it lapsed |
| Seed | Invariants empty; nobody checked in for a stand that is not paid in full; nothing dated after the clock; the same seed in two runs |

## Phone width

Every exhibition page and tab, the portal tabs and the public exhibit page were checked at 375 wide: no sideways scroll on the page. The floor plan keeps about 13 px a metre and scrolls inside its card; wide tables scroll inside theirs. The active portal tab scrolls into view.

## Outside this work

ESLint reports four errors in files this branch does not change (`register.tsx`, the organiser's delegate record, `use-today.ts`): a call to `Date.now` during render and a state update inside an effect.
