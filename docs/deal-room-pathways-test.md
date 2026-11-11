# Deal Room registration pathways: test report

11 November 2026 · branch `deal-room-partners` · tested in Chrome against the dev server, demo clock Tue 16 Feb 2027 (summit day 2)

This report covers the four registration pathways on the Connected Africa 3.0 Deal Room, as the organiser describes them:

1. **Register as a capital seeker:** startups, scale-ups, enterprises and project sponsors seeking investment or financing.
2. **Register as a capital provider:** angels, VC and PE firms, banks, DFIs, institutional investors and funds.
3. **Register as a commercial or strategic partner:** corporates, procurement teams, distributors, technology providers and regional operators.
4. **Submit an institutional challenge:** ministries, agencies, county governments, regulators and corporate institutions with a defined priority.

Each pathway was followed the way its applicant would use it, from the public page to the point where it meets the other roles. The Deal Room team's part was tested too: review, verification, matching and sessions.

## Summary

- **All four pathways work end to end.** Each one registers through its own stepper, is processed by the team in the way that role needs, and then appears to the other roles where it should.
- **Ten defects were found in this pass, and all are fixed.** The most serious: a provider's review page opened on the seeker's scoring tab when loaded directly, which hid verification; and an institution's match brief said it "invests".
- **The public page and the apply page were redesigned during the pass,** at the user's request: one ordered route through the public page, a hero with a pathways panel, a pathway chooser in place of the 2×2 toggle, and no meeting or application timings.
- **Not covered:** closed applications, the seeker's non-qualifying decisions, card payment and requests for information. They are listed under Not covered, below.

## How the pathways relate

| Pathway | Stored as | Reviewed by | Before it can be matched | Meets |
| --- | --- | --- | --- | --- |
| Capital seeker | the seeker side | Scored against the rubric, then decided | Qualified, fee paid, teaser approved, readiness scored, decision-maker confirmed: **Deal Room Ready** | Capital providers, partners and challenges |
| Capital provider | the provider side, investor type | Verified | KYC checked, sanctions clear, NDA signed, decision-maker confirmed: **Verified** | Seekers, through the directory and introductions |
| Commercial or strategic partner | the provider side, partner type | Verified, as investors are | **Verified** | Seekers; hosts supplier discovery and market-entry sessions |
| Institutional challenge | the provider side, with a challenge | Verified | **Verified**, then the challenge is published | Seekers who could solve it; hosts challenge sessions |

## Entry points

| Case | Result |
| --- | --- |
| Public page: the four pathway rows, in the organiser's words | Pass. Text matches the brief word for word; each button opens its own pathway |
| Hero panel: four pathways on desktop; "Register an opportunity" and "See every pathway" on phones | Pass |
| `apply?type=seeker`, `capital`, `partner`, `challenge` | Pass. Each opens sign-in under its own heading |
| `apply?type=provider` (older links) | Pass. Opens capital provider |
| `apply?type=banana`, or no type | Pass. No type opens the pathway chooser; an unknown type falls back to capital seeker |
| Eligibility check: seeker answers carry into the form | Pass. Sector, country and transaction pathway are filled in |
| Eligibility check: DFI | Pass. Capital provider, with DFI chosen |
| Eligibility check: distributor | Pass. Partner, with the type chosen |
| Eligibility check: public institution | **Fixed.** It went to the partner pathway with no type; now it goes to institutional challenge with the type filled in |
| Eligibility check: "Other" | Pass. "Not this time", with the reason |

## Pathway 1: capital seeker

Mkulima Fresh Ltd, a cold-chain produce distributor in Tanzania, was registered as CA3-CS-00078.

