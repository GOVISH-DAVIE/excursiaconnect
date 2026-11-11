# Deal Room use-case test

Run on 6 November 2026 against branch `deal-room` after all three cuts, from a reset of the demo data. The pass follows the seven flows in [03-Deal-Room-User-Flows.md](03-Deal-Room-User-Flows.md), each end to end in one browser, with the demo clock at its default (Tue 16 Mar 2027, 10:40, summit day 2) unless a step moves it. Screens were driven in the app's browser pane at 1440 and 375 wide. The rules each flow depends on were also run directly against the reducer, so a refusal is proved where it is enforced and not only where a button is greyed out.

## Vis a Vis pass, 11 November 2026

Run on branch `deal-room-vis-a-vis` after the move to 15 to 18 February 2027, so the default clock is now Tue 16 Feb 2027, 10:40. The flows below are the 6 November run, with dates and terms from before the move. This pass covers what the paper added, in Chrome at 1512 wide and in the app's browser pane at 375, with the rules run against the reducer.

| Area | Result |
| --- | --- |
| Fee on approval | Approving sends the USD 250 link; paying by M-Pesa issues the badge and opens matching; paying twice is refused; one reminder after 3 days; the lead's waiver needs a reason; providers pay nothing; a zero fee issues the badge at once. 18 of 18 rules pass |
| Challenge intake | The form asks for the problem, users, outcome, route and decision process, and refuses to submit without them; a submitted challenge goes to verification. Seeded: a ministry's identity checks and a county's smart metering (verified, matched with four businesses on sector, country and stage) and a bank's fraud pilot (in verification, not matched). 12 of 12 rules pass |
| Pipeline | 91 owners across the 13 statuses on summit day 2; at 18 August, 12 of the 13 in use, including closed or deployed. Declined and referred sort last. A meeting whose date passed with no outcome says so. **Fixed in the pass:** rows linked to application records for the coordinator, who cannot open them |
| Roles | The coordinator sees matching, meetings, the live board, the programme, the pipeline and opportunities, but not applications. Oversight sees the dashboard, pipeline, programme, reports and read-only settings. **Fixed in the pass:** oversight saw "your opportunities, 0" in reports and no conversion values on the dashboard |
| Sessions | 16 sessions across the four days, all 11 formats; day 1 and this morning's held with attendance and outcomes, the 10:30 clinic in progress. Planning refuses a meeting room, a past time, a busy room or host; an unpaid seeker cannot be invited; an accepted session blocks a meeting over it and a meeting blocks accepting; oversight cannot plan; outcomes other than no fit need a next step; cancelling needs a reason and tells those who accepted. 25 of 25 rules pass |
| Seed | Invariants hold; no accepted session crosses a meeting. **Fixed in the pass:** provider names did not match their kinds after the vocabulary change, for example a fund called a bank; each is now named for its kind, with matching email domains |
| Earlier suites | Accreditation 26, exhibition 28, 19 and review 19: all pass on the new seed |

Each flow ends in a verdict: **Pass** when every step works as the flow describes, **Pass with fixes** when the pass found a defect that was fixed and re-tested before this report.

## Flow 1 — Apply and get a decision

**Pass with fixes.** Use cases CS-1 to CS-7, DR-1 to DR-3, DR-6, DL-5.

| Step | Result |
| --- | --- |
| Public page and eligibility self-check | The check explains each criterion and carries its answers into the form |
| Resume a draft from its link (CS-3) | The one-time code (prototype: 482913) signs in and brings back the draft of Nile Data Ltd |
| Submit with gaps | Refused, naming each missing item: revenue band, pitch deck, financial statements, registration certificate; advisory items listed apart |
| Submit complete | Reference CA3-CS-00078 issued; the portal shows *Submitted* and the step tracker |
| Assign, start review, score (DR-1) | Each of 10 criteria saved only with a document or a note as evidence; weighted score 78 |
| Recommend as a reviewer, decide as a decider (DR-3, DL-5) | Aisha recommends; she cannot decide. Daniel records *Approved* with a reason, his name and the time |
| Applicant sees the decision (CS-6) | Portal shows the decision, the profile deadline and the summit badge EXC-DR-… |
| Readiness (DR-6) | *Deal Room Ready* stays blocked, listing the readiness scores and the decision-maker confirmation still missing |

