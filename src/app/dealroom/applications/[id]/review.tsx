"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Empty, KV, PageHeader, Section, Tabs } from "@/components/ui";
import {
  DECISIONS,
  canSeeInternal,
  compact,
  decisionOf,
  drCan,
  eligibility,
  feeInKes,
  feeLabel,
  feeOwed,
  latestScore,
  missionName,
  openConditions,
  openRfi,
  pendingSecond,
  profileDeadline,
  qualified,
  readinessBlockers,
  readinessScore,
  rfiDue,
  roleOf,
  rfiExpired,
  staffName,
  trackName,
  verificationBlockers,
  weighted,
} from "@/lib/dealroom/logic";
import type { Decision, DocKind, DrApplication, Layer, Readiness } from "@/lib/dealroom/types";
import { fmtStamp } from "@/lib/time";
import { Activity } from "./activity";
import { DecisionPill, DocLine, Labeled, Pill, ReadinessPill, Refusal, StatusPill, When, typeLabel, useDr } from "../../bits";

const tabsSeeker = ["Assessment", "Application", "Requests", "Decision", "Teaser", "In the Deal Room", "History"] as const;
const tabsProvider = ["Verification", "Application", "Requests", "In the Deal Room", "History"] as const;
type Tab = (typeof tabsSeeker)[number] | (typeof tabsProvider)[number];

export function Review({ id }: { id: string }) {
  const { dr, cfg, me, now, can, dispatch, hydrated } = useDr();
  const app = dr.apps.find((a) => a.id === id);
  const [tab, setTab] = useState<Tab>(app?.type === "provider" ? "Verification" : "Assessment");
  if (!app || !cfg) return <Empty>{hydrated ? "Application not found. It may have been merged into another." : "Loading…"}</Empty>;
  if (!drCan(me, "review") && !drCan(me, "assign")) return <Refusal title="Applications are the review team's">Your role, {me?.role}, does not open applications.</Refusal>;

  const second = pendingSecond(app);
  const rfi = openRfi(app);
  const expired = rfi && rfiExpired(rfi, cfg, now);
  const dl = app.type === "seeker" && qualified(app) && !app.profileCompletedAt ? profileDeadline(app, cfg) : undefined;
  const tabs = app.type === "seeker" ? tabsSeeker : tabsProvider;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/dealroom/applications", label: "Applications" }, { label: app.ref ?? app.org.name }]}
        title={app.org.name}
        badge={
          <span className="flex flex-wrap gap-1">
            <StatusPill app={app} />
            <DecisionPill app={app} />
            <ReadinessPill app={app} />
          </span>
        }
        kicker={`${app.ref ?? "Not submitted"} · ${typeLabel(app)}${app.ownerKind ? `, ${app.ownerKind.toLowerCase()}` : ""} · ${missionName(cfg, app.mission)}${app.track ? `, ${trackName(cfg, app.track)}` : ""} · source ${app.source} · owner ${staffName(dr, app.owner)} · reviewer ${app.assignee ? staffName(dr, app.assignee) : "not assigned"}`}
        actions={
          <>
            {app.status === "Submitted" && can("review") && (
              <button className="btn-primary" onClick={() => dispatch({ type: "dr/startReview", appId: app.id })}>
                Start review
              </button>
            )}
            {can("assign") && ["Submitted", "In review", "Information requested"].includes(app.status) && (
              <select className="input h-9 w-auto text-[14px]" aria-label="Reviewer" value={app.assignee ?? ""} onChange={(e) => e.target.value && dispatch({ type: "dr/assign", appIds: [app.id], staffId: e.target.value })}>
                <option value="">Assign a reviewer…</option>
                {dr.staff
                  .filter((s) => s.active && s.role !== "Operations")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            )}
          </>
        }
      />

      {app.status === "Lead" || app.status === "Invited" || app.status === "Draft" ? (
        <Banner tone="mute">
          {app.status === "Draft" ? `The applicant is drafting; last saved ${fmtStamp(app.draftSavedAt ?? app.statusAt)}. Nothing is reviewed until it is submitted.` : `${app.status === "Invited" ? `Invited ${fmtStamp(app.invite?.sentAt ?? app.statusAt)}` : "Imported, not invited yet"}. The invitation link: /e/connected-africa-3/deal-room/apply?invite=${app.invite?.token}`}
        </Banner>
      ) : null}
      {second && (
        <Banner tone="warn">
          {staffName(dr, second.by)} decided <b className="font-medium">{second.decision}</b> on {fmtStamp(second.at)}: &ldquo;{second.reason}&rdquo;. It takes effect when a second, different decider confirms.{" "}
          {can("decide") && me?.id !== second.by ? (
            <button className="btn-primary btn-sm ml-2" onClick={() => dispatch({ type: "dr/confirmSecond", appId: app.id })}>
              Confirm as second decider
            </button>
          ) : (
            <span className="text-slate">{me?.id === second.by ? "You made this decision; someone else must confirm it." : "Only a decider can confirm."}</span>
          )}
        </Banner>
      )}
      {app.reReview && <ReReview app={app} />}
      {rfi && (
        <Banner tone={expired ? "bad" : "warn"}>
          Information requested {fmtStamp(rfi.at)}, {expired ? <b className="font-medium">expired {fmtStamp(rfiDue(rfi, cfg), false)}</b> : `due ${fmtStamp(rfiDue(rfi, cfg), false)}`}.{" "}
          {expired && (me?.role === "Lead" ? <RfiExpiry app={app} /> : <span>The lead decides what happens next.</span>)}
        </Banner>
      )}
      {dl && <Banner tone={dl < now.slice(0, 10) ? "bad" : "mute"}>Matching profile due {fmtStamp(dl, false)}{dl < now.slice(0, 10) ? ", overdue" : ""}. The applicant completes it from their status page.</Banner>}

      <Tabs tabs={tabs as readonly Tab[]} value={tab} onChange={setTab} counts={{ Requests: app.rfis.filter((r) => !r.response && !r.expiry).length }} />

      {tab === "Assessment" && <Assessment app={app} />}
      {tab === "Verification" && <VerificationTab app={app} />}
      {tab === "Application" && <ApplicationTab app={app} />}
      {tab === "Requests" && <Requests app={app} />}
      {tab === "Decision" && <DecisionTab app={app} />}
      {tab === "Teaser" && <TeaserTab app={app} />}
      {tab === "In the Deal Room" && <Activity app={app} />}
      {tab === "History" && <History app={app} />}

      {can("grantSupport") && <SupportGrant app={app} />}
    </>
  );
}