| Step | Result |
| --- | --- |
| Stepper: Organisation, Your ask, Decision-maker and mission, Documents, Review and submit | Pass |
| Submitting from the review step with everything empty | Pass. Refused; the review lists what is missing under each step, and optional items apart |
| "That is me" copies the contact into the decision-maker | Pass |
| Strategic tracks follow the chosen mission | Pass |
| Sample documents: pitch deck, financial statements (view only), registration certificate | Pass |
| Resume link, after leaving the page | **Fixed.** It reopened at step 1 with no ticks; now it opens on the first step with something missing, earlier steps ticked |
| Submit | Pass. CA3-CS-00078, with a status page and the five-stage tracker |
| Reviewer: eligibility, 5 of 5 passed; weighted score 78, each resting on a document | Pass |
| Decision: Qualified, with a reason | Pass. The USD 250 fee link is sent; no badge or matching until it is paid |
| Seeker pays by M-Pesa (KES 32,500), test flow | Pass. Receipt reference shown; badge issued |
| Seeker writes a teaser, kept anonymous, and marks the profile complete | Pass. Waits for the team. **Fixed:** the help text said "instrument" instead of "transaction pathway" |
| Reviewer approves the teaser and scores readiness, average 80 | Pass |
| Set Deal Room Ready | Blocked by "Decision-maker not confirmed", rightly, but the confirm button is on another tab. **Fixed:** the blocker now says where to confirm |
| Deal Room Ready | Pass |
| Seen by a capital provider (pathway 2) | Pass. In the DFI's directory with the name hidden, filtered by "Any pathway" |
| Seen by a challenge (pathway 4) | Pass. Among the candidates for Tanga County's challenge |

## Pathway 2: capital provider

Lake Region Development Finance, a DFI, was registered as CA3-FP-00047.

| Step | Result |
| --- | --- |
| Sign-in, Send a code, wrong code, Enter to submit | Pass. One filled button at a time; a wrong code says so; Enter submits |
| Organisation type list | Pass. Only the six investor types; DFI filled in from the eligibility check |
| Stepper: Organisation, Your mandate, Decision-maker and mission, Review and submit | Pass. "Smallest ticket" and "Largest ticket" |
| Submit | Pass. CA3-FP-00047, labelled "DFI" |
| KYC (three sample documents) and the NDA, in the portal | Pass |
| Reviewer verifies before any check is done | Pass. Refused |
| Reviewer opens the application from a direct link | **Fixed.** It opened on the seeker's Assessment tab, ten "Score" buttons and no KYC checks, because the tab was picked before the saved data loaded. It now always opens on a tab this type has |
| Checks, screening, decision-maker, Verify with a reason | Pass. Verified |
| Directory | Pass. 40 businesses ready to meet, Mkulima's teaser among them, its name hidden |

## Pathway 3: commercial or strategic partner

Savanna Logistics Group, a distributor, was registered as CA3-FP-00046. The earlier partner pass, recorded in [deal-room-use-case-test.md](deal-room-use-case-test.md), took this partner from registration through verification, interest, match, introduction, a held meeting, a deal update with purchase-order evidence, hosting a supplier discovery session, and an agreed and a declined meeting move. This pass added the variants.

| Case | Result |
| --- | --- |
| Arriving through the pathway chooser | Pass. Choosing "Commercial or strategic partner" opens sign-in under its heading; "Choose another pathway" returns to the list |
| The address after choosing | **Fixed.** It stayed `/apply`, so a refresh lost the choice; now it becomes `?type=partner`, and going back clears it |
| Organisation types | Pass. Corporate buyer, distributor or channel partner, ecosystem partner, technology partner, regional operator |
| Signing in with an email that already has a seeker application | Allowed: one person may take part on two pathways, each a separate application. **Fixed:** sign-in now says "This email or phone also has a capital seeker application, CA3-CS-00078", with a link to its status |

## Pathway 4: institutional challenge

Tanga County Government, a public institution, was registered as CA3-FP-00048.

| Step | Result |
| --- | --- |
| Organisation types | Pass. Public institution or corporate buyer only |
| Stepper: Organisation, The challenge, Who could solve it, Decision-maker and mission, Review and submit | Pass |
| The challenge: title, problem, who has it, success, constraints, route (six routes), budget, timeline, how it is decided | Pass |
| Who could solve it | Pass. Procurement and pilots are preset as pathways, and the size reads "Smallest contract or pilot" |
| Submit | Pass. CA3-FP-00048, labelled "Challenge, public institution"; the portal has Challenge and Mandate tabs |
| Registration documents and the NDA | Pass |
| Reviewer verifies | Pass. Opens on Verification; the Application tab shows the challenge and who could solve it, with a contract size |
| Published | Pass. The public page's open challenges went from 2 to 3: "Cut post-harvest losses at county produce markets · Tanga County Government · Pilot · USD 200k to 600k" |
| Matching | Pass. Candidates include Mkulima Fresh and Highland Freight; the size is labelled "Contract size" |
| Match brief | **Fixed.** It read "Tanga County Government (Public institution) invests USD 200,000 to 600,000…" with "The investor's mandate" on the agenda. A new match now describes the challenge, its pathways, contract size, route and timeline, with "The challenge and the institution's questions" on the agenda |

