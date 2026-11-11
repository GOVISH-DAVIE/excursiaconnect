# Deal Room coverage

What the prototype covers of the 63 use cases in [02-Deal-Room-Stakeholders-and-Use-Cases.md](02-Deal-Room-Stakeholders-and-Use-Cases.md) and of the PRD's acceptance criteria, as of 6 November 2026 on branch `deal-room`. The flow-by-flow test is in [deal-room-use-case-test.md](deal-room-use-case-test.md).

**Built** means the use case works end to end on mock data, with its rules enforced in the reducer. **Partial** means the screen exists but a step is simulated or missing. **Not built** means nothing on screen.

The demo runs on Connected Africa 3.0 (Bouer, 15 to 18 February 2027; applications open 15 December 2026) with a demo clock in the staff rail, set to summit day 2 at 10:40. Its steps are +25 minutes, 19:00, 18 May and 22 August. The clock only moves forward; expiries, lapses and overdue flags are worked out from it.

## Added for the Vis a Vis decision paper (11 November 2026)

Branch `deal-room-vis-a-vis` brings the module into the paper's terms and scope. Item by item against the paper, in [deal-room-vis-a-vis-gaps.md](deal-room-vis-a-vis-gaps.md).

| Area | What is built | Where |
| --- | --- | --- |
| Dates | Everything 28 days earlier, same weekdays: summit 15 to 18 February 2027, applications from 15 December 2026, design freeze 22 January, tracking to 21 August | Seed and settings |
| Vocabulary | 3 missions and 6 strategic tracks; the 19-sector taxonomy; 10 participant kinds, from angel investor to public institution; 8 transaction pathways; Qualified, Conditional, Referred, Declined; the rubric's relevance, credibility, readiness, counterparty fit and consent | Every screen, the apply form and the public page |
| Participation fee | Approval sends a USD 250 payment link; M-Pesa (KES at 130) or card; one reminder after 3 days; the lead may waive it with a reason. Paying or the waiver issues the badge and opens matching; an unpaid seeker is flagged and cannot be matched | Portal Status, review page, Settings, dashboard |
| Challenge intake | A public institution or corporate buyer brings a challenge: problem, users, outcome, constraints, route (RFP, pilot, PPP, …), budget, timeline, decision process. Verified like a provider, then matched against businesses on sector, country and stage, with pathway and ticket as preferences. Verified challenges are listed on the public page | Apply `?type=challenge`, portal Challenge tab, review page, public page |
| One pipeline | Every opportunity owner at the furthest of the paper's 13 statuses its records support, with the date, the owner and the evidence; counts per status as filters; the five commitment tiers reported apart; CSV | `/dealroom/pipeline` |
| Roles | Excursia's coordinator matches, introduces, schedules and runs the programme; Momentum's oversight reads the dashboard, pipeline, programme and every report, with values, and changes nothing | Staff switcher, `/admin/deal-room` |
| Meeting outcomes and tiers | The paper's seven outcomes; commitments as expression of interest, indicative, signed, approved not disbursed, deployed | Live board, opportunities, reports |
| Sessions | The paper's 11 formats beyond one-to-ones, planned by day in the presentation area and the roundtable room; each day's emphasis and close-out checks; invitations to qualified or verified participants, accepted or declined from the portal; attendance and an outcome per attendee. An accepted session holds the participant's time against meetings, and a meeting holds it against sessions | `/dealroom/programme`, portal Programme tab |

