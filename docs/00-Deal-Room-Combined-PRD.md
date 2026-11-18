# ExcursiaConnect Deal Room: the combined PRD

11 November 2026 · David Muia

This is the Deal Room's requirements, processes and use cases in one document. It brings together:

| Source | What it gave this document |
| --- | --- |
| [01-Deal-Room-PRD.md](01-Deal-Room-PRD.md) (6 Nov 2026) | The requirements, rules, tiers, reports, non-functional targets and data model |
| [02-Deal-Room-Stakeholders-and-Use-Cases.md](02-Deal-Room-Stakeholders-and-Use-Cases.md) (6 Nov 2026) | The roles and the 63 use cases, kept under their IDs |
| [03-Deal-Room-User-Flows.md](03-Deal-Room-User-Flows.md) (6 Nov 2026) | The seven flows, now written into the process for each stage |
| The Vis a Vis decision paper, *Connected Africa 3.0, The Deal Room, Agenda 1* | The dates, the vocabulary, the participants, the formats, the governance ([deal-room-vis-a-vis-gaps.md](deal-room-vis-a-vis-gaps.md) lists every change) |

**Where the paper and the 6 Nov documents disagree, the paper wins.** Each such change is marked **[Paper]**, and Bouer's requirements are still marked **[Bouer]**.

What the prototype covers is in [deal-room-coverage.md](deal-room-coverage.md). How the backend is built and when is in [backend-plan.md](backend-plan.md). The market background is in [04-Deal-Room-Research.md](04-Deal-Room-Research.md).

## 1. Overview

The Deal Room is an ExcursiaConnect module, switched on per event. It connects people who bring an opportunity with the capital providers, buyers and partners who can act on it, before and during a summit. It:
- qualifies both sides against written criteria
- introduces them only when both are ready and both accept
- runs timed one-to-one meetings and programmed sessions
- tracks each opportunity to an evidenced outcome

It reuses ExcursiaConnect's registration, roles, rooms, badges, scanning, payments, notifications and reporting. It adds qualification, matching, consent tiers, sessions and one deal pipeline.

**The first event:** the Connected Africa 3.0 Deal Room, at the summit of **15 to 18 February 2027** (Monday to Thursday) **[Paper]**.

**The problem.** Summit deal rooms today run on application forms, spreadsheets and email:
- Investors get unqualified meeting requests.
- Confidential documents travel without a record.
- Rooms double-book.
- Six months later, nobody can show which meetings turned into money.

**Wider than capital-raising [Paper].** The Deal Room carries eight transaction pathways, not only investment: procurement, government challenges, pilots, partnerships and market access sit beside equity and debt.

### Who does what

| Party | Role in the Deal Room |
| --- | --- |
| **Momentum** | Owns the Deal Room. Oversees it, read-only, in the platform **[Paper]** |
| **Bouer** | Sources and qualifies participants: the lead and the reviewers **[Paper]** |
| **Excursia Connect** | Coordinates matchmaking, meetings and sessions, on-site delivery, and monitoring and evaluation: coordinators and operations **[Paper]** |
| **Oxygen** | Builds, as the paper names it |
| **Algotech** | Runs the ExcursiaConnect platform. Switches the module on, provisions staff, keeps the service up. Takes no part in deal decisions |

### Goals and targets

| Outcome | Target | Deadline |
| --- | --- | --- |
| Qualified counterparties across the three missions | 150 | 3 Jan 2027 |
| Deal Room Ready opportunities, both sides confirmed | 60 | 23 Jan 2027 |
| Booked Deal Room meetings | 200 | Summit week, 15 to 18 Feb 2027 |
| Conversion tracked, reviewed monthly | Every opportunity | 21 Aug 2027, if contracted (see §13) |

The deadlines are the 6 Nov targets moved 28 days earlier with the summit **[Paper]**, as the prototype's dashboard shows them.

**Product goals behind the targets:**
- Every qualification, readiness score and match decision is recorded with who made it, when, and the evidence it rests on.
- No meeting exists unless both parties accepted the introduction. No room, table or person is ever double-booked, by a meeting or a session.
- No confidential document is opened without a recorded consent and an access log entry.
- Commitments are reported in five separate tiers, so conversion figures cannot be inflated.

### Non-goals

- Matching or introductions without a person approving them.
- Negotiation, term sheets or e-signature inside the platform.
- Holding or moving investment funds. The platform records evidence of funds deployed only.
- A public marketplace open to unverified investors.
- A Deal Room outside a hosted event (an always-on deal-flow platform).
- Hosting video. Online meetings use external links.

### Key dates

| Date | What happens |
| --- | --- |
| 15 Dec 2026 | Onboarding launches: applications open **[Paper]** |
| 3 Jan 2027 | Target: 150 qualified counterparties |
| 22 Jan 2027 | Design freeze: rubric, matching fields and missions locked |
| 23 Jan 2027 | Target: 60 opportunities Deal Room Ready on both sides |
| 15 to 18 Feb 2027 | The summit; four days, each with an emphasis and a close-out **[Paper]** |
| 21 Aug 2027 | Conversion tracking ends (six months), if it is contracted |

## 2. The paper's vocabulary

These lists are configured per event. The values below are Connected Africa 3.0's, from the paper **[Paper]**.

**Three missions:**
- **M1** State capability and public service delivery
- **M2** Enterprise growth, fintech and capital
- **M3** Digital trade and market integration

**Six strategic tracks,** each under one mission:

| Track | Mission |
| --- | --- |
| T1 Transformation that works for people | M1 |
| T2 Digital public infrastructure and trusted government | M1 |
| T3 AI, software and enterprise innovation | M2 |
| T4 Talent, jobs and enterprise growth | M2 |
| T5 Interoperable infrastructure | M3 |
| T6 Digital trade and market access | M3 |

**19 sectors,** each on one track:
- Data centres and cloud
- Telecoms and connectivity
- AI and deep tech
- Cybersecurity and digital trust
- Fintech and digital banking
- E-commerce and digital trade
- Logistics and mobility tech
- Enterprise tech and SaaS
- Agritech and food tech
- Health tech and biotech
- Energy tech and climate innovation
- Smart cities and urban tech
- Edtech and future of work
- Aerospace, satellite and space tech
- Advanced manufacturing and Industry 4.0
- Creative economy and digital media
- DPI and GovTech
- Mining, natural resources and industrial tech
- Tourism tech and hospitality

**Participants:**
- **Opportunity owners**, the capital seeker side: startup or scale-up, established enterprise, technology provider, project sponsor.
- **Counterparties**, the provider side, in ten kinds:
  - **Capital providers:** angel investor, venture capital, private equity, fund, DFI, bank.
  - **Commercial counterparties:** corporate buyer, distributor or channel partner.
  - **Public and ecosystem institutions:** public institution, ecosystem partner.

**Eight transaction pathways,** which replace the 6 Nov list of instruments:
- equity
- debt and credit
- development and blended finance
- procurement and contracts
- strategic partnerships
- project development
- market access
- pilots and deployment

**Four intake routes:**
- Bouer's sourcing (import and invitation)
- an open application
- a challenge submission by a public institution or corporate buyer
- separate counterparty registration

