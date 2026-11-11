# ExcursiaConnect Deal Room — Stakeholders and Use Cases

Nov 6, 2026 · David Muia · updated Nov 11, 2026: commercial or strategic partners are a role of their own (CP)

## Stakeholders at a glance

Seven working roles act inside a Deal Room, plus the public visitor before they apply. Algotech enables and supports; the organiser's Deal Room team decides; participants apply, accept and meet. Use case IDs are prefixed by role (DA, DL, DR, DO, CS, FP, CP) and each names the PRD section and release cut that delivers it.

Participants register through four pathways: capital seeker, capital provider (FP), commercial or strategic partner (CP), and institutional challenge. A challenge is verified like a provider and matched with businesses that could solve it; it has no use cases of its own here (see the Vis a Vis gaps paper).

| Stakeholder | Who | What they want from the Deal Room | Can do | Cannot do |
| --- | --- | --- | --- | --- |
| Platform admin (Algotech) | Algotech operations, support, technical administrator | Deal Room enabled and priced correctly; users supported; platform healthy through summit week | Enable the module, set the add-on, manage staff access, view audit logs, restore service | See seeker documents unless granted for support, with the access logged |
| Deal Room lead | Bouer's Deal Room head | Hit 150 / 60 / 200 and prove conversion; every decision defensible | Configure missions, rubrics, rules; approve participants; approve matches; see all reports and conversion values | Change a recorded decision; open documents without consent |
| Deal Room reviewer | Bouer analysts | A clear queue, consistent criteria, evidence at hand | Review and score, request information, recommend or decide (if authorised), propose and approve matches, send introductions | Configure rules; see conversion values |
| Operations team | Summit Deal Room desk and room staff | A schedule that holds; quick capture on the day | Schedule meetings, manage rooms, check in, record attendance and outcomes, run the daily report | Approve participants or matches |
| Capital seeker | Business or project sponsor seeking capital | Meet the right, decided investors; control who sees what | Apply, respond to requests, complete profile, consent to sharing, accept introductions, confirm meetings, see own access log | See other participants' records |
| Finance provider (capital provider) | Angel investor, venture capital, private equity, fund, DFI, bank | Only qualified, ready opportunities that fit the mandate | Apply, describe mandate, sign NDA, browse teasers, express interest, accept introductions, confirm meetings, update deal status | See documents without seeker consent; book a meeting without an accepted introduction |
| Commercial or strategic partner | Corporate buyer, distributor or channel partner, technology partner, regional operator, ecosystem partner | Qualified suppliers, solutions, distribution and market-entry partners that fit their requirements | Apply, describe requirements (sectors, pathways, contract range), sign NDA, browse teasers, express interest, accept introductions, confirm meetings, host supplier discovery or market-entry sessions, update deal status | See documents without seeker consent; book a meeting without an accepted introduction |
| Public visitor | Anyone | Understand the Deal Room and whether to apply | Read the page, run the eligibility check, start an application | Anything behind sign-in |

## Platform admin (Algotech)

Algotech switches the module on, keeps access correct and keeps the service up; it does not take part in deal decisions.

| ID | Use case | Trigger | Outcome | PRD section | Cut |
| --- | --- | --- | --- | --- | --- |
| DA-1 | Enable the Deal Room for an event | Event approved with Deal Room add-on | Module on; add-on price and desk staffing on the approval record | Module activation | 1 |
| DA-2 | Provision Deal Room staff | Lead sends the staff list | Lead, reviewer and operations accounts with MFA, scoped to the event | Module activation | 1 |
| DA-3 | Change or remove access | A person's role changes or they leave | Access updated or revoked at once; change logged **[Bouer UC-12]** | Confidentiality | 1 |
| DA-4 | Publish the apps | MVP passes testing | Android and iOS builds submitted by 4 Jan; fallback internal track ready | Non-functional | 1 |
| DA-5 | Support a participant | Ticket from a user | Issue resolved; any document access for support is granted by the lead and logged | Confidentiality | 1 |
| DA-6 | Declare the summit live window | Summit week begins | 99.95% availability target, on-call rota and alerts active | Non-functional | 2 |
| DA-7 | Restore after an interruption | Outage during summit | Service restored; offline outcomes synced without duplicates; incident report to the lead **[Bouer UC-16]** | Non-functional | 2 |
| DA-8 | Archive the Deal Room | Conversion end date passes | Records read-only; export delivered; documents scheduled for deletion | Confidentiality | 3 |