**Defect found and fixed.** A seeded draft that had no ask or traction yet showed no field for them, so the form demanded a revenue band it gave no way to enter and the draft could never be submitted. Resumed drafts and invited leads now start those sections blank.

## Flow 2 — Finance provider onboarding

**Pass.** Use cases FP-1 to FP-4, DR-4.

| Step | Result |
| --- | --- |
| Unverified provider's portal (dr_fp10) | Status, Verification, Mandate and Messages only; no directory, introductions or meetings |
| Upload KYC, sign the NDA (FP-2, FP-3) | Each item shows *waiting for the reviewer*; one NDA, version CA3-NDA v1.2, covers the event |
| Reviewer checks (DR-4) | *Verify* lists every blocker until each KYC item is checked, the screening is *Clear*, the decision-maker confirmed, and a reason is written |
| Verified | Badge issued; Directory, Introductions and Meetings open in the portal |
| Mandate change (FP-4) | A change to ticket, sectors, instruments or exclusions starts a re-review; the provider stays verified (tested in Cut 1) |

## Flow 3 — From match to confirmed meeting

**Pass with fixes.** Use cases DL-7, DR-7 to DR-10, CS-8 to CS-10, FP-5 to FP-9, DO-1 to DO-6.

| Step | Result |
| --- | --- |
| Find a match (DR-7) | Candidates show each field met or missed; *Approve* stays disabled until a note explains a missed mandatory field; the brief is drafted on approval |
| Re-propose a rejected pair | A reviewer is refused (*Only the lead can re-propose it*); the lead can, with a reason, logged as a *Re-proposed pair* exception |
| Brief and introduction (DR-8, DR-9) | Brief and agenda editable until sent; the introduction lists teaser, profile and chosen documents; expiry five days |
| Directory and interest (FP-5, FP-6) | 39 approved teasers, filters by sector, country, ask and instrument; *Express interest* becomes a suggestion for the team |
| Seeker accepts with consent (CS-8, CS-9) | Ticks pitch deck, leaves financial statements unticked; consent stored per document with time and version |
| Provider accepts (FP-7, FP-8) | Documents stay greyed until both accept; then the pitch deck opens and the statements stay refused for lack of consent |
| Schedule (DO-2, DO-3) | The slot picker opens on the earliest free slot; clashes with a room, a table, either party's meetings or an enrolled session are named; auto-propose booked 8 |
| Reducer rules | A slot clashing with the day-2 workshop is refused; a pair that has not both accepted cannot be booked; operations cannot decide matches; 50-request bursts book 1, 4 and 6 meetings with no clash |
| Confirm, move, calendar (CS-10, FP-9) | Confirming flips the meeting to *Confirmed* and offers the .ics file; moving to another room in the same slot keeps both confirmations, a new time clears them |

**Defects found and fixed.** The slot picker started on a time that was not in its list, so it showed 09:00 while checking 11:00. Seeded proposals had already lapsed at the demo clock, and a confirmed meeting with a change request could lapse too; both corrected. A doubled full stop in generated briefs, and a change request worded the same for both sides.

## Flow 4 — Summit day

**Pass with fixes.** Use cases DO-7 to DO-10, DL-9.

| Step | Result |
| --- | --- |
| Deal Room desk (DO-7) | Allows a participant with meetings today and names the next one; denies a badge from another event, and one with no meeting today |
| Room door | Denies anyone without a meeting there from 15 minutes before; the second party's scan marks the meeting *In progress* |
| Late and no-show flags (DO-8) | Nothing at 10:40 for an 11:05 meeting, *late* at 10:55, *no-show?* at 11:16 |
| No-show and refill (DO-10) | No-show recorded for the provider; the seeker's next ready match is booked in that room at the next free slot, proposed for both to confirm |
| Outcome (DO-9) | Held, positive, next action and owner open an opportunity in *Follow-up* and notify the owner; sensitive notes show to the lead and owner only |
| Ended without an outcome | The board flags it once the slot ends |
| 19:00 (DL-9) | The daily report message goes to the lead, stamped 19:00 even when the clock jumps past several evenings |
| Badge | A Deal Room badge cannot be booked through the open calendar; My day lists the Deal Room meetings |