function Banner({ tone, children }: { tone: "warn" | "bad" | "mute"; children: ReactNode }) {
  const c = { warn: "bg-warn-50 text-ink border-warn/30", bad: "bg-bad-50 text-ink border-bad/30", mute: "bg-paper text-ink border-line" }[tone];
  return <div className={`mb-3 rounded-lg border px-4 py-3 text-[14px] ${c}`}>{children}</div>;
}

/* ---------- scoring ---------- */

function Assessment({ app }: { app: DrApplication }) {
  const { cfg, can } = useDr();
  if (!cfg) return null;
  const el = eligibility(app, cfg);
  const w = weighted(app, cfg);
  const rs = readinessScore(app, cfg);
  const scorable = can("review") && ["Submitted", "In review", "Information requested", "Decided"].includes(app.status);
  return (
    <div className="space-y-4">
      <Section title="Eligibility, pass or fail" action={<span className="text-[13px] text-slate">{el.passed} pass, {el.failed} fail, {el.missing} not checked</span>} flush>
        <Rows app={app} layer="eligibility" items={cfg.rubric.eligibility.map((c) => ({ id: c.id, text: c.text }))} editable={scorable} />
      </Section>
      <Section title="Assessment, 0 to 100, weighted" action={<span className="text-[13px] text-slate">Weighted score {w ?? "– (not every criterion scored)"}</span>} flush>
        <Rows app={app} layer="assessment" items={cfg.rubric.assessment.map((c) => ({ id: c.id, text: `${c.text} · ${c.weight}%` }))} editable={scorable} />
      </Section>
      <Section title="Readiness" action={<span className="text-[13px] text-slate">{qualified(app) ? `Average ${rs ?? "– (not every criterion scored)"}` : "Scored once approved"}</span>} flush>
        <Rows app={app} layer="readiness" items={cfg.rubric.readiness.map((c) => ({ id: c.id, text: c.text }))} editable={scorable && qualified(app)} />
      </Section>
      <p className="text-[13px] text-slate">A score rests on a document; with no document it needs a written note. A new score supersedes the last, which stays in History.</p>
    </div>
  );
}