## Deal Room lead

The lead owns the rules, the decisions that matter and the numbers Bouer reports.

| ID | Use case | Trigger | Outcome | PRD section | Cut |
| --- | --- | --- | --- | --- | --- |
| DL-1 | Configure the Deal Room | Module enabled | Missions, sources, counterparty types, forms, rubrics, matching fields set; public page live | Module activation | 1 |
| DL-2 | Set deadlines and meeting rules | Before onboarding | Windows, caps, durations, buffers applied on all channels **[Bouer UC-14]** | Notifications, rules | 1 |
| DL-3 | Import the mobilisation pipeline | Leads gathered in Dec | Leads imported with mission, source, owner; invitations sent | Applications | 1 |
| DL-4 | Assign and rebalance the review queue | Queue builds up | Each application has a reviewer; workload visible | Qualification | 1 |
| DL-5 | Approve or decline an applicant | Reviewer recommendation | Decision with reason, conditions, decider and time; applicant notified **[Bouer UC-04]** | Qualification | 1 |
| DL-6 | Record an exception | A rule must be bent | Exception logged with staff member and reason | Notifications, rules | 1 |
| DL-7 | Oversee matching | Matching window opens | Prioritised match list per mission; approvals for exclusion or ticket misses | Matching | 2 |
| DL-8 | Watch progress against targets | Any time | Dashboard of 150 / 60 / 200 and conversion vs deadlines | Reporting | 1 |
| DL-9 | Read the daily summit report | Each evening of summit week | Meetings held, no-shows, outcomes, next actions, room use | Meetings | 2 |
| DL-10 | Run the monthly conversion review | Monthly to 18 Sep 2027 | Every open opportunity reviewed and marked; stalled ones reassigned | Conversion | 3 |
| DL-11 | Grant support access | Algotech needs to see a record | Time-limited access granted and logged | Confidentiality | 1 |
| DL-12 | Export the post-summit pack | Summit ends and at close | One row per opportunity with stage dates and outcome values | Reporting | 3 |

## Deal Room reviewer

Reviewers turn applications into evidence-backed decisions and turn ready profiles into introductions.

| ID | Use case | Trigger | Outcome | PRD section | Cut |
| --- | --- | --- | --- | --- | --- |
| DR-1 | Review an application | Application in queue | Eligibility checked; criteria scored with linked documents **[Bouer UC-03]** | Qualification | 1 |
| DR-2 | Request information | Gap or unclear answer | Questions and documents listed; applicant notified; status Information requested **[Bouer UC-05]** | Qualification | 1 |
| DR-3 | Recommend or record a decision | Assessment complete | Recommendation, or a decision if authorised, with reason and conditions | Qualification | 1 |
| DR-4 | Verify a finance provider | Provider applies | Mandate reviewed, KYC items checked, NDA confirmed; status Verified | Qualification | 1 |
| DR-5 | Re-review a changed profile | Participant changes ask or mandate | Record re-assessed; status kept until a new decision | Qualification | 1 |
| DR-6 | Set readiness | Conditions met, scores entered | Seeker marked Deal Room Ready (or In preparation) | Qualification | 2 |
| DR-7 | Find and approve a match | Ready seekers and verified providers | Fit summary reviewed; pair approved, rejected or deferred with note **[Bouer UC-07]** | Matching | 2 |
| DR-8 | Prepare a brief | Match approved | One-page brief and agenda, decision-makers named | Matching | 2 |
| DR-9 | Send an introduction | Brief ready | Shared items chosen within seeker consent; both parties invited to accept **[Bouer UC-08]** | Matching | 2 |
| DR-10 | Handle an expression of interest | Provider flags a teaser | Suggestion assessed and turned into a match or declined | Matching | 2 |