**Four qualification outcomes:** Qualified, Conditional, Referred (to another programme or partner), Declined. Each carries a reason.

**One pipeline in 13 statuses:**
1. Sourced
2. Registered
3. Under review
4. Qualified
5. Match proposed
6. Meeting confirmed
7. Meeting completed
8. Follow-up active
9. Due diligence / evaluation
10. Terms / proposal
11. Committed
12. Closed / deployed
13. On hold / inactive / declined

Each change of status is dated, owned and evidenced.

**Seven meeting outcomes:**
- no fit
- information requested
- follow-up meeting
- due diligence
- pilot or procurement
- financing or partnership proposal
- commitment documented

**Five commitment tiers,** always reported apart:
- expression of interest
- indicative commitment
- signed commitment
- approved, not disbursed
- deployed

**Twelve activity formats:** the curated one-to-one meeting, plus eleven session formats:
- investment opportunity presentation
- reverse pitch or mandate briefing
- corporate procurement and supplier discovery
- government challenge session
- project finance presentation
- VC, PE and growth-capital clinic
- DFI and blended-finance roundtable
- technology deployment and pilot meeting
- market-entry and cross-border partnership
- deal advisory and readiness clinic
- negotiation and deal progression

## 3. Stakeholders

Nine roles act in a Deal Room, plus the public visitor before they apply. Use case IDs are prefixed by role.

| Stakeholder | Who | What they want | Can do | Cannot do |
| --- | --- | --- | --- | --- |
| Platform admin (DA) | Algotech operations and support | The module on and priced; users supported; the service up through summit week | Enable the module, provision staff, view audit logs, restore service | See seeker documents unless the lead grants support access, which is logged |
| Deal Room lead (DL) | Bouer's Deal Room head | Hit 150 / 60 / 200 and prove conversion; every decision defensible | Configure; assign the queue; decide; waive a fee; approve matches; all reports and conversion values | Change a recorded decision; open documents without consent |
| Reviewer (DR) | Bouer analysts | A clear queue, consistent criteria, evidence at hand | Review and score; request information; recommend, or decide where authorised; set readiness; propose and approve matches; introduce | Configure rules; see conversion values |
| Coordinator (DC) **[Paper]** | Excursia Connect | Matches that turn into meetings; a programme that runs; numbers for M&E | Propose and approve matches; introduce; schedule meetings and sessions; override a cap; run the live board; record outcomes; keep the pipeline; export | Qualify, decide or set readiness |
| Operations (DO) | Excursia Connect's desk and room staff | A schedule that holds; quick capture on the day | Schedule; manage rooms; check in; run the live board; record attendance and outcomes | Qualify participants or approve matches |
| Oversight (DV) **[Paper]** | Momentum | See progress, the pipeline and the reports without asking | Read the dashboard, the pipeline and every report; export | Open files; take any action |
| Capital seeker (CS) | An opportunity owner | Meet the right, decided counterparties; control who sees what | Apply; answer requests; pay the fee; complete the profile; consent to sharing; accept introductions and invitations; confirm meetings; see the access log | See other participants' records |
| Counterparty (FP) | Capital provider or commercial counterparty | Only qualified, ready opportunities inside the mandate | Register; describe the mandate; sign the NDA; browse teasers; express interest; accept introductions and invitations; confirm meetings; report progress | See documents without the seeker's consent; book a meeting without an accepted introduction |
| Challenge owner (CH) **[Paper]** | A public institution or corporate buyer with a problem to solve | Solutions that fit its constraints, budget and procurement route | Submit a challenge; verify like any counterparty; host a challenge session; accept introductions | The same limits as a counterparty |
| Public visitor | Anyone | Understand the Deal Room and whether to apply | Read the page, run the eligibility check, start an application | Anything behind sign-in |

**The decide right.** The lead always holds it. A reviewer holds it only where the lead marks them as a decider.

**MFA** is required for the lead, the reviewers, the coordinators and the admin.

## 4. The process, end to end

```
 Set up ─► Mobilise and apply ─► Qualify ─► Fee or verification ─► Readiness ─► Match ─► Introduce (consent)
                                   ▲  │
                                   └──┘ information requested
                                                                                             │
 After the summit ◄── Outcome, next action ◄── Meeting or session on the day ◄── Schedule ◄──┘
```

Each stage below gives the process, its requirements and the use cases it delivers. The Cut column says which release delivers the use case (§12).

### 4.1 Set up the Deal Room

The platform admin switches the Deal Room on for an approved event and records the add-on price and any desk staffing. The lead then configures it before applications open.

**Requirements:**
1. The platform admin switches the module on at event approval. The add-on price and desk staffing go on the approval record.
2. The lead defines:
   - the **missions** and **strategic tracks**
   - the **sectors**, each on one track
   - the **sources** (referral, partner, outreach campaign, inbound, mission team)
   - the **counterparty kinds** **[Paper]**

   Every application carries one mission, one track, one source and one owner.
3. The lead configures, for each side:
   - one **application form**, with the platform's form builder; Deal Room documents up to 25 MB
   - one **qualification rubric**
   - the **matching fields**: each is mandatory or advisory
4. The lead sets the **rules** (§5), the **participation fee** (§4.4) and the **design freeze date**.
5. The lead lists **rooms and tables** for meetings, and **session rooms** (presentation area, roundtable room), each with capacity and hours. Online meetings are allowed per event setting.
6. The lead invites staff as lead, reviewer, coordinator, operations or oversight, each tagged with who they work for (Bouer, Excursia Connect, Momentum).
7. The public Deal Room page is generated from the configuration and branded as the organiser's: eligibility, how it works, the apply buttons and the FAQ. It is live only while the event is Live.
8. **After the freeze date,** structural fields (rubric criteria, matching fields, missions) change only with the lead's approval, and each change is logged.

| ID | Use case | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- |
| DA-1 | Enable the Deal Room for an event | Event approved with the add-on | Module on; price and desk staffing on the approval record | 1 |
| DA-2 | Provision Deal Room staff | Lead sends the staff list | Accounts with MFA, scoped to the event and role | 1 |
| DL-1 | Configure the Deal Room | Module enabled | Missions, tracks, sectors, sources, kinds, forms, rubrics, matching fields set; public page live | 1 |
| DL-2 | Set deadlines, meeting rules and the fee | Before onboarding | Windows, caps, durations, buffers and fee applied on every channel **[Bouer UC-14]** | 1 |
| DO-1 | Set up rooms, tables and session rooms | Venue plan agreed | Rooms, tables, capacity and hours defined | 2 |

### 4.2 Mobilise and apply

People reach the Deal Room by four routes **[Paper]**:
- Bouer imports and invites them.
- An opportunity owner applies openly.
- A counterparty registers.
- A public institution or corporate buyer submits a challenge.

Every route ends in a reference number, a status the applicant can see, and a place in the review queue **[Bouer UC-01, UC-02]**.