function Rows({ app, layer, items, editable }: { app: DrApplication; layer: Layer; items: { id: string; text: string }[]; editable: boolean }) {
  const { dr } = useDr();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <table className="w-full">
      <tbody>
        {items.map((c) => {
          const a = latestScore(app, layer, c.id);
          const older = app.assessments.filter((x) => x.layer === layer && x.criterion === c.id).length - (a ? 1 : 0);
          const doc = a?.docId ? app.documents.find((d) => d.id === a.docId) : undefined;
          return (
            <tr key={c.id} className="align-top">
              <td className="td w-[42%]">
                <div className="font-medium text-[14px]">{c.text}</div>
                {older > 0 && <div className="text-[12px] text-slate">{older} earlier score{older > 1 ? "s" : ""} superseded</div>}
              </td>
              <td className="td">
                {open === c.id ? (
                  <ScoreForm app={app} layer={layer} criterion={c.id} onDone={() => setOpen(null)} />
                ) : a ? (
                  <div className="text-[13px]">
                    <span className="font-medium text-[15px] num">{layer === "eligibility" ? (a.pass ? "Pass" : "Fail") : a.score}</span>
                    <span className="text-slate">
                      {" "}
                      · {doc ? `rests on ${doc.kind}` : a.note ? `note: ${a.note}` : ""} · {staffName(dr, a.by)}, {fmtStamp(a.at)}
                    </span>
                  </div>
                ) : (
                  <span className="text-[13px] text-slate">Not scored</span>
                )}
              </td>
              <td className="td text-right w-24">
                {editable && open !== c.id && (
                  <button className="link text-[13px]" onClick={() => setOpen(c.id)}>
                    {a ? "Rescore" : "Score"}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ScoreForm({ app, layer, criterion, onDone }: { app: DrApplication; layer: Layer; criterion: string; onDone: () => void }) {
  const { dispatch } = useDr();
  const [pass, setPass] = useState<boolean | null>(null);
  const [score, setScore] = useState("");
  const [docId, setDocId] = useState("");
  const [note, setNote] = useState("");
  const missingEvidence = layer !== "eligibility" && !docId && !note.trim();
  const bad = layer === "eligibility" ? pass === null : score === "" || Number(score) < 0 || Number(score) > 100 || missingEvidence;
  return (
    <form
      className="grid gap-2 sm:grid-cols-[110px_1fr] items-start"
      onSubmit={(e) => {
        e.preventDefault();
        if (bad) return;
        dispatch({ type: "dr/score", appId: app.id, layer, criterion, pass: layer === "eligibility" ? pass! : undefined, score: layer === "eligibility" ? undefined : Number(score), docId: docId || undefined, note: note.trim() || undefined });
        onDone();
      }}
    >
      {layer === "eligibility" ? (
        <div className="flex gap-1">
          <button type="button" className={`btn-sm ${pass === true ? "btn-primary" : "btn-secondary"}`} onClick={() => setPass(true)}>
            Pass
          </button>
          <button type="button" className={`btn-sm ${pass === false ? "btn-primary" : "btn-secondary"}`} onClick={() => setPass(false)}>
            Fail
          </button>
        </div>
      ) : (
        <input className="input h-9" type="number" min={0} max={100} placeholder="0 to 100" aria-label="Score" value={score} onChange={(e) => setScore(e.target.value)} />
      )}
      <div className="grid gap-2">
        <select className="input h-9 text-[13px]" aria-label="Evidence" value={docId} onChange={(e) => setDocId(e.target.value)}>
          <option value="">No document: write a note</option>
          {app.documents.map((d) => (
            <option key={d.id} value={d.id}>
              Rests on {d.kind}
            </option>
          ))}
        </select>
        <input className="input h-9 text-[13px]" placeholder={missingEvidence ? "Note (needed without a document)" : "Note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn-primary btn-sm" disabled={bad}>
            Save score
          </button>
          <button type="button" className="btn-quiet" onClick={onDone}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

/* ---------- the application as submitted ---------- */

function ApplicationTab({ app }: { app: DrApplication }) {
  const { cfg, can, dispatch } = useDr();
  if (!cfg) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Organisation">
        <KV rows={[["Legal name", app.org.name], ["Registration", app.org.regNo || "–"], ["Country", app.org.country || "–"], ["Sector", app.org.sector || "–"], ["Founded", app.org.founded ?? "–"], ["Website", app.org.website ?? "–"], ["Applicant", `${app.contact.name}, ${app.contact.email}, ${app.contact.phone}`]]} />
      </Section>
      <Section title="Decision-maker" action={app.decisionMaker.confirmed ? <Pill tone="ok">Confirmed</Pill> : can("review") && app.decisionMaker.name ? <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/confirmDecisionMaker", appId: app.id })}>Confirm</button> : null}>
        <KV rows={[["Name", app.decisionMaker.name || "–"], ["Title", app.decisionMaker.title || "–"], ["Email", app.decisionMaker.email || "–"], ["Phone", app.decisionMaker.phone || "–"]]} />
        {app.decisionMaker.confirmed && <p className="mt-2 text-[12px] text-slate">Confirmed available for the summit, {fmtStamp(app.decisionMaker.confirmed.at)}.</p>}
      </Section>
      {app.type === "seeker" ? (
        <Section title="The ask">
          {app.ask ? (
            <KV rows={[["Amount", compact(app.ask.amount, app.ask.currency)], ["Pathway", app.ask.instrument], ["Stage", app.ask.stage], ["Use of funds", app.ask.useOfFunds], ["Revenue", app.traction?.revenueBand ?? "–"], ["Customers", app.traction?.customers ?? "–"], ["Metrics", app.traction?.metrics ?? "–"]]} />
          ) : (
            <Empty>Not filled in yet.</Empty>
          )}
        </Section>
      ) : (
        <>
        {app.challenge && (
          <Section title="The challenge">
            <KV
              rows={[
                ["Title", app.challenge.title],
                ["Problem", app.challenge.problem],
                ["Who has it", app.challenge.users],
                ["Success looks like", app.challenge.outcome],
                ["Constraints", app.challenge.constraints || "–"],
                ["Route", app.challenge.route || "–"],
                ["Budget", app.challenge.budget || "–"],
                ["Timeline", app.challenge.timeline || "–"],
                ["Decision process", app.challenge.decisionProcess],
              ]}
            />
          </Section>
        )}
        <Section title={app.challenge ? "Who could solve it" : roleOf(app) === "partner" ? "What the partner is looking for" : "Mandate"}>
          {app.mandate ? (
            <KV
              rows={[
                ["Sectors", app.mandate.sectors.join(", ")],
                ["Countries", app.mandate.countries.join(", ")],
                ["Stages", app.mandate.stages.join(", ")],
                [app.challenge || roleOf(app) === "partner" ? "Contract size" : "Ticket", `${compact(app.mandate.ticketMin, app.mandate.currency)} to ${compact(app.mandate.ticketMax, app.mandate.currency)}`],
                ["Pathways", app.mandate.instruments.join(", ")],
                ["Exclusions", app.mandate.exclusions.join(", ") || "None"],
                ["Decision timeline", app.mandate.timeline || "–"],
                ["Meeting caps", app.caps ? `${app.caps.perDay} a day, ${app.caps.perEvent} in all` : "–"],
              ]}
            />
          ) : (
            <Empty>Not filled in yet.</Empty>
          )}
        </Section>
        </>
      )}
      <Section title={`Documents, ${app.documents.length}`}>
        {app.documents.length ? app.documents.map((d) => <DocLine key={d.id} doc={d} />) : <Empty>No documents yet.</Empty>}
      </Section>
    </div>
  );
}

/* ---------- information requests (DR-2) ---------- */

const DOC_KINDS: DocKind[] = ["Pitch deck", "Financial statements", "Registration certificate", "Feasibility study", "E&S study", "Beneficial owners", "Signatory ID", "Other"];

function Requests({ app }: { app: DrApplication }) {
  const { dr, cfg, can, dispatch, now } = useDr();
  const [qs, setQs] = useState("");
  const [docs, setDocs] = useState<DocKind[]>([]);
  if (!cfg) return null;
  const canAsk = can("review") && app.status === "In review";
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Section title="Requests and answers" flush>
        {app.rfis.length === 0 ? (
          <div className="p-5">
            <Empty>No information requested.</Empty>
          </div>
        ) : (
          <ul>
            {[...app.rfis].reverse().map((r) => (
              <li key={r.id} className="px-5 py-4 border-b border-line last:border-0 text-sm">
                <div className="flex justify-between gap-3 text-[13px] text-slate">
                  <span>
                    {staffName(dr, r.by)}, {fmtStamp(r.at)}
                  </span>
                  <span>{r.response ? `Answered ${fmtStamp(r.response.at)}` : r.expiry ? `Expired: ${r.expiry.how}` : rfiExpired(r, cfg, now) ? "Expired, unanswered" : `Due ${fmtStamp(rfiDue(r, cfg), false)}`}</span>
                </div>
                <ol className="mt-2 list-decimal pl-5 space-y-1">
                  {r.questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ol>
                {r.docs.length > 0 && <div className="mt-1 text-[13px] text-slate">Documents asked for: {r.docs.join(", ")}</div>}
                {r.response && (
                  <div className="mt-3 rounded-md bg-paper p-3">
                    <div className="text-[13px] text-slate">The applicant</div>
                    <p>{r.response.text}</p>
                    {r.response.docIds.map((id) => {
                      const d = app.documents.find((x) => x.id === id);
                      return d ? <DocLine key={id} doc={d} /> : null;
                    })}
                  </div>
                )}
                {r.expiry && <div className="mt-2 text-[13px]">The lead: {r.expiry.how}, {r.expiry.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Request information">
        {canAsk ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const questions = qs.split("\n").map((x) => x.trim()).filter(Boolean);
              if (!questions.length) return;
              dispatch({ type: "dr/requestInfo", appId: app.id, questions, docs });
              setQs("");
              setDocs([]);
            }}
          >
            <Labeled label="Questions, one per line">
              <textarea className="input min-h-24" value={qs} onChange={(e) => setQs(e.target.value)} placeholder="Please send audited accounts for 2025." />
            </Labeled>
            <div>
              <span className="label">Documents to send</span>
              <div className="flex flex-wrap gap-1.5">
                {DOC_KINDS.map((k) => (
                  <button type="button" key={k} className={`pill ${docs.includes(k) ? "bg-ink text-white" : "bg-paper-200 text-slate"}`} onClick={() => setDocs(docs.includes(k) ? docs.filter((x) => x !== k) : [...docs, k])}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn-primary" disabled={!qs.trim()}>
              Send the request
            </button>
            <p className="text-[12px] text-slate">The applicant gets an email and SMS that say a request is waiting, with no details, and has {cfg.rules.rfiDays} days to answer. The application moves to Information requested.</p>
          </form>
        ) : (
          <p className="text-[14px] text-slate">{app.status === "Information requested" ? "A request is open; another can be sent once it is answered." : app.status === "In review" ? "Your role does not review." : `Requests are sent while an application is in review; this one is ${app.status.toLowerCase()}.`}</p>
        )}
      </Section>
    </div>
  );
}

function RfiExpiry({ app }: { app: DrApplication }) {
  const { dispatch } = useDr();
  const [how, setHow] = useState<"Extended" | "Referred" | "Declined" | "Withdrawn">("Extended");
  const [note, setNote] = useState("");
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <select className="input h-8 w-auto text-[13px]" value={how} onChange={(e) => setHow(e.target.value as typeof how)}>
        <option value="Extended">Extend by a full period</option>
        <option value="Referred">Refer elsewhere</option>
        <option value="Declined">Decline</option>
        <option value="Withdrawn">Treat as withdrawn</option>
      </select>
      <input className="input h-8 w-56 text-[13px]" placeholder="Reason (logged as an exception)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-primary btn-sm" disabled={!note.trim()} onClick={() => dispatch({ type: "dr/rfiExpiry", appId: app.id, how, note })}>
        Apply
      </button>
    </span>
  );
}

/* ---------- recommendation, decision, conditions, readiness ---------- */

function DecisionTab({ app }: { app: DrApplication }) {
  const { dr, cfg, me, can, dispatch } = useDr();
  const [decision, setDecision] = useState<Decision>("Qualified");
  const [reason, setReason] = useState("");
  const [conds, setConds] = useState([{ text: "", due: "" }]);
  if (!cfg) return null;
  const current = decisionOf(app);
  const canDecide = can("decide");
  const open = app.status === "In review" || app.status === "Decided" || app.status === "Information requested";
  const usd = app.ask ? (app.ask.currency === "USD" ? app.ask.amount : app.ask.amount / 130) : 0;
  const needsSecond = (decision === "Declined" && cfg.secondReview.decline) || usd > cfg.secondReview.askAbove;
  const blockers = readinessBlockers(app, cfg);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Section title="Decision in force">
          {current ? (
            <>
              <div className="flex items-center gap-2">
                <DecisionPill app={app} />
                <span className="text-[13px] text-slate">
                  {staffName(dr, current.by)}, {fmtStamp(current.at)}
                  {current.second && `; confirmed by ${staffName(dr, current.second.by)}`}
                </span>
              </div>
              <p className="mt-2 text-[14px]">{current.reason}</p>
              {current.conditions.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {current.conditions.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 rounded-md bg-paper px-3 py-2 text-[14px]">
                      <span>
                        {c.text} <span className="text-slate">· due {fmtStamp(c.due, false)}</span>
                      </span>
                      {c.met ? (
                        <Pill tone="ok">Met {fmtStamp(c.met.at, false)}</Pill>
                      ) : can("review") ? (
                        <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/meetCondition", appId: app.id, conditionId: c.id })}>
                          Mark met
                        </button>
                      ) : (
                        <Pill tone="warn">Open</Pill>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <Empty>No decision yet.</Empty>
          )}
        </Section>

        {qualified(app) && app.fee && <FeePanel app={app} />}

        {qualified(app) && (
          <Section title="Readiness" action={<ReadinessPill app={app} />}>
            {blockers.length > 0 ? (
              <ul className="text-[14px] space-y-1">
                {blockers.map((b) => (
                  <li key={b} className="text-slate">
                    · {b}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-slate">Every readiness score is in, the decision-maker is confirmed and no condition is open.</p>
            )}
            {can("readiness") && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(["Not ready", "In preparation", "Deal Room Ready"] as Readiness[]).map((r) => (
                  <button key={r} className={app.readiness === r ? "btn-primary btn-sm" : "btn-secondary btn-sm"} disabled={app.readiness === r || (r === "Deal Room Ready" && blockers.length > 0)} onClick={() => dispatch({ type: "dr/readiness", appId: app.id, readiness: r })}>
                    {r}
                  </button>
                ))}
              </div>
            )}
          </Section>
        )}

        <Section title="Every decision and recommendation" flush>
          {app.decisions.length + app.recommendations.length === 0 ? (
            <div className="p-5">
              <Empty>None yet.</Empty>
            </div>
          ) : (
            <ul>
              {[...app.decisions.map((d) => ({ kind: "Decision", ...d })), ...app.recommendations.map((r) => ({ kind: "Recommendation", ...r }))]
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((x) => (
                  <li key={x.id} className="px-5 py-3 border-b border-line last:border-0 text-[14px]">
                    <div className="text-[13px] text-slate">
                      {x.kind} · {staffName(dr, x.by)} · {fmtStamp(x.at)}
                    </div>
                    <div>
                      <b className="font-medium">{x.decision}</b>: {x.reason}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title={canDecide ? "Record a decision" : "Recommend a decision"}>
        {!open ? (
          <p className="text-[14px] text-slate">Decisions are recorded once the application is in review.</p>
        ) : !can("review") ? (
          <p className="text-[14px] text-slate">Your role does not decide.</p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason.trim()) return;
              if (canDecide) dispatch({ type: "dr/decide", appId: app.id, decision, reason, conditions: decision === "Conditional" ? conds : [] });
              else dispatch({ type: "dr/recommend", appId: app.id, decision, reason });
              setReason("");
              setConds([{ text: "", due: "" }]);
            }}
          >
            <div className="grid grid-cols-2 gap-1.5">
              {DECISIONS.map((d) => (
                <button type="button" key={d} className={decision === d ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setDecision(d)}>
                  {d}
                </button>
              ))}
            </div>
            <Labeled label="Reason, shown to the applicant">
              <textarea className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Labeled>
            {decision === "Conditional" && (
              <div className="space-y-2">
                <span className="label">Conditions</span>
                {conds.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_130px] gap-2">
                    <input className="input h-9 text-[13px]" placeholder="What must be met" value={c.text} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                    <input className="input h-9 text-[13px]" type="date" aria-label="Due" value={c.due} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)))} />
                  </div>
                ))}
                <button type="button" className="link text-[13px]" onClick={() => setConds([...conds, { text: "", due: "" }])}>
                  Add a condition
                </button>
              </div>
            )}
            <button className="btn-primary w-full" disabled={!reason.trim() || (decision === "Conditional" && !conds.some((c) => c.text.trim() && c.due))}>
              {canDecide ? `Decide: ${decision}` : `Recommend: ${decision}`}
            </button>
            <p className="text-[12px] text-slate">
              {canDecide
                ? needsSecond
                  ? `This needs a second decider: ${decision === "Declined" ? "every decline does" : `the ask is over ${compact(cfg.secondReview.askAbove)}`}. It takes effect when a different decider confirms.`
                  : "Takes effect at once and notifies the applicant. A later decision supersedes it; this one stays on record."
                : `${me?.name} recommends; a decider (${dr.staff.filter((s) => s.active && (s.role === "Lead" || s.canDecide)).map((s) => s.name.split(" ")[0]).join(", ")}) records the decision.`}
            </p>
          </form>
        )}
      </Section>
    </div>
  );
}

/* ---------- the teaser (tier 1) ---------- */

/** The participation fee: owed since the decision, paid, or waived by the lead with a reason. Matching waits for it. */
function FeePanel({ app }: { app: DrApplication }) {
  const { dr, me, dispatch } = useDr();
  const [reason, setReason] = useState("");
  const f = app.fee!;
  const owed = feeOwed(app);
  return (
    <Section title="Participation fee" action={<span className={`pill ${owed ? "bg-warn-50 text-warn" : "bg-ok-50 text-ok"}`}>{f.paid ? "Paid" : f.waived ? "Waived" : "Not paid"}</span>}>
      <p className="text-[14px]">
        {feeLabel(f)}, link sent {fmtStamp(f.sentAt)}
        {f.reminderAt ? `, reminded ${fmtStamp(f.reminderAt)}` : ""}.{" "}
        {f.paid
          ? `Paid by ${f.paid.method}${f.paid.kes ? ` (KES ${f.paid.kes.toLocaleString("en")})` : ""} on ${fmtStamp(f.paid.at)}, reference ${f.paid.reference}.`
          : f.waived
            ? `Waived by ${staffName(dr, f.waived.by)} on ${fmtStamp(f.waived.at)}: ${f.waived.reason}`
            : `Not paid yet: no badge, and no matching or introductions until it is. By M-Pesa it is KES ${feeInKes(f).toLocaleString("en")}.`}
      </p>
      {owed && me?.role === "Lead" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="input h-9 flex-1 min-w-56 text-[13px]" placeholder="Why it is waived, for example a sponsored place" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-secondary btn-sm" disabled={!reason.trim()} onClick={() => { dispatch({ type: "dr/waiveFee", appId: app.id, reason }); setReason(""); }}>
            Waive the fee
          </button>
        </div>
      )}
      {owed && me?.role !== "Lead" && <p className="mt-2 text-[13px] text-slate">Only the lead can waive it.</p>}
    </Section>
  );
}

function TeaserTab({ app }: { app: DrApplication }) {
  const { dr, cfg, can, dispatch } = useDr();
  if (!cfg) return null;
  const dl = profileDeadline(app, cfg);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Teaser for the directory" action={app.teaser?.approved ? <Pill tone="ok">Approved</Pill> : app.teaser ? <Pill tone="warn">Waiting for approval</Pill> : null}>
        {app.teaser ? (
          <>
            <div className="rounded-lg border border-line p-4">
              <div className="text-[12px] text-slate">
                {app.org.sector} · {app.org.country} · {app.ask?.instrument}
              </div>
              <div className="mt-1 font-medium">{app.teaser.title}</div>
              <p className="mt-2 text-[14px]">{app.teaser.summary}</p>
              <div className="mt-2 text-[12px] text-slate">{app.teaser.anonymous ? "Anonymous: the name shows only after an introduction" : "Shows the organisation's name"}</div>
            </div>
            {!app.teaser.approved && can("review") && (
              <button className="btn-primary mt-3" onClick={() => dispatch({ type: "dr/approveTeaser", appId: app.id })}>
                Approve for the directory
              </button>
            )}
            {app.teaser.approved && <p className="mt-2 text-[12px] text-slate">Approved by {staffName(dr, app.teaser.approved.by)}, {fmtStamp(app.teaser.approved.at)}. Verified providers see it once the seeker is Deal Room Ready.</p>}
          </>
        ) : (
          <Empty>The applicant writes the teaser after approval, with the matching profile.</Empty>
        )}
      </Section>
      <Section title="Matching profile">
        <KV rows={[["Profile", app.profileCompletedAt ? `Completed ${fmtStamp(app.profileCompletedAt)}` : "Not completed"], ["Deadline", dl ? fmtStamp(dl, false) : "Set on approval"], ["Open conditions", String(openConditions(app).length)]]} />
      </Section>
    </div>
  );
}

/* ---------- finance provider verification (DR-4) ---------- */

function VerificationTab({ app }: { app: DrApplication }) {
  const { dr, can, dispatch } = useDr();
  const [result, setResult] = useState<"Clear" | "Match found">("Clear");
  const [snote, setSnote] = useState("");
  const [reason, setReason] = useState("");
  const v = app.verification;
  const blockers = verificationBlockers(app);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Section title="KYC pack" flush>
          <table className="w-full">
            <tbody>
              {(["Registration", "Beneficial owners", "Signatory ID"] as const).map((k) => {
                const item = v?.kyc[k];
                const doc = item && app.documents.find((d) => d.id === item.docId);
                return (
                  <tr key={k}>
                    <td className="td font-medium">{k}</td>
                    <td className="td text-[13px] text-slate">{doc ? `${doc.name}, ${fmtStamp(doc.at, false)}` : "Not uploaded"}</td>
                    <td className="td text-right">
                      {item?.checked ? (
                        <Pill tone="ok">Checked by {staffName(dr, item.checked.by).split(" ")[0]}</Pill>
                      ) : item && can("review") ? (
                        <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/checkKyc", appId: app.id, item: k })}>
                          Mark checked
                        </button>
                      ) : (
                        <Pill tone="warn">{item ? "To check" : "Missing"}</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="td font-medium">NDA</td>
                <td className="td text-[13px] text-slate">{v?.nda ? `${v.nda.version}, signed by ${v.nda.name}, ${v.nda.title}, ${fmtStamp(v.nda.at)}${v.nda.uploaded ? " (uploaded PDF)" : ""}` : "Not signed"}</td>
                <td className="td text-right">{v?.nda ? <Pill tone="ok">Signed</Pill> : <Pill tone="warn">Missing</Pill>}</td>
              </tr>
              <tr>
                <td className="td font-medium">Sanctions screening</td>
                <td className="td text-[13px] text-slate">{v?.sanctions ? `${v.sanctions.result}${v.sanctions.note ? `: ${v.sanctions.note}` : ""}, ${staffName(dr, v.sanctions.by)}` : "Not entered"}</td>
                <td className="td text-right">{v?.sanctions ? <Pill tone={v.sanctions.result === "Clear" ? "ok" : "bad"}>{v.sanctions.result}</Pill> : <Pill tone="warn">Missing</Pill>}</td>
              </tr>
              <tr>
                <td className="td font-medium">Decision-maker</td>
                <td className="td text-[13px] text-slate">
                  {app.decisionMaker.name}, {app.decisionMaker.title}
                </td>
                <td className="td text-right">
                  {app.decisionMaker.confirmed ? (
                    <Pill tone="ok">Confirmed</Pill>
                  ) : can("review") ? (
                    <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/confirmDecisionMaker", appId: app.id })}>
                      Confirm
                    </button>
                  ) : (
                    <Pill tone="warn">To confirm</Pill>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </Section>
        {can("review") && app.status !== "Lead" && app.status !== "Invited" && app.status !== "Draft" && (
          <Section title="Enter the sanctions screening result">
            <div className="flex flex-wrap items-center gap-2">
              <select className="input h-9 w-auto" value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
                <option>Clear</option>
                <option>Match found</option>
              </select>
              <input className="input h-9 flex-1 min-w-48" placeholder="Note, for example the list and the date screened" value={snote} onChange={(e) => setSnote(e.target.value)} />
              <button className="btn-secondary btn-sm" onClick={() => { dispatch({ type: "dr/sanctions", appId: app.id, result, note: snote }); setSnote(""); }}>
                Save result
              </button>
            </div>
          </Section>
        )}
      </div>
      <Section title="Verification" action={<DecisionPill app={app} />}>
        {v?.decided && (
          <p className="mb-3 text-[14px]">
            {v.state} by {staffName(dr, v.decided.by)}, {fmtStamp(v.decided.at)}: {v.decided.reason}
          </p>
        )}
        {blockers.length > 0 && (
          <ul className="mb-3 text-[13px] text-slate space-y-0.5">
            {blockers.map((b) => (
              <li key={b}>· {b}</li>
            ))}
          </ul>
        )}
        {can("decide") && ["In review", "Decided", "Information requested", "Submitted"].includes(app.status) ? (
          <div className="space-y-2">
            <textarea className="input min-h-16" placeholder="Reason, recorded with the decision" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-primary btn-sm" disabled={!reason.trim() || blockers.length > 0 || v?.state === "Verified"} onClick={() => { dispatch({ type: "dr/verify", appId: app.id, outcome: "Verified", reason }); setReason(""); }}>
                Verify
              </button>
              <button className="btn-secondary btn-sm text-bad" disabled={!reason.trim() || v?.state === "Declined"} onClick={() => { dispatch({ type: "dr/verify", appId: app.id, outcome: "Declined", reason }); setReason(""); }}>
                Decline
              </button>
            </div>
            <p className="text-[12px] text-slate">Verified opens the teaser directory and issues a Deal Room badge. Verify needs every KYC item checked, a clear screening, the NDA and a confirmed decision-maker.</p>
          </div>
        ) : (
          <p className="text-[13px] text-slate">{can("review") ? "A decider records verification." : ""}</p>
        )}
      </Section>
    </div>
  );
}

/* ---------- re-review (DR-5) ---------- */

function ReReview({ app }: { app: DrApplication }) {
  const { can, dispatch } = useDr();
  const [note, setNote] = useState("");
  return (
    <Banner tone="warn">
      Changed after the decision ({app.reReview!.fields.join(", ")}) on {fmtStamp(app.reReview!.at)}. The decision stands until a new one is recorded; meanwhile this record is out of matching.
      {can("review") && (
        <span className="mt-2 flex flex-wrap gap-2">
          <input className="input h-8 w-72 text-[13px]" placeholder="Why the decision still stands" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-secondary btn-sm" disabled={!note.trim()} onClick={() => dispatch({ type: "dr/reReviewDone", appId: app.id, note })}>
            Decision stands
          </button>
          <span className="text-[13px] text-slate self-center">or record a new decision.</span>
        </span>
      )}
    </Banner>
  );
}

/* ---------- history (append-only) ---------- */

function History({ app }: { app: DrApplication }) {
  const { dr } = useDr();
  return (
    <Section title="Activity, oldest first" flush>
      <ul>
        {app.history.map((h, i) => (
          <li key={i} className="grid grid-cols-[170px_160px_1fr] gap-3 px-5 py-2.5 border-b border-line last:border-0 text-[13px]">
            <When at={h.at} />
            <span className="text-slate">{staffName(dr, h.by)}</span>
            <span>{h.what}</span>
          </li>
        ))}
      </ul>
      <p className="px-5 py-3 text-[12px] text-slate">Nothing here is edited: a decision, score or status change is only ever superseded by a later entry.</p>
    </Section>
  );
}

/* ---------- support access (DL-11) ---------- */

function SupportGrant({ app }: { app: DrApplication }) {
  const { dr, dispatch, me } = useDr();
  const [to, setTo] = useState("Algotech support");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);
  const grants = dr.grants.filter((g) => g.appId === app.id);
  if (!canSeeInternal(me)) return null;
  return (
    <details className="mt-6 surface p-4 text-[14px]">
      <summary className="cursor-pointer font-medium">Support access for Algotech {grants.length > 0 && `(${grants.length} granted)`}</summary>
      <p className="mt-2 text-slate">Algotech cannot open a participant&apos;s file without a time-limited grant from the lead; every opening is logged.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className="input h-9 w-48" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Grant to" />
        <input className="input h-9 flex-1 min-w-48" placeholder="Reason, for example the support ticket" value={reason} onChange={(e) => setReason(e.target.value)} />
        <select className="input h-9 w-auto" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          <option value={4}>4 hours</option>
          <option value={24}>24 hours</option>
          <option value={72}>3 days</option>
        </select>
        <button className="btn-secondary btn-sm" disabled={!reason.trim()} onClick={() => { dispatch({ type: "dr/grantSupport", appId: app.id, to, reason, hours }); setReason(""); }}>
          Grant
        </button>
      </div>
      {grants.map((g) => (
        <div key={g.id} className="mt-2 text-[13px] text-slate">
          {g.to} until {fmtStamp(g.expires)}: {g.reason} ({staffName(dr, g.by)})
        </div>
      ))}
      <p className="mt-2 text-[12px]">
        <Link href="/admin/deal-room" className="link">
          Algotech&apos;s view
        </Link>
      </p>
    </details>
  );
}