## Operations team

Operations turns accepted introductions into a schedule that holds, and captures what happened in each meeting.

| ID | Use case | Trigger | Outcome | PRD section | Cut |
| --- | --- | --- | --- | --- | --- |
| DO-1 | Set up Deal Room rooms and tables | Venue plan agreed | Rooms, tables, capacity and windows defined | Module activation | 2 |
| DO-2 | Schedule a meeting | Match Ready to schedule | Slot and room proposed; conflicts refused with reason **[Bouer UC-09]** | Meetings | 2 |
| DO-3 | Auto-propose a schedule | Many matches ready | Full draft schedule inside rules; each slot sent for confirmation | Meetings | 2 |
| DO-4 | Handle a change request | Participant asks to move | Alternatives offered; both re-confirm; confirmed meetings undisturbed | Meetings | 2 |
| DO-5 | Override a cap | Lead asks for an extra meeting | Meeting booked with logged reason | Meetings | 2 |
| DO-6 | Export schedules | Before summit and daily | PDF and Excel per room, day and participant; printed backup | Meetings | 2 |
| DO-7 | Check participants in | Arrival at the Deal Room desk | Badge scanned; arrival recorded against the day's meetings | Meetings | 2 |
| DO-8 | Run the live board | Summit day | Status per room and slot; late and no-show flagged | Meetings | 2 |
| DO-9 | Record attendance and outcome | Meeting ends | Held, cancelled, rescheduled or no-show; outcome, next action, owner, due date **[Bouer UC-10]** | Meetings | 2 |
| DO-10 | Refill a no-show slot | Counterparty missing | Slot offered to the next ready match for the present participant | Meetings | 2 |
| DO-11 | Work through an outage | Platform unavailable | Printed schedule used; outcomes captured offline or on paper and entered after, without duplicates **[Bouer UC-16]** | Non-functional | 2 |

## Capital seeker

A seeker should be able to go from application to a confirmed meeting with a decided investor without email back-and-forth, and always know who has seen their information.

| ID | Use case | Trigger | Outcome | PRD section | Cut |
| --- | --- | --- | --- | --- | --- |
| CS-1 | Check eligibility | Visits the Deal Room page | Self-check result and the criteria explained | Applications | 1 |
| CS-2 | Apply as a capital seeker | Eligible | Form and documents submitted; reference number and confirmation **[Bouer UC-01]** | Applications | 1 |
| CS-3 | Resume a draft on another device | Started on phone, continues on web | Draft restored from the server, nothing lost | Applications | 1 |
| CS-4 | Track application status | Any time | Status, last change date and any open request shown | Applications | 1 |
| CS-5 | Respond to a request for information | Notification received | Answers and documents submitted; back in queue **[Bouer UC-05]** | Qualification | 1 |
| CS-6 | Receive a decision | Decision recorded | Approval, conditions, waitlist or decline with reason | Qualification | 1 |
| CS-7 | Complete the matching profile | Approved | Profile fields and teaser completed by the deadline **[Bouer UC-06]** | Qualification | 1 |
| CS-8 | Set sharing consent | Introduction pending | Chooses which documents the named provider may see **[Bouer UC-15]** | Confidentiality | 2 |
| CS-9 | Accept or decline an introduction | Introduction received | Response recorded; match schedulable if both accept | Matching | 2 |
| CS-10 | Confirm or move a meeting | Slot proposed | Meeting confirmed with room or link, .ics and reminders | Meetings | 2 |
| CS-11 | See who opened my file | Any time after introductions | Access log by provider, item and time | Confidentiality | 2 |
| CS-12 | Update deal progress | Owner asks for status | Update attached to the opportunity | Conversion | 3 |

## Finance provider

A provider should only spend time on qualified, ready opportunities inside its mandate, and should get them as a short list with briefs, not a flood of requests.