**The applicant's process:**
1. **Check eligibility.** The public page shows the criteria for each side and a short self-check: sector, geography, stage and pathway.
2. **Sign in** with email or phone and a one-time code. A password is optional.
3. **Fill in the form for their side.** It saves as a draft on the server, so it resumes on any device **[Bouer §8]**.
4. **Submit.** Submission is blocked until every required field and document is present, and the form names each missing item. Advisory fields are flagged, not blocking.
5. **Get a reference number** (`CA3-CS-00123`, `CA3-FP-00045`) by email and SMS. The application joins the review queue.
6. **Follow the status** on the applicant's page: Submitted, In review, Information requested, Decided, with the date of the last change and any open request.

**What each form asks:**
- **Opportunity owner:**
  - the organisation: legal name, registration number, country, sector, kind, year founded, website
  - the ask: amount and currency, **pathway**, use of funds, stage
  - traction: revenue band, customers, key metrics
  - a named decision-maker
  - mission, track and source
  - documents: pitch deck; financials for two years where available; registration certificate; feasibility and E&S studies where they exist
- **Counterparty:**
  - the organisation and its kind
  - the mandate: sectors, countries, stages, ticket range, **pathways**, exclusions
  - a named decision-maker
  - its typical decision timeline
  - mission, track and source
- **Challenge [Paper]:** a public institution or corporate buyer registers as a counterparty and adds the challenge:
  - title, the problem, and who has it
  - the constraints a solution must respect, and what success looks like
  - the budget range
  - the route: request for proposals, pilot, public-private partnership, direct procurement, innovation challenge, or co-development
  - the timeline and how the decision is made

  The challenge is matched through the same mandate fields as any counterparty.

**Requirements:**
1. **Bulk import:** the lead or a reviewer imports leads and pre-filled applications from CSV, with mission, source and owner. Each imported record gets an invitation link to complete and submit.
2. **Duplicates** are detected on registration number, email and phone within the event, and the lead can merge them.
3. **One organisation, several opportunities** only where the lead allows it. Each opportunity is its own record.

| ID | Use case | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- |
| DL-3 | Import the mobilisation pipeline | Leads gathered | Leads imported with mission, source and owner; invitations sent | 1 |
| CS-1 | Check eligibility | Visits the Deal Room page | Self-check result, with the criteria explained | 1 |
| CS-2 | Apply as an opportunity owner | Eligible | Form and documents submitted; reference number **[Bouer UC-01]** | 1 |
| CS-3 | Resume a draft on another device | Started on one, continues on another | Draft restored from the server | 1 |
| CS-4 | Track application status | Any time | Status, last change and any open request | 1 |
| FP-1 | Register as a counterparty | Invitation or public page | Organisation, mandate and decision-maker submitted; reference number **[Bouer UC-02]** | 1 |
| CH-1 | Submit a challenge **[Paper]** | A public institution or buyer has a problem to solve | Challenge, budget, route and decision process submitted with the mandate; reference number | 1 |

### 4.3 Qualify

Qualification is a scored rubric with evidence per criterion. An opportunity owner carries three separate states: status in the queue, the decision, and readiness (§4.5). Counterparties are verified rather than scored (§4.4).

**The rubric for opportunity owners** (configurable; the defaults below follow the paper's dimensions **[Paper]**, with the weights still Bouer's to confirm):

| Layer | Criteria | Scale |
| --- | --- | --- |
| Eligibility | Sector in scope; active in the mission geography; legally registered; post-revenue or a bankable project; asking for a named pathway | Pass or fail each |
| Assessment | **Relevance** (30), **credibility** (30), **readiness** (20), **counterparty fit** (15), **consent and confidentiality** (5) | 0 to 100 each, weighted |
| Readiness | Bankability; technical readiness; environmental and social; decision-maker named and available; documents complete | 0 to 100 each, plus the readiness state |

**The process:**
1. **Assignment.** The lead assigns the queue and rebalances it. Reviewers filter it by mission, track, side, status and assignee.
2. **Scoring.** The reviewer scores each criterion **against the document it rests on**. A score with no linked document needs a written note.
3. **Information requested.** Where there is a gap, the reviewer lists questions and documents. The applicant is told by email and SMS, and the status becomes *Information requested*. The applicant's answer returns the record to the queue. This can loop as often as needed. After the expiry, the lead applies the event's policy **[Bouer UC-03, UC-05]**.
4. **Recommendation.** A reviewer recommends.
5. **Decision.** A decider records it: **Qualified**, **Conditional** (with listed conditions and due dates), **Referred** (to another programme or partner), or **Declined**. It always carries a reason **[Paper]** **[Bouer UC-04]**. The applicant is told, without private detail.
6. **Second decider.** Every decline needs one, and so does any ask above the threshold the lead sets (USD 10 million in the seed).
7. **Changes after the decision.** A qualified participant completes the matching profile and teaser by the profile deadline **[Bouer UC-06]**. A material change to the ask, the pathway or the mandate sends the record back for re-review, but it keeps its status until a new decision.
8. **History.** Every score, decision and status change is written to the activity history. Entries are never edited, only superseded.

| ID | Use case | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- |
| DL-4 | Assign and rebalance the review queue | Queue builds up | Each application has a reviewer; workload visible | 1 |
| DR-1 | Review an application | Application in the queue | Eligibility checked; criteria scored against linked documents **[Bouer UC-03]** | 1 |
| DR-2 | Request information | A gap or an unclear answer | Questions and documents listed; applicant told; status *Information requested* **[Bouer UC-05]** | 1 |
| CS-5 | Answer a request for information | Notified | Answers and documents submitted; back in the queue | 1 |
| DR-3 | Recommend, or record a decision | Assessment complete | Recommendation, or a decision where authorised, with reason and conditions | 1 |
| DL-5 | Qualify, refer or decline an applicant | Reviewer's recommendation | Qualified, Conditional, Referred or Declined, with reason, decider and time **[Paper]** | 1 |
| CS-6 | Receive the decision | Decision recorded | The outcome, any conditions, and the fee link if qualified | 1 |
| CS-7 | Complete the matching profile | Qualified | Profile and teaser completed by the deadline **[Bouer UC-06]** | 1 |
| DR-5 | Re-review a changed profile | A participant changes the ask or mandate | Re-assessed; status kept until a new decision | 1 |

### 4.4 Participation fee and counterparty verification

The two sides take different paths into matching. An opportunity owner pays a participation fee. A counterparty, including a challenge owner, is verified.

**The participation fee (opportunity owners):**
1. Qualification sends a **payment link for USD 250** with the decision. The amount and currency are set by the lead.
2. One reminder goes out after **3 days** if the fee is unpaid.
3. The owner pays by **M-Pesa or card**. The fee is settled only by the payment provider's confirmation, never by the browser.
4. **The lead may waive** the fee, with a reason, which is logged.
5. **Paying, or the waiver,** issues the participant's badge and opens matching.

The fee comes from this project, not from the paper.

**Counterparty verification:**
1. The counterparty uploads its **KYC pack**: registration, beneficial owners and the signatory's ID. Status: *Verification pending*.
2. It signs **one NDA** covering every opportunity in the event. It signs in the app (typed name, title, time, version) or uploads a signed PDF.
3. The reviewer:
   - checks the mandate against the form
   - ticks off each KYC item
   - enters the sanctions screening result
   - confirms the decision-maker

   Any gap sends it to *Information requested*.