## Cross-pathway cases

| Case | Result |
| --- | --- |
| Invitation link from the Deal Room team (a seeker lead) | Pass. No chooser; "You were invited by the Deal Room team; your details are filled in"; the email is filled in; it opens on the first unfinished step, with the team's steps ticked |
| Resume link on any pathway | Pass, after the fix above. No chooser and no "Choose another pathway" |
| Phone width, 330px in Chrome | **Fixed earlier.** The hero overflowed |
| Phone width, 375px | Pass. Hero, pathway rows (full-width buttons that wrap), chooser and the sector picker sheet; no sideways scrolling |
| Desktop width, 1512px | Pass |
| Design check (Impeccable detector) on both pages | Clean |
| `tsc`, `next build` | Pass. Lint shows only the 4 errors that `main` already has, in files this branch does not touch |

## Defects found in this pass

| # | Defect | Where | Severity | Status |
| --- | --- | --- | --- | --- |
| 1 | Opening a provider's or challenge's review page by direct link showed the seeker's scoring tab, not verification | Review | High: verification hidden | Fixed |
| 2 | An institutional challenge's match brief said it "invests", and the agenda said "The investor's mandate" | Match brief | Medium: wrong to both parties | Fixed for new matches |
| 3 | Eligibility check sent a public institution to the partner pathway with no type | Public page | Medium | Fixed |
| 4 | Resuming a draft opened at step 1 with nothing ticked | Apply | Low | Fixed |
| 5 | The chosen pathway was not kept in the address, so a refresh lost it | Apply | Low | Fixed |
| 6 | A second pathway under the same email gave no sign of the first | Apply | Low | Fixed: a notice links to the other application |
| 7 | "Decision-maker not confirmed" did not say where to confirm | Review | Low | Fixed |
| 8 | Teaser help said "instrument" | Portal | Low | Fixed |
| 9 | Hero overflowed 330px phones (12 columns with 32px gaps; long buttons could not wrap) | Public page, event site | Medium | Fixed |
| 10 | The 2×2 pathway toggle on sign-in was cramped and unclear | Apply | Design | Replaced by a pathway chooser |

## Design changes made during the pass

- **Public page.** It now reads as one route:
  1. Hero: the event name, the promise, the main action, and the four pathways in a panel, with dates, place, application window and document consent along the foot.
  2. Deal Room activities.
  3. The four pathways as ruled rows, each with its group and its own button. This replaces the separate "Who should participate?" grid and the pathway cards, which repeated each other.
  4. How it works, with what is checked underneath.
  5. The eligibility check.
  6. Institutional challenges.
  7. Missions and tracks.
  8. Questions.
- **Apply page.** A bare apply link opens a pathway chooser, in the style of event registration; a pathway link opens sign-in directly, with "Choose another pathway". Sign-in is a form with one main button at a time.
- **No timings.** Meeting lengths, buffers and the "about 20 minutes" estimate are gone from both pages. Deadlines stay, such as the application window and the follow-up period.

## Not covered

- **Closed applications.** Testing them means moving the demo clock past 18 February, which plays the after-summit script.
- **Other seeker outcomes:** Conditional, Referred and Declined decisions; the second decider for large asks; card payment; requests for information; the expiry policy.
- **Seeded challenge briefs.** The briefs drafted when the demo data was seeded still say "invests" until the data is reseeded. New matches use the corrected wording, and the team can edit any brief.
- **Two tabs at once.** Early in the pass, another tab in the same window was in use and navigated away mid-step. The demo data is shared across tabs, so two people editing at once can overwrite each other. This is a prototype limit, not a pathway defect.
- **Phones, step by step.** Every stepper step at phone width was checked only for the partner pathway and the chooser.

## Records created

| Record | Pathway | State |
| --- | --- | --- |
| CA3-CS-00078 Mkulima Fresh Ltd | Capital seeker | Qualified, fee paid, Deal Room Ready |
| CA3-FP-00047 Lake Region Development Finance | Capital provider (DFI) | Verified |
| CA3-FP-00046 Savanna Logistics Group | Partner (distributor) | Verified; held meeting, deal, hosted session (earlier pass) |
| CA3-FP-00048 Tanga County Government | Challenge (public institution) | Verified, published; matched with Mkulima Fresh and Highland Freight |
| Draft under Mkulima's email | Partner | Left as a draft, to show the two-pathway notice |