| ID | Use case | Trigger | Outcome | PRD section | Cut |
| --- | --- | --- | --- | --- | --- |
| FP-1 | Apply as a finance provider | Invitation or public page | Organisation, mandate and decision-maker submitted; reference number **[Bouer UC-02]** | Applications | 1 |
| FP-2 | Complete verification | Application received | KYC items uploaded; status Verification pending | Qualification | 1 |
| FP-3 | Sign the NDA | Verification in progress | One NDA for all event opportunities, version and signatory stored | Qualification | 1 |
| FP-4 | Update the mandate | Strategy changes | Mandate updated; record sent for re-review where material | Qualification | 1 |
| FP-5 | Browse teasers | Verified | Deal Room directory filtered by sector, country, ask, instrument | Confidentiality | 2 |
| FP-6 | Express interest | A teaser fits | Interest sent to the reviewer queue | Matching | 2 |
| FP-7 | Review an introduction | Introduction received | Brief, full profile and consented documents viewable; access logged | Matching | 2 |
| FP-8 | Accept or decline | Introduction open | Response recorded with optional reason | Matching | 2 |
| FP-9 | Confirm or move a meeting | Slot proposed | Meeting confirmed inside the provider's cap | Meetings | 2 |
| FP-10 | Report deal progress | Monthly request or own update | Status update, and commitment or disbursement evidence uploaded | Conversion | 3 |

## Commercial or strategic partner

A partner buys, distributes or partners rather than invests: corporates and procurement teams looking for suppliers and solutions, distributors and regional operators looking for products to carry, technology partners and ecosystem partners looking for collaborators. It is verified exactly like a finance provider (KYC pack, sanctions screening, one NDA, a confirmed decision-maker) and sits on the same side of every match, but its mandate is a set of requirements with a contract size, not a ticket.

| ID | Use case | Trigger | Outcome | PRD section | Cut |
| --- | --- | --- | --- | --- | --- |
| CP-1 | Apply as a commercial or strategic partner | Public page pathway 3, or an invitation | Organisation type, requirements (sectors, countries, stages, pathways, contract range, exclusions) and decision-maker submitted; reference number | Applications | 1 |
| CP-2 | Complete verification and sign the NDA | Application received | KYC items uploaded, sanctions screened, one NDA signed; verified as FP-2 and FP-3 | Qualification | 1 |
| CP-3 | Browse teasers and express interest | Verified | Directory of Deal Room Ready teasers; interest sent to the reviewer queue | Matching | 2 |
| CP-4 | Accept an introduction and meet | Introduction received | Brief and consented documents viewable; acceptance recorded; meeting confirmed inside the partner's cap | Meetings | 2 |
| CP-5 | Host supplier discovery or a market-entry session | The team schedules the session | The partner named as host of a corporate procurement and supplier discovery, or market-entry and cross-border partnership, session | Sessions | 2 |
| CP-6 | Report deal progress | Monthly request or own update | Status update, with a purchase order or contract, or a pilot or partnership agreement, as evidence | Conversion | 3 |

## Use case index

There are 69 use cases across seven roles. 31 of them land in Cut 1, which is what the 11 January onboarding gate needs.

| Stakeholder | Cut 1 Onboarding | Cut 2 Matching and meetings | Cut 3 Conversion | Total |
| --- | --- | --- | --- | --- |
| Platform admin (DA) | 5 | 2 | 1 | 8 |
| Deal Room lead (DL) | 8 | 2 | 2 | 12 |
| Deal Room reviewer (DR) | 5 | 5 | 0 | 10 |
| Operations team (DO) | 0 | 11 | 0 | 11 |
| Capital seeker (CS) | 7 | 4 | 1 | 12 |
| Finance provider (FP) | 4 | 5 | 1 | 10 |
| Commercial or strategic partner (CP) | 2 | 3 | 1 | 6 |
| Total | 31 | 32 | 6 | 69 |

Cut 1 covers everything from the public page to an approved, verified participant. Cut 2 has to be complete by the 19 February freeze, because matching starts on 1 February and meetings are confirmed from 22 February. Cut 3 is small, but it must be live by 19 March, when post-summit tracking begins.