4. **Verified:** the counterparty is told, its badge is issued, and the directory of teasers opens to it.
5. **Later changes:** a material change to the mandate sends it for re-review, and it stays Verified until a new decision.

| ID | Use case | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- |
| CS-13 | Pay the participation fee | Qualified, fee link received | Paid by M-Pesa or card; badge issued; matching opens | 1 |
| DL-13 | Waive a participation fee | A qualified owner should not pay | Fee waived with a logged reason; badge issued | 1 |
| FP-2 | Complete verification | Registration received | KYC items uploaded; *Verification pending* | 1 |
| FP-3 | Sign the NDA | Verification in progress | One NDA for the event, version and signatory stored | 1 |
| DR-4 | Verify a counterparty | KYC and NDA in | Mandate, KYC, sanctions and decision-maker checked; *Verified* | 1 |
| FP-4 | Update the mandate | Strategy changes | Updated; re-review where material | 1 |
| CH-2 | Verify as a challenge owner | Challenge submitted | KYC and NDA as for any counterparty; *Verified* | 1 |

### 4.5 Readiness

Readiness has three states: Not ready, In preparation and Deal Room Ready. A reviewer can mark an owner **Deal Room Ready** only when:
- every readiness score is entered
- the decision-maker is confirmed
- no conditions are open

**The match search takes an owner only when it is qualified, Deal Room Ready, and has its fee paid or waived.**

| ID | Use case | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- |
| DR-6 | Set readiness | Conditions cleared, scores entered | *Deal Room Ready*, or *In preparation* | 2 |

### 4.6 Match and introduce

Matching is rule-based and approved by a person. The system proposes and explains; a reviewer, coordinator or the lead decides; both parties must accept before anything is scheduled **[Bouer UC-07, UC-08]**.