**Phones, for the summit days.** Checked at 375 wide:
- **Menus:** a menu of more than four pages becomes a drawer behind an icon-only bar, for staff (every persona's rail) and for the participant portal.
- **Live board:** a meeting opens in a sheet from the bottom, and each room's row opens on the meeting happening now or next.
- **Sessions:** cards with a large attendance tick, and a saved outcome reads as saved, with Change.
- **Dashboard:** cards and counts sit two to a row.

Each role's attention list holds only its own work, and no dashboard or report link leads to a page the role cannot open.

Not done from the paper: post-summit tracking as an add-on that is off unless contracted (it still runs six months), the four movements as a reporting tag, the 19:00 report carrying the day's close-out checks, and the zones beyond the two session rooms.

## Algotech admin (DA)

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| DA-1 | Enable the Deal Room for an event | Built | `/admin`, approval pane: add-on, price and desk staff recorded with the approval |
| DA-2 | Provision Deal Room staff | Built | `/admin/deal-room`: role, may decide, MFA forced for the lead and reviewers |
| DA-3 | Change or remove access | Built | `/admin/deal-room`: role change or revoke, effective at once and logged |
| DA-4 | Publish the apps | Not built | No Android or iOS app; every screen is checked at 375 wide instead |
| DA-5 | Support a participant | Built | `/admin/deal-room`: a file opens only under a lead's time-limited grant; each opening logged |
| DA-6 | Declare the summit live window | Built | `/admin/deal-room`: declaration with the on-call rota |
| DA-7 | Restore after an interruption | Partial | Incidents open and close with the offline toggle, with sync counts and a report to the lead; no real outage or alerting |
| DA-8 | Archive the Deal Room | Built | At the conversion end date: read-only in the reducer, pack sent to the lead, deletion date in Settings, extension with a reason |

## Deal Room lead (DL)

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| DL-1 | Configure the Deal Room | Built | `/dealroom/settings`: missions, sources, form fields, rubric, matching fields and ordering |
| DL-2 | Set deadlines and meeting rules | Built | Settings, Rules and deadlines; the freeze date logs later structural changes as exceptions |
| DL-3 | Import the mobilisation pipeline | Built | Applications, Import leads: CSV with per-row errors, then invitations |
| DL-4 | Assign and rebalance the review queue | Built | Applications: filters, bulk assign, workload per reviewer |
| DL-5 | Approve or decline an applicant | Built | Review page: decide with a reason; a decline or a large ask needs a second, different decider |
| DL-6 | Record an exception | Built | Settings, Exceptions: written by overrides, expiries, post-freeze changes and paper entries |
| DL-7 | Oversee matching | Built | `/dealroom/matching`: by mission with stage counts, CSV and print export with briefs |
| DL-8 | Watch progress against targets | Built | `/dealroom`: funnel against 150, 60 and 200, every number a link |
| DL-9 | Read the daily summit report | Built | Message at 19:00; Reports, Daily |
| DL-10 | Run the monthly conversion review | Built | Opportunities, Monthly review: mark reviewed, reassign quiet ones with a reason |
| DL-11 | Grant support access | Built | Application page: time-limited grant to Algotech support |
| DL-12 | Export the post-summit pack | Built | Opportunities, Export: one row per opportunity with every stage date and outcome value |

## Reviewer (DR)

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| DR-1 | Review an application | Built | Review page: eligibility, weighted assessment and readiness, each score resting on a document or a note |
| DR-2 | Request information | Built | Requests tab; the lead handles an expired request |
| DR-3 | Recommend or record a decision | Built | Decision tab: reviewers recommend, deciders decide |
| DR-4 | Verify a finance provider | Built | Verification tab: KYC items, screening, NDA, decision-maker |
| DR-5 | Re-review a changed profile | Built | A material change flags re-review; the decision stands meanwhile |
| DR-6 | Set readiness | Built | Decision tab: *Deal Room Ready* blocked until its criteria are met |
| DR-7 | Find and approve a match | Built | Matching: fit per field, note for a missed mandatory field, lead override to re-propose |
| DR-8 | Prepare a brief | Built | Match page: brief and agenda drafted from both profiles, editable until sent |
| DR-9 | Send an introduction | Built | Match page: teaser, profile and chosen documents; five-day expiry |
| DR-10 | Handle an expression of interest | Built | Matching, Suggestions: turn into a match or decline |

## Operations (DO)

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| DO-1 | Set up Deal Room rooms and tables | Built | Meetings, Rooms and tables; a programme session cannot take a room a meeting holds |
| DO-2 | Schedule a meeting | Built | Meetings, Ready to schedule: the slot picker names every clash and cap |
| DO-3 | Auto-propose a schedule | Built | Meetings, Auto-propose |
| DO-4 | Handle a change request | Built | Meetings, Changes: move or cancel; a new time needs both confirmations again |
| DO-5 | Override a cap | Built | Slot picker: override with a reason, logged as an exception |
| DO-6 | Export schedules | Built | Meetings, Export: CSV per room, day and participant; print view at `/print/deal-room` |
| DO-7 | Check participants in | Built | `/scan?event=ev_ca3&post=drdesk`: Deal Room desk records arrival against the day's meetings |
| DO-8 | Run the live board | Built | `/dealroom/live`: tiles per room and table, late, no-show and missing-outcome flags; the door scan starts a meeting |
| DO-9 | Record attendance and outcome | Partial | Held or no-show with outcome, next action, owner, due and sensitive notes; *cancelled* and *rescheduled* are not offered on the board |
| DO-10 | Refill a no-show slot | Built | Live board: the party who came gets their next ready match in that room |
| DO-11 | Work through an outage | Partial | Offline toggle, device queue with client ids, dedupe and conflicts on sync, paper entry; the device cache is simulated |

## Capital seeker (CS)

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| CS-1 | Check eligibility | Built | `/e/connected-africa-3/deal-room`: self-check with each criterion explained |
| CS-2 | Apply as a capital seeker | Built | `/e/connected-africa-3/deal-room/apply`: one-time code, autosave, gaps named on submit |
| CS-3 | Resume a draft on another device | Built | Resume link on the form |
| CS-4 | Track application status | Built | `/dr/[appId]`, Status |
| CS-5 | Respond to a request for information | Built | Status: answer with documents |
| CS-6 | Receive a decision | Built | Status: decision, reason and conditions |
| CS-7 | Complete the matching profile | Built | Profile: teaser with anonymity, ask, deadline |
| CS-8 | Set sharing consent | Built | Introductions: consent per document on accepting; withdraw at any time |
| CS-9 | Accept or decline an introduction | Built | Introductions |
| CS-10 | Confirm or move a meeting | Built | Meetings: confirm within the window, ask to move, calendar file |
| CS-11 | See who opened my file | Built | Access log |
| CS-12 | Update deal progress | Built | Deals: answer a status request with evidence |

## Finance provider (FP)

| ID | Use case | Status | Where |
| --- | --- | --- | --- |
| FP-1 | Apply as a finance provider | Built | Apply form, provider type and mandate |
| FP-2 | Complete verification | Built | Verification: KYC uploads |
| FP-3 | Sign the NDA | Built | Verification: typed signature or uploaded PDF, with version |
| FP-4 | Update the mandate | Built | Mandate: a material change starts re-review |
| FP-5 | Browse teasers | Built | Directory, once verified |
| FP-6 | Express interest | Built | Directory |
| FP-7 | Review an introduction | Built | Introductions: brief, profile, watermarked preview, access logged on opening |
| FP-8 | Accept or decline | Built | Introductions |
| FP-9 | Confirm or move a meeting | Built | Meetings |
| FP-10 | Report deal progress | Built | Deals: update with commitment or disbursement evidence |

**Totals.** 59 built, 3 partial (DA-7, DO-9, DO-11), 1 not built (DA-4). Every use case is reachable from the home page personas.

## The PRD's acceptance criteria

| # | Criterion | Status | Notes |
| --- | --- | --- | --- |
| 1 | Each application type can be completed on web, Android and iOS | Simulated | Web only, checked at 375 wide for the phone; no native apps |
| 2 | Applications get reference numbers and applicants can see their status | Built | `CA3-CS-…` and `CA3-FP-…`; status page per applicant |
| 3 | Reviewers can request information and record authorised decisions | Built | Only staff allowed to decide can; a second decider where the rules ask for one |
| 4 | Unapproved applicants cannot access private profiles, matches or documents | Built | One visibility rule decides every view; portal tabs follow it |
| 5 | The team can find and review possible matches before sending introductions | Built | Matching, then the match page with brief |
| 6 | Introductions record each party's response and require both acceptances before scheduling | Built | The reducer refuses a meeting without both |
| 7 | No double-booking of a room, table or participant; a 50-request concurrency test books no clashes | Built | Settings, Checks runs three 50-request bursts; the invariant check finds no clash |
| 8 | Attendance, outcomes and follow-up actions recorded, including offline with no duplicates on sync | Simulated | Offline is a toggle; dedupe by client id and conflicts for the lead are real |
| 9 | Reports separate applicants, approved participants, meetings, active opportunities, commitments and funds received | Built | Reports tabs; conversion values counted at their stage, never summed |
| 10 | Access restrictions, activity history, backup and recovery are tested | Partial | Restrictions and history tested; no backup or recovery |
| 11 | Consent and access restrictions verified for profile sharing and confidential documents | Built | Flow 6 in the test report |
| 12 | Administrators can enforce deadlines and meeting rules on all channels | Simulated | Rules live in the reducer, so every screen obeys them; there is one channel |
| 13 | Capacity tests and a service-interruption rehearsal pass against the approved targets | Not built | The outage is rehearsed with the offline toggle; no capacity test |
| 14 | Both apps are available through the agreed distribution method before 11 Jan 2027 | Not built | No apps |
| 15 | Technical documentation, deployment access, admin training and summit support are handed over | Not built | This repository's docs only |

## Simulated or not built, across the module

- **Channels.** No Flutter apps, no real email, SMS or push: messages land in Notifications with their subject and link. No French.
- **Files.** Documents keep their metadata only; previews and downloads are stand-ins.
- **Sign-in.** A fixed one-time code for participants and a staff switcher in the rail; no MFA in practice.
- **Infrastructure.** No backup, recovery, capacity test, alerting or handover.
- **Time.** The demo clock replaces the wall clock; the seeded opportunities play a fixed timeline as it passes May and August.
- **Payments.** The participation fee is simulated: no M-Pesa or card gateway is called, and the reference is made up.