**Defects found and fixed.** The live board's tile row pushed the page wider than a phone. The outcome form kept the previous meeting's entries when another meeting was picked. A meeting still *In progress* after its end was not flagged. The scanner's samples for the desk pointed the investor at a different meeting from the seeker once the seeker had checked in.

## Flow 5 — Opportunity after the summit

**Pass with fixes.** Use cases DL-10, DL-12, CS-12, FP-10.

| Step | Result |
| --- | --- |
| Clock to 15 Jun | The seeded timeline plays: 4 won, 4 lost, 4 in negotiation, the rest in follow-up or diligence; 11 overdue, 11 quiet for 30+ days |
| Owner's list | Reviewers see only their own opportunities; values show to the lead and to the owner of that record |
| Stages | Diligence and Negotiation need evidence; *Closed – won* is refused until a signed commitment is recorded |
| Outcomes | Interest, promise, commitment and funds received are separate records; commitment needs amount, currency, instrument, date and the document |
| Monthly review (DL-10) | The lead marks all 15 open ones reviewed for June; reassigning needs a reason, is logged and notifies the new owner |
| Status request (CS-12, FP-10) | The seeker sees the request on the portal's Status tab, answers from Deals with a sample statement attached; the reply lands on the record and the owner is notified; the stage stays the owner's |
| Conversion report | Lead only; sought, promised, committed and received by owner, mission, sector or month, never summed together; closed by reason; overdue actions |
| Messages | Weekly digests per owner, monthly conversion reports for April, May and June |
| Clock to 19 Sep (DA-8, DL-12) | Archived: every record read-only, the pack sent to the lead, the post-summit pack exportable; retention extended 6 months with a reason |

**Defects found and fixed.** The document deletion date showed no year. Review prompts and stall warnings stayed on screen after the archive.

## Flow 6 — Consent and document access

**Pass.** Use cases CS-8, CS-11, DR-9, FP-7.

| Step | Result |
| --- | --- |
| Before both accept | The provider can open the full profile only; each document says why it is closed |
| After both accept | The consented document opens in a preview watermarked with the viewer's name, organisation and time |
| Logged (CS-11) | Each opening and download appears in the seeker's access log, newest first |
| Withdraw | The document closes at once; the log keeps the two openings already made; the reviewer is told |
| Rule checks | An opening after withdrawal is not recorded; a download of a view-only document is not recorded; an unverified provider sees no directory |

## Flow 7 — Service interruption and recovery

**Pass with fixes.** Use cases DO-11, DA-6, DA-7.

| Step | Result |
| --- | --- |
| Live window (DA-6) | Declared on the admin page with the on-call rota |
| Offline | Outcomes wait on the device with their own ids; no meeting can be booked |
| Back online | Device B's queue syncs: the duplicate is dropped by id, the differing record goes to the lead as a conflict, never overwritten |
| Incident (DA-7) | Opened on going offline, closed by the sync with counts; the lead gets the incident report; the admin page lists it |
| Paper entry | Recording over an existing outcome is refused unless it is a paper-sheet entry with a reason; the screen warns what it replaces and the change is logged as an exception |

**Defects found and fixed.** Paper entry was missing, and the reducer would have replaced a recorded outcome without a trace. The incident report read "1 records synced".

## What the pass did not cover

- Two testers working in parallel, as the plan proposed: the pass ran in one browser, with the rules re-checked against the reducer.
- The native apps, real email, SMS and push, French, backup and recovery, capacity tests and handover: none is built (see [deal-room-coverage.md](deal-room-coverage.md)).
- *Cancelled* and *rescheduled* as on-the-day statuses on the live board: the reducer accepts a cancellation, but the board offers only held and no-show.
- A no-show declared after its slot has begun frees the next slot in that room, not the one already under way.
- When the clock jumps several weeks, each owner gets the latest weekly digest only.