**The process:**
1. **Search.** The match search runs over Deal Room Ready owners and Verified counterparties only. It uses the matching fields: sector, country, stage, ticket (the ask inside the counterparty's range), pathway and exclusions.
2. **Fit summary.** Each candidate pair shows which criteria it meets and misses, and any exclusion hit. Nothing is hidden.
   - Candidates are ordered by criteria met and readiness score. The ordering rule is shown on screen and set by the lead.
   - A miss on ticket size or an exclusion needs a written note to approve.
3. **Decide each pair.** A person approves, rejects or defers each pair, with a note. The system never matches on its own, and says "no suitable match" rather than forcing one.
4. **Brief.** An approved match carries its rationale and a one-page brief built from both profiles. The brief is editable before sending, and names both decision-makers **[Bouer 7A-D]**.
5. **Introduce.** The sender chooses what goes with the introduction: the teaser only, or the teaser plus documents. Documents go only within the owner's consent (§6).
6. **Both accept.** Each party accepts or declines, in the app or from the email link. A decline may carry a reason. The match becomes *Ready to schedule* only when both have accepted.
7. **Expiry.** An introduction expires after 5 days. Declined, rejected and expired pairs are recorded, and are not proposed again without the lead's override.
8. **Expressions of interest.** A counterparty browsing teasers can express interest. This puts a suggestion in the matching queue; it does not introduce anyone.
9. **The lead's view.** The lead sees a prioritised match list for each mission, with counts at each step, exportable with the briefs.

| ID | Use case | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- |
| DL-7 | Oversee matching | Matching opens | Prioritised list per mission; approvals of exclusion or ticket misses | 2 |
| DR-7 | Find and approve a match | Ready owners and verified counterparties | Fit reviewed; pair approved, rejected or deferred with a note **[Bouer UC-07]** | 2 |
| DC-1 | Propose and approve matches **[Paper]** | Matching window open | As DR-7, by Excursia's coordinator | 2 |
| DR-8 | Prepare a brief | Match approved | One-page brief; decision-makers named | 2 |
| DR-9 | Send an introduction | Brief ready | Items chosen within consent; both invited to accept **[Bouer UC-08]** | 2 |
| DC-2 | Send introductions **[Paper]** | Brief ready | As DR-9, by the coordinator | 2 |
| DR-10 | Handle an expression of interest | A counterparty flags a teaser | Turned into a match, or declined | 2 |
| FP-5 | Browse teasers | Verified | Directory filtered by sector, country, ask and pathway | 2 |
| FP-6 | Express interest | A teaser fits | Suggestion in the matching queue | 2 |
| CS-8 | Set sharing consent | Introduction pending | Chooses which documents the named counterparty may see **[Bouer UC-15]** | 2 |
| CS-9 | Accept or decline an introduction | Introduction received | Response recorded; schedulable once both accept | 2 |
| FP-7 | Review an introduction | Introduction received | Brief, full profile and consented documents; every opening logged | 2 |
| FP-8 | Accept or decline | Introduction open | Response recorded, with an optional reason | 2 |
| CH-3 | Meet proposed solutions | Matched as a challenge owner | Accepts or declines introductions; meets as any counterparty | 2 |

### 4.7 Schedule meetings and sessions

**A meeting** is a one-to-one for an accepted match, in a room and at a table or by an online link, in a timed slot. **A session** is one of the eleven programmed formats **[Paper]**. It has:
- a host (an owner pitching, a counterparty briefing, an institution presenting its challenge)
- a session room and a track
- invited participants, who accept or decline

**The system never lets a room, a table or a person be in two places at once.** That holds across meetings and sessions.

**Meetings:**
1. **Propose.** A coordinator or operations proposes a slot and room for a *Ready to schedule* match. The system checks the room, the table, and both participants' meetings and sessions, and refuses a clash with the reason.
2. **Caps.** It also checks the caps: an owner may have at most 5 meetings per event, and a counterparty its daily cap (6 in the seed). Operations or a coordinator can override a cap, with a logged reason.
3. **Confirm.** Both parties confirm or ask for a change within 48 hours, or the slot is released.
4. **On confirmation** each party gets the room or link, an email and SMS, an .ics invite, and reminders 24 hours and 30 minutes before.
5. **Auto-propose.** For many matches at once, the system drafts a full schedule inside the rules. Every slot still needs both confirmations.
6. **Changes.** A reschedule needs both to confirm again. A room change inside the same slot does not. Bulk actions never move a confirmed meeting **[Bouer §10]**.
7. **Exports.** Schedules export per room, per day and per participant (PDF and Excel) for the printed backup **[Bouer UC-16]**.

**Sessions [Paper]:**
1. A coordinator plans the session: format, title, time, room, host, track and the staff member who runs it.
2. Invitations go to the chosen participants, who accept or decline.
3. The session's time is checked against every invitee's meetings, and against the room.
4. A session can be cancelled with a reason. Invitees are told.

| ID | Use case | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- |
| DO-2 | Schedule a meeting | Match *Ready to schedule* | Slot and room proposed; clashes refused with the reason **[Bouer UC-09]** | 2 |
| DO-3 | Auto-propose a schedule | Many matches ready | Draft schedule inside the rules; each slot sent to confirm | 2 |
| DO-4 | Handle a change request | A participant asks to move | Alternatives offered; both confirm again; confirmed meetings undisturbed | 2 |
| DO-5 | Override a cap | The lead asks for an extra meeting | Booked, with a logged reason | 2 |
| DO-6 | Export schedules | Before the summit and daily | PDF and Excel per room, day and participant | 2 |
| DC-3 | Plan a session **[Paper]** | Programme agreed | Format, host, room, track and owner set; no clash with any invitee | 2 |
| DC-4 | Invite participants to a session **[Paper]** | Session planned | Invitations sent; answers tracked | 2 |
| CS-10 | Confirm or move a meeting | Slot proposed | Confirmed with room or link, .ics and reminders | 2 |
| FP-9 | Confirm or move a meeting | Slot proposed | Confirmed inside the counterparty's cap | 2 |
| CS-14 | Answer a session invitation **[Paper]** | Invited to present, pitch or attend | Accepted or declined | 2 |
| FP-11 | Answer a session invitation **[Paper]** | Invited to a briefing, clinic or roundtable | Accepted or declined | 2 |
| CH-4 | Host a government challenge session **[Paper]** | Challenge verified | The challenge presented to invited solution providers | 2 |

### 4.8 The summit days

Every confirmed meeting ends with an attendance status and an outcome. Every session ends with attendance and an outcome for each participant. **Every outcome with a next action becomes an opportunity with an owner.** The summit runs four days, each with an emphasis and a close-out **[Paper]**:

| Day | Emphasis | The close-out confirms |
| --- | --- | --- |
| Mon 15 Feb | Open the market; activate business engagement from day one | Attendance confirmed; outcomes captured; urgent follow-ups and pipeline gaps identified |
| Tue 16 Feb | Startup and enterprise pitching linked to capital and commercial counterparties | Investor feedback captured; information requests logged; follow-ups and readiness gaps recorded |
| Wed 17 Feb | Deepen sector, financing and market-access engagements | Financing pathways recorded; project-preparation actions owned; pilot owners and partner diligence named |
| Thu 18 Feb | Progress viable opportunities and formalise next steps | Evidence validated; post-summit owners and dates confirmed; 30, 60 and 90-day follow-up set |

**A summit day:**
1. **Morning.** Operations opens the live board and the day's printed schedules, checks rooms and tables against the plan, and reviews the previous evening's late changes.
2. **Check-in.** The participant's ExcursiaConnect badge is scanned at the Deal Room desk. Their arrival counts for all of that day's meetings and sessions, and the board shows who is in.
3. **Ten minutes before each slot,** the board flags any meeting where a party has not checked in, so operations can call or message them.
4. **The meeting starts.** A door scan, or a tap on the board, marks it *In progress*. A party more than 10 minutes late (the lead's threshold) is marked a no-show.
5. **Refill.** A no-show frees the slot, which is offered to the next *Ready to schedule* match for the participant who came. That match still needs its other party's acceptance.
6. **Sessions.** Door scans and the coordinator's list record session attendance.
7. **Outcome.** When a meeting ends, operations or the staff member present records:
   - the status: held, cancelled, rescheduled or no-show (which party)
   - one of the **seven outcomes** **[Paper]**
   - the next action, its owner and due date
   - notes, which can be marked sensitive

   Sessions record an outcome for each participant in the same seven categories.
8. **Handover.** An outcome with a next action creates or updates an **opportunity**, and its owner is told.
9. **At 19:00** the daily report goes to the lead. It covers:
   - meetings scheduled and held
   - no-shows
   - outcomes by category
   - next actions created
   - room use

   Operations completes any missing outcomes first. The day's close-out checks belong in this report **[Paper]**; today they are shown on the programme, not yet in the report.

**When the service goes down** **[Bouer UC-16]**:
1. **The evening before,** operations prints each room's and each participant's schedule. Every operations device caches the day.
2. **During the outage,** the app shows *Offline* and works from the cache. Algotech's on-call engineer starts an incident.
   - Rooms follow the printed schedule.
   - Attendance and outcomes are captured offline, each with an ID made on the device. Paper sheets are the fallback.
   - No new meetings are booked. Reschedules are noted on paper.
3. **When the service returns,** devices sync once. The server removes duplicates by the device ID. A conflict (one meeting recorded on two devices) goes to the lead and is never silently overwritten.
4. **Paper entry.** Staff enter the paper sheets. The system warns if a meeting already has an outcome.
5. **Closing the incident.** Algotech reports to the lead: duration, cause, records synced, conflicts resolved. The daily report is regenerated.

| ID | Use case | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- |
| DA-6 | Declare the summit live window | Summit week begins | 99.95% target, on-call rota and alerts active | 2 |
| DO-7 | Check participants in | Arrival at the desk | Badge scanned; arrival recorded for the day | 2 |
| DO-8 | Run the live board | Summit day | Status per room and slot; late and no-show flagged | 2 |
| DC-5 | Run the floor **[Paper]** | Summit day | The live board, refills and outcomes, as operations, for Excursia | 2 |
| DO-9 | Record attendance and outcome | Meeting ends | Status; one of the seven outcomes; next action, owner, due date **[Bouer UC-10]** | 2 |
| DO-10 | Refill a no-show slot | A counterparty missing | Slot offered to the next ready match of the one who came | 2 |
| DO-12 | Take session attendance **[Paper]** | Session runs | Who attended, from the doors and the list | 2 |
| DC-6 | Record session outcomes **[Paper]** | Session ends | An outcome for each participant in the seven categories | 2 |
| DL-9 | Read the daily summit report | Each evening at 19:00 | Meetings, no-shows, outcomes, next actions, room use | 2 |
| DO-11 | Work through an outage | Platform unavailable | Printed schedules; offline or paper capture; one sync, no duplicates **[Bouer UC-16]** | 2 |
| DA-7 | Restore after an interruption | Outage during the summit | Service restored; offline records synced; incident report to the lead | 2 |

### 4.9 After the summit

Each opportunity has one owner, one stage and a next-action date. **Commitments are recorded in the five tiers, never merged** **[Paper]**.

**Opportunity stages:**

| Stage | Meaning | Evidence to enter it |
| --- | --- | --- |
| Follow-up | Both sides agreed a next step | The meeting or session outcome |
| Diligence | The counterparty is reviewing materials or asked for data | A note or data request |
| Negotiation | Terms are under discussion | A term sheet or written proposal |
| Closed – won | Committed and documented | A commitment record |
| Closed – lost | Ended without commitment | A close reason: no fit, timing, terms, diligence failed, other |

**Commitment records,** several per opportunity over time, each with its own evidence:
- **Expression of interest**
- **Indicative commitment**
- **Signed commitment:** amount, currency, pathway, date and document
- **Approved, not disbursed**
- **Deployed:** amount, date, and evidence such as a disbursement confirmation

Value is reported at the tier where it is evidenced.

**The one pipeline [Paper].** Every opportunity owner stands at one of the 13 statuses (§2), worked out from its records: application, decision, match, meeting, opportunity, commitment. Each status shows the date reached, the owner, and the evidence behind it.

**The process:**
1. The owner updates the stage, progress, next action, responsible person and due date.
2. Overdue next actions are flagged on the owner's list and the lead's dashboard, and each owner gets a weekly digest.
3. Each month the lead reviews every open opportunity, marks it reviewed, and reassigns stalled ones. The review is logged.
4. Participants can be asked by email for an update. Their reply is attached, but only the owner changes the stage.
5. On the conversion end date, records become read-only and exportable.

**Scope after the summit.** The paper closes delivery with the summit, and puts 30/60/90-day tracking in a separate scope and fee **[Paper]**. Conversion tracking is therefore an add-on, on only if contracted (open: §13).

| ID | Use case | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- |
| DC-7 | Keep the pipeline **[Paper]** | Any change on record | Each opportunity's status, date, owner and evidence current | 3 |
| DL-10 | Run the monthly conversion review | Monthly to the end date | Every open opportunity reviewed; stalled ones reassigned | 3 |
| DL-12 | Export the post-summit pack | Summit ends, and at close | One row per opportunity with stage dates and commitment tiers | 3 |
| CS-12 | Update deal progress | The owner asks for status | Update attached to the opportunity | 3 |
| FP-10 | Report deal progress | Monthly request or own update | Update, with commitment or deployment evidence | 3 |
| DA-8 | Archive the Deal Room | Conversion end date passes | Records read-only; export delivered; documents scheduled for deletion | 3 |

## 5. Rules and deadlines

Rules are set once by the lead and applied the same way on every channel. Any exception is recorded with the staff member and the reason **[Bouer UC-13, UC-14]**.

| Rule | Default | Set by |
| --- | --- | --- |
| Application window | Opens 15 Dec 2026 **[Paper]**; the lead sets the close | Lead |
| Profile completion | 5 working days after qualification | Lead |
| Information request expiry | 7 days, then the lead decides | Lead |
| Participation fee | USD 250, link on qualification, one reminder after 3 days; the lead may waive | Lead |
| Second decider | Every decline; asks above a threshold (USD 10m in the seed) | Lead |
| Introduction acceptance | 5 days | Lead |
| Meeting length and buffer | 20 min and 5 min; 30 min for flagged meetings | Lead |
| Meeting caps | Owners 5 per event; counterparties per day, set at onboarding (6 in the seed) | Lead; overridden by operations or a coordinator, with a reason |
| Confirm a proposed slot | Within 48 hours | Lead |
| Late threshold on the day | 10 minutes, then a no-show | Lead |
| Meeting hours | 09:00 to 17:30, per room | Lead |
| Design freeze | 22 Jan 2027 | Lead |
| Conversion end | 21 Aug 2027, if contracted | Lead |
| Document retention | 12 months after the conversion end, unless the lead extends it with a reason | Lead |

| ID | Use case | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- |
| DL-6 | Record an exception | A rule must be bent | Exception logged with the staff member and reason | 1 |

## 6. Confidentiality, consent and information tiers

Every piece of an opportunity owner's information sits in one of four tiers. Every opening of a tier-2 or tier-3 item is logged, and the owner can see the log **[Bouer §4, UC-15]**.

| Tier | Content | Who sees it | Gate |
| --- | --- | --- | --- |
| 1. Teaser | Name or an anonymised title, sector, country, ask band, pathway, a one-paragraph summary | Verified counterparties, in the directory | A reviewer approved the teaser |
| 2. Full profile | The application, a scores summary, the decision-maker | Verified counterparties with a signed NDA, once introduced | Introduction sent |
| 3. Documents | Each uploaded document | Named counterparties on an accepted introduction | The owner's consent, per document |
| 4. Internal | Reviewer notes, score detail, sensitive meeting notes, the deal stage | The lead, the assigned reviewer, coordinator or owner | Role |

**How a document is shared:**
1. **Upload.** Each document is tagged with its type and date, and starts as *Not shared*.
2. **Teaser.** The owner completes the teaser and chooses whether to show the organisation's name or stay anonymous until introduced. A reviewer approves it.
3. **Proposal.** The introduction proposes what to share with one named counterparty.
4. **Consent.** The owner sees the counterparty's name, the brief and the items, ticks what to allow, and accepts or declines. The consent is stored with the time and version.
5. **Viewing.** The counterparty sees the profile and the consented documents:
   - through short-lived signed links
   - with PDF previews watermarked with the viewer's name and organisation
   - with download only where the owner allowed it
6. **Logging.** Each view and download goes into the owner's access log.
7. **Withdrawing.** The owner can withdraw consent per item at any time. Access stops at once, the log keeps what was already opened, and the reviewer is told.

**Requirements:**
1. Unqualified applicants see only their own application, never other participants, matches or documents **[Bouer acceptance]**.
2. Oversight sees dashboards, the pipeline and reports, but never files **[Paper]**.
3. Notifications never contain private information. They say what changed and link into the platform **[Bouer UC-13]**.
4. Deal Room data follows Kenya's Data Protection Act 2019. Business-confidential data is also governed by the NDA.
5. Algotech's support access is granted by the lead, limited in time, and logged.

| ID | Use case | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- |
| CS-11 | See who opened my file | Any time after introductions | Access log by counterparty, item and time | 2 |
| DA-3 | Change or remove access | A role changes or someone leaves | Access updated or revoked at once; logged **[Bouer UC-12]** | 1 |
| DA-5 | Support a participant | A ticket | Resolved; any document access granted by the lead and logged | 1 |
| DL-11 | Grant support access | Algotech needs to see a record | Time-limited access, logged | 1 |

## 7. Notifications

Email and SMS by default, and push on the apps once they're installed. Each message names the action and the date, carries no private data, and links into the platform. Its delivery status is logged.

- Application received, with the reference number. Information requested. Decision made.
- Fee link with the qualification. Fee reminder after 3 days. Fee received or waived, with the badge.
- Profile incomplete, before the deadline.
- Introduction received. The other party accepted or declined. Introduction about to expire.
- Meeting proposed, confirmed, changed or cancelled. Reminders 24 hours and 30 minutes before.
- Session invitation. Session changed or cancelled.
- Next action due and overdue, to owners. Weekly digest to owners. Daily report to the lead in summit week.

## 8. Reporting

The lead's dashboard is one funnel from lead to deployed capital, against the four targets. Every number links to the records behind it **[Bouer §2, acceptance]**.

| Area | Measures | Broken down by |
| --- | --- | --- |
| Mobilisation | Leads; applications started and submitted; time to first review | Mission, track, source, owner, side |
| Qualification | In review, information requested, decided; Qualified, Conditional, Referred, Declined; fees paid or waived; Deal Room Ready; days to decision | Mission, track, side, reviewer |
| Verification | Counterparties verified, NDAs signed, KYC pending | Kind |
| Matchmaking | Proposed, approved, introduced, accepted, declined, expired; acceptance rate per side | Mission, track, sector, ticket band |
| Meetings and sessions | Meetings requested, confirmed, held, cancelled, rescheduled, no-show; sessions by format with attendance; per participant against cap; room use | Day, room, kind, format |
| Pipeline **[Paper]** | Owners at each of the 13 statuses, with date, owner and evidence | Mission, track, owner |
| Outcomes and conversion **[Paper]** | The seven meeting outcomes; opportunities by stage; the five commitment tiers, count and value; overdue actions; closed by reason | Owner, mission, sector, month |

**Requirements:**
1. Targets sit beside actuals, with their deadlines.
2. Reports keep apart: applicants, qualified participants, meetings, active opportunities, and each commitment tier **[Bouer acceptance]**.
3. Every table exports to Excel and CSV. The post-summit export is one row per opportunity, with every stage date and commitment tier.
4. The daily summit report and a monthly conversion report are emailed to the lead.
5. **Who sees what:**
   - Reviewers see qualification and matching.
   - Operations see meetings.
   - Coordinators see matching, meetings, the pipeline and conversion.
   - Oversight sees every report, read-only.
   - Commitment values are for the lead, coordinators and oversight.

| ID | Use case | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- |
| DL-8 | Watch progress against targets | Any time | Dashboard of 150 / 60 / 200 and conversion against the deadlines | 1 |
| DC-8 | Report for monitoring and evaluation **[Paper]** | Weekly, and at close | Exports of matching, meetings, sessions and the pipeline | 2 |
| DV-1 | Watch the dashboard **[Paper]** | Any time | Targets, funnel and progress, read-only | 1 |
| DV-2 | Read the pipeline **[Paper]** | Any time | Every owner's status, date, owner and evidence, read-only | 2 |
| DV-3 | Read and export reports **[Paper]** | Governance meetings | Every report, exported; no files | 2 |

## 9. Non-functional requirements

The Deal Room inherits the platform's requirements: multi-tenancy, TLS, OWASP ASVS L2, the Data Protection Act 2019 and observability. These rows are what it adds or tightens. The targets are proposals for Bouer's approval **[Bouer §8]**.

| Area | Requirement |
| --- | --- |
| Channels | Responsive web on current Chrome, Safari, Edge and Firefox, laid out for phones. Android and iOS apps from one Flutter codebase on the same API, if decided (open: §13) **[Bouer §3]** |
| Scale | 1,000 applicants, 300 verified counterparties, 500 meetings per event; 200 concurrent users at the application deadline |
| Performance | API p95 under 300 ms; match search under 2 s for 500 × 300 profiles; document preview under 3 s on 4G; a booking burst of 50 simultaneous requests books no clash |
| Availability | 99.9% monthly; 99.95% in summit week, a declared live window |
| Backup and recovery | Point-in-time recovery for 30 days; RTO 1 hour; RPO 5 minutes |
| Outage on the day | Printed and PDF schedules; offline capture that syncs once, with no duplicates **[Bouer UC-16]** |
| Security | Role-based access per event; documents encrypted at rest; signed short-lived links; watermarks; activity history on every decision, consent, access, meeting change and deal update; MFA for the lead, reviewers, coordinators and admin |
| Input | Drafts autosave on the server; nothing submitted is lost to a failed request; every failure gets a clear message **[Bouer §8]** |
| Payments | The fee is settled only by the payment provider's confirmation; a repeated confirmation changes nothing |
| Accessibility and language | WCAG 2.1 AA on participant screens; English at launch, French as an option |

## 10. Data model

These attach to the platform's Event, Delegate, Room, Payment and Scan records. Every change of state is also written to the append-only activity history.

| Entity | Key fields | Belongs to |
| --- | --- | --- |
| Mission, Track | name, code, description; a track's mission | Event |
| Application | reference, side, kind, mission, track, sector, source, owner, form answers, status, decision, decision reason, decided by and at, readiness | Event, Delegate |
| Challenge **[Paper]** | title, problem, users, constraints, outcome, budget, route, timeline, decision process | Application (challenge owner) |
| Fee | amount, currency, sent at, reminder at, paid (method, reference) or waived (by, reason) | Application (owner), Payment |
| Document | file, kind, date, tier, consent state, retention date | Application |
| Assessment | criterion, score, linked document, note, reviewer, time | Application |
| Mandate | sectors, countries, stages, ticket range, currency, pathways, exclusions, decision-maker | Application (counterparty) |
| Verification | KYC items, sanctions result, NDA version, signatory, signed at, verified by | Application (counterparty) |
| Match | owner, counterparty, criteria met and missed, rationale, brief, decision, status | Event |
| Introduction | match, shared items, sent at, each party's response, expires at | Match |
| Meeting | introduction, room, table or link, start, end, status, attendance, outcome (one of seven), next action, owner, notes and sensitive flag, device ID | Introduction, Room |
| Session **[Paper]** | format, title, start, end, room, host, track, owner, invitations and answers, attendance, per-participant outcomes | Event, Room |
| Opportunity | originating meeting or session, owner, stage, next action, due date, commitment records (the five tiers, with amount, currency, date, evidence), close reason | Event |
| DocumentAccess | document, viewer, view or download, time | Document |
| Staff | name, organisation, role, decide right, MFA, active | Event |

**Reuse:**
- Applicants are platform Delegates with a Deal Room category, so badges, check-in and notifications work unchanged.
- Deal Room rooms are platform Rooms in a Deal Room zone, so the clash checks are shared.

## 11. Use case index

The index has 83 use cases across nine roles: the 63 of 6 Nov, under the same IDs, plus 20 new ones from the paper and the fee.

| Stakeholder | Cut 1 Onboarding | Cut 2 Matching, meetings, sessions | Cut 3 After the summit | Total |
| --- | --- | --- | --- | --- |
| Platform admin (DA) | 5 | 2 | 1 | 8 |
| Deal Room lead (DL) | 9 | 2 | 2 | 13 |
| Reviewer (DR) | 5 | 5 | 0 | 10 |
| Coordinator (DC) **[Paper]** | 0 | 7 | 1 | 8 |
| Operations (DO) | 0 | 12 | 0 | 12 |
| Oversight (DV) **[Paper]** | 1 | 2 | 0 | 3 |
| Capital seeker (CS) | 8 | 5 | 1 | 14 |
| Counterparty (FP) | 4 | 6 | 1 | 11 |
| Challenge owner (CH) **[Paper]** | 2 | 2 | 0 | 4 |
| **Total** | **34** | **43** | **6** | **83** |

**New since 6 Nov:**
- **The fee:** CS-13, DL-13.
- **Sessions:** CS-14, FP-11, DO-12.
- **Coordinator:** DC-1 to DC-8.
- **Oversight:** DV-1 to DV-3.
- **Challenge owner:** CH-1 to CH-4.

## 12. Release plan and acceptance

The cuts follow the paper's dates. The milestones that build them are in [backend-plan.md](backend-plan.md).

| Cut | Ready by | Scope |
| --- | --- | --- |
| **1. Onboarding** | Applications open **15 Dec 2026**; decisions from 22 Dec; fees from 8 Jan | Activation and configuration; all four intake routes; reference numbers and status; review, information requests, scoring with evidence; decisions; the fee; counterparty KYC and NDA; notifications; activity history; the dashboard and oversight's view |
| **2. Matching, meetings and sessions** | Design freeze **22 Jan 2027**; rehearsal 10 Feb; summit **15 to 18 Feb** | Readiness; matching and briefs; introductions with consent and tiers; the access log; meetings, caps and exports; sessions in eleven formats; check-in and the live board; outcomes; offline capture; the daily report |
| **3. After the summit** | From **22 Feb 2027**, if contracted | Opportunities and commitment tiers; the pipeline; overdue flags; the monthly review; conversion reports; the archive |

**Acceptance criteria [Bouer §9]:**
- [ ] Each application type, a challenge included, can be completed on the web from a phone and a laptop (and in the apps, if decided).
- [ ] Applications get reference numbers, and applicants can see their status.
- [ ] Reviewers can request information and record authorised decisions in the paper's four outcomes, each with a reason.
- [ ] A qualified owner can pay the fee by M-Pesa or card; a repeated payment confirmation changes nothing; the lead can waive with a reason.
- [ ] Unqualified applicants cannot reach private profiles, matches or documents.
- [ ] The team can find and review possible matches before sending introductions.
- [ ] Introductions record each party's response, and need both acceptances before scheduling.
- [ ] No room, table or participant is double-booked by a meeting or a session; a 50-request concurrency test books no clash.
- [ ] Sessions in every format can be planned, invited, attended and given outcomes.
- [ ] Attendance, outcomes and follow-up actions can be recorded, offline too, with no duplicates on sync.
- [ ] Reports keep apart applicants, qualified participants, meetings, active opportunities and the five commitment tiers, and show the 13-status pipeline.
- [ ] Oversight can read every report and the pipeline, and can open no file and take no action.
- [ ] Access restrictions, activity history, and backup and recovery are tested.
- [ ] Consent and access restrictions are verified for profiles and confidential documents.
- [ ] Administrators can enforce deadlines and meeting rules on every channel.
- [ ] Capacity tests and a service-interruption rehearsal pass against the approved targets.
- [ ] Technical documentation, deployment access, admin training and summit support are handed over.

| ID | Use case | Trigger | Outcome | Cut |
| --- | --- | --- | --- | --- |
| DA-4 | Publish the apps, if decided (§13, question 5) | Apps pass testing | Android and iOS builds submitted, with an internal track as the fallback | 1 |

## 13. Decisions and open questions

**Decided:**

| Date | Decision |
| --- | --- |
| 6 Nov 2026 | The Deal Room is an ExcursiaConnect module, enabled per event |
| 6 Nov 2026 | Matching is rule-based and approved by a person; no automatic introductions |
| 6 Nov 2026 | One NDA per counterparty covers every opportunity in the event |
| 6 Nov 2026 | No video hosting; online meetings use external links |
| Vis a Vis paper | The summit is 15 to 18 Feb 2027, and onboarding launches 15 Dec 2026 |
| Vis a Vis paper | The missions, tracks, sectors, participant kinds, pathways, intake routes, qualification outcomes, rubric dimensions, pipeline, meeting outcomes, commitment tiers and session formats of §2 |
| Vis a Vis paper | Momentum owns and oversees; Bouer sources and qualifies; Excursia Connect coordinates and delivers |
| 11 Nov 2026 | Capital seekers pay a USD 250 participation fee on qualification, waivable by the lead |

**Still open:**

| # | Question | Who answers | What is known |
| --- | --- | --- | --- |
| 1 | Is post-summit tracking contracted, and for how long (30/60/90 days, or six months)? | Momentum, Bouer | The paper puts it in a separate scope and fee |
| 2 | Should the 19:00 report carry each day's close-out checks (§4.8)? | Excursia Connect | The checks are on the programme; the report does not carry them yet |
| 3 | The venue's zones: private suites, lounge and secure document review | Excursia Connect | Presentation area and roundtable room are modelled; the rest waits for the venue |
| 4 | Tag outcomes with the paper's movements (Africa Delivers, Listens, Builds, Commits)? | Momentum | Not modelled |
| 5 | Are the Flutter apps needed for February, or is the web on phones enough? | Bouer, Algotech | The web is laid out for phones; apps add store approval as a risk |
| 6 | The rubric's weights and the numeric thresholds | Bouer | The seed's 30/30/20/15/5 are stand-ins |
| 7 | Who runs counterparty KYC and sanctions screening, and who holds the signed NDAs? | Bouer | |
| 8 | Which matching fields are mandatory and which advisory? | Bouer | The seed makes stage advisory, the rest mandatory |
| 9 | Rooms and tables per slot in summit week, and do online meetings count toward the 200? | Bouer, Excursia Connect | Seven rooms and two session rooms in the seed |
| 10 | Meeting length, buffer and caps, and who may override a cap | Bouer | 20 + 5 minutes; owners 5, counterparties 6 a day |
| 11 | What evidence counts for each commitment tier? | Bouer, Momentum | |
| 12 | Which notifications need SMS, and is app push acceptable as primary? | Bouer | |
| 13 | Reviewers in December and January, and the decision time per application | Bouer | 150 qualified by 3 Jan is about 10 decisions a working day |
| 14 | Document retention after the conversion end, and what is exported to whom | Momentum, Bouer | 12 months by default |
| 15 | The add-on and desk staffing lines on the rate card | Algotech | |
| 16 | Does a counterparty pay anything, and does the fee vary by kind? | Bouer | Only opportunity owners pay today |

## 14. What changed from the 6 November documents

| Area | 6 Nov | Now |
| --- | --- | --- |
| Dates | Summit 15–18 Mar 2027; applications 11 Jan | Summit **15–18 Feb**; applications **15 Dec 2026**; targets 28 days earlier |
| Missions and sectors | Three generic missions; 10 sectors | The paper's 3 missions, 6 tracks and 19 sectors |
| Participants | Seeker or provider, 7 provider kinds | Opportunity owners in 4 kinds; 10 counterparty kinds; challenge owners |
| What is asked for | Instruments (equity, debt, mezzanine…) | The 8 transaction pathways |
| Intake | Import, invitation, open applications | Plus challenge submissions |
| Decisions | Approved, Conditional, Waitlisted, Declined | Qualified, Conditional, Referred, Declined |
| Rubric | Value proposition, feasibility, sustainability, appeal, quality | Relevance, credibility, readiness, counterparty fit, consent and confidentiality |
| Fee | None; badge on approval | USD 250 on qualification; badge on payment or waiver |
| Roles | Lead, reviewer, operations | Plus Excursia's coordinator and Momentum's oversight |
| Formats | One-to-one meetings | Plus 11 session formats |
| Meeting outcomes | Positive, follow-up needed, not a fit | The 7 standard outcomes |
| Commitments | Interest, promise, commitment, funds received | The 5 tiers, with "approved, not disbursed" |
| Pipeline | Statuses spread across records | One pipeline in 13 statuses, each dated, owned and evidenced |
| After the summit | Six months included, to 18 Sep 2027 | An add-on, on if contracted |
| Release cuts | 18 Dec / 19 Feb / 19 Mar | 15 Dec / 22 Jan freeze / from 22 Feb |
