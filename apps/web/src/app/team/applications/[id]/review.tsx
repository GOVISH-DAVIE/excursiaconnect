"use client";

/**
 * One application, for its reviewers, on the API (backend-plan.md, M1.3: the first half of review). The prototype's
 * own review screen, ported: the same tabs, rubric and wording, but every number comes from the server and every
 * button is a use case the server checks against the same rules. M1.6 adds the Decision tab (recommend or decide,
 * the second decider, conditions, readiness) and, for providers, the Verification tab. The fee's waiver and payment
 * come with M1.7; the teaser and what happens in the Deal Room come later.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import type { ReviewView } from "@excursia/contracts/review";
import { DOC_KINDS } from "@excursia/contracts/review";
import { Empty, KV, PageHeader, Section, Tabs } from "@/components/ui";
import {
  DECISIONS, compact, decisionOf, eligibility, feeInKes, feeLabel, feeOwed, latestScore, missionName, openRfi, pendingSecond, qualified, readinessBlockers, readinessScore, rfiDue,
  rfiExpired, staffName, trackName, verificationBlockers, weighted,
} from "@excursia/domain/dealroom/logic";
import type { DealRoomState, Decision, DrApplication, DrConfig, DrStaff, Layer, Readiness } from "@excursia/domain/dealroom/types";
import { fmtStamp } from "@excursia/domain/time";
import { DecisionPill, DocLine, Labeled, Pill, ReadinessPill, StatusPill, typeLabel } from "@/app/dealroom/bits";
import { useOpenDocument, useReview, useReviewAction, type ReviewAction } from "@/features/dealroom/hooks/use-review";

/** What the tabs need, from the server's view: the record, the rules' config and clock, who's who, and what I may do. */
type Ctx = {
  app: DrApplication;
  cfg: DrConfig;
  dr: Pick<DealRoomState, "staff">;
  now: string;
  /** the signed-in staff member's id: a second decider must be someone else */
  me: string;
  can: ReviewView["can"];
  act: (a: ReviewAction, after?: () => void) => void;
  pending: boolean;
  error: Error | null;
  open: (docId: string) => void;
  openError: Error | null;
};
const ReviewCtx = createContext<Ctx | null>(null);
const useCtx = () => useContext(ReviewCtx)!;

// a seeker is scored and decided; a provider (capital, partner, challenge) is verified
const SEEKER_TABS = ["Assessment", "Application", "Requests", "Decision", "History"] as const;
const PROVIDER_TABS = ["Verification", "Application", "Requests", "History"] as const;
type Tab = (typeof SEEKER_TABS)[number] | (typeof PROVIDER_TABS)[number];

export function Review({ eventId, appId }: { eventId: string; appId: string }) {
  const view = useReview(eventId, appId);
  const action = useReviewAction(eventId, appId);
  const openDoc = useOpenDocument(eventId, appId);
  const [tab, setTab] = useState<Tab | null>(null);
  if (view.isPending) return <Empty>Loading…</Empty>;
  if (view.isError) return <Empty>{view.error.message}</Empty>;

  const v = view.data;
  const app = v.application as unknown as DrApplication;
  // the rules' helpers read these parts of the config, so the view's parts stand in for the whole
  const cfg = { rubric: v.config.rubric, rules: { rfiDays: v.config.rfiDays }, missions: v.config.missions, tracks: v.config.tracks, secondReview: v.config.secondReview } as unknown as DrConfig;
  const ctx: Ctx = {
    app,
    cfg,
    dr: { staff: v.staff as unknown as DrStaff[] },
    now: v.now,
    me: v.me.id,
    can: v.can,
    act: (a, after) => action.mutate(a, { onSuccess: () => after?.() }),
    pending: action.isPending,
    error: action.error,
    open: (docId) => openDoc.mutate(docId),
    openError: openDoc.error,
  };
  const rfi = openRfi(app);
  const expired = rfi && rfiExpired(rfi, cfg, v.now);
  const second = pendingSecond(app);
  const tabs: readonly Tab[] = app.type === "provider" ? PROVIDER_TABS : SEEKER_TABS;
  const shown: Tab = tab && tabs.includes(tab) ? tab : tabs[0];

  return (
    <ReviewCtx.Provider value={ctx}>
      <PageHeader
        crumbs={[{ href: "/team/applications", label: "Review queue" }, { label: app.ref ?? app.org.name }]}
        title={app.org.name || "Untitled application"}
        badge={
          <span className="flex flex-wrap gap-1">
            <StatusPill app={app} />
            <DecisionPill app={app} />
            <ReadinessPill app={app} />
          </span>
        }
        kicker={`${app.ref ?? "Not submitted"} · ${typeLabel(app)} · ${missionName(cfg, app.mission)}${app.track ? `, ${trackName(cfg, app.track)}` : ""} · reviewer ${app.assignee ? staffName(ctx.dr as DealRoomState, app.assignee) : "not assigned"}`}
        actions={
          app.status === "Submitted" && v.can.review ? (
            <button className="btn-primary" disabled={action.isPending} onClick={() => ctx.act({ kind: "start" })}>
              Start review
            </button>
          ) : undefined
        }
      />
      {action.error && <Banner tone="bad">{action.error.message}</Banner>}
      {["Lead", "Invited", "Draft"].includes(app.status) && <Banner tone="mute">The applicant is still drafting. Nothing is reviewed until it is submitted.</Banner>}
      {second && (
        <Banner tone="warn">
          {staffName(ctx.dr as DealRoomState, second.by)} decided <b className="font-medium">{second.decision}</b> on {fmtStamp(second.at)}: &ldquo;{second.reason}&rdquo;. It takes effect, and the applicant is told, when a second, different decider confirms.{" "}
          {v.can.decide && v.me.id !== second.by ? (
            <button className="btn-primary btn-sm ml-2" disabled={action.isPending} onClick={() => ctx.act({ kind: "confirmSecond" })}>
              Confirm as second decider
            </button>
          ) : (
            <span className="text-slate">{v.me.id === second.by ? "You made this decision; someone else must confirm it." : "Only a decider can confirm."}</span>
          )}
        </Banner>
      )}
      {rfi && (
        <Banner tone={expired ? "bad" : "warn"}>
          Information requested {fmtStamp(rfi.at)}, {expired ? <b className="font-medium">expired {fmtStamp(rfiDue(rfi, cfg), false)}</b> : `due ${fmtStamp(rfiDue(rfi, cfg), false)}`}.{" "}
          {expired && (v.can.decideExpiry ? <RfiExpiry /> : <span>The lead decides what happens next.</span>)}
        </Banner>
      )}

      <Tabs tabs={tabs} value={shown} onChange={setTab} counts={{ Requests: app.rfis.filter((r) => !r.response && !r.expiry).length }} />
      {shown === "Assessment" && <Assessment />}
      {shown === "Verification" && <VerificationTab />}
      {shown === "Application" && <ApplicationTab />}
      {shown === "Requests" && <Requests />}
      {shown === "Decision" && <DecisionTab />}
      {shown === "History" && <History />}
    </ReviewCtx.Provider>
  );
}

function Banner({ tone, children }: { tone: "warn" | "bad" | "mute"; children: ReactNode }) {
  const c = { warn: "bg-warn-50 text-ink border-warn/30", bad: "bg-bad-50 text-ink border-bad/30", mute: "bg-paper text-ink border-line" }[tone];
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={`mb-3 rounded-lg border px-4 py-3 text-[14px] ${c}`}>
      {children}
    </div>
  );
}

/* ---------- scoring ---------- */

function Assessment() {
  const { app, cfg, can } = useCtx();
  const el = eligibility(app, cfg);
  const w = weighted(app, cfg);
  const rs = readinessScore(app, cfg);
  const scorable = can.review && ["Submitted", "In review", "Information requested", "Decided"].includes(app.status);
  return (
    <div className="space-y-4">
      <Section title="Eligibility, pass or fail" action={<span className="text-[13px] text-slate">{el.passed} pass, {el.failed} fail, {el.missing} not checked</span>} flush>
        <Rows layer="eligibility" items={cfg.rubric.eligibility} editable={scorable} />
      </Section>
      <Section title="Assessment, 0 to 100, weighted" action={<span className="text-[13px] text-slate">Weighted score {w ?? "– (not every criterion scored)"}</span>} flush>
        <Rows layer="assessment" items={cfg.rubric.assessment.map((c) => ({ id: c.id, text: `${c.text} · ${c.weight}%` }))} editable={scorable} />
      </Section>
      <Section title="Readiness" action={<span className="text-[13px] text-slate">{qualified(app) ? `Average ${rs ?? "– (not every criterion scored)"}` : "Scored once approved"}</span>} flush>
        <Rows layer="readiness" items={cfg.rubric.readiness} editable={scorable && qualified(app)} />
      </Section>
      <p className="text-[13px] text-slate">A score rests on a document; with no document it needs a written note. A new score supersedes the last, which stays in History.</p>
    </div>
  );
}

function Rows({ layer, items, editable }: { layer: Layer; items: { id: string; text: string }[]; editable: boolean }) {
  const { app, dr } = useCtx();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="divide-y divide-line">
      {items.map((c) => {
        const a = latestScore(app, layer, c.id);
        const older = app.assessments.filter((x) => x.layer === layer && x.criterion === c.id).length - (a ? 1 : 0);
        const doc = a?.docId ? app.documents.find((d) => d.id === a.docId) : undefined;
        return (
          <div key={c.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[42%_1fr_auto] sm:items-start sm:px-5">
            <div>
              <div className="text-[14px] font-medium">{c.text}</div>
              {older > 0 && <div className="text-[12px] text-slate">{older} earlier score{older > 1 ? "s" : ""} superseded</div>}
            </div>
            <div>
              {open === c.id ? (
                <ScoreForm layer={layer} criterion={c.id} onDone={() => setOpen(null)} />
              ) : a ? (
                <div className="text-[13px]">
                  <span className="num text-[15px] font-medium">{layer === "eligibility" ? (a.pass ? "Pass" : "Fail") : a.score}</span>
                  <span className="text-slate">
                    {" "}
                    · {doc ? `rests on ${doc.kind}` : a.note ? `note: ${a.note}` : ""} · {staffName(dr as DealRoomState, a.by)}, {fmtStamp(a.at)}
                  </span>
                </div>
              ) : (
                <span className="text-[13px] text-slate">Not scored</span>
              )}
            </div>
            <div className="sm:text-right">
              {editable && open !== c.id && (
                <button className="link text-[13px]" onClick={() => setOpen(c.id)}>
                  {a ? "Rescore" : "Score"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreForm({ layer, criterion, onDone }: { layer: Layer; criterion: string; onDone: () => void }) {
  const { app, act, pending } = useCtx();
  const [pass, setPass] = useState<boolean | null>(null);
  const [score, setScore] = useState("");
  const [docId, setDocId] = useState("");
  const [note, setNote] = useState("");
  const missingEvidence = layer !== "eligibility" && !docId && !note.trim();
  const bad = layer === "eligibility" ? pass === null : score === "" || Number(score) < 0 || Number(score) > 100 || missingEvidence;
  return (
    <form
      className="grid items-start gap-2 sm:grid-cols-[110px_1fr]"
      onSubmit={(e) => {
        e.preventDefault();
        if (bad) return;
        act(
          {
            kind: "score",
            input: { layer, criterion, pass: layer === "eligibility" ? pass! : undefined, score: layer === "eligibility" ? undefined : Number(score), docId: docId || undefined, note: note.trim() || undefined },
          },
          onDone,
        );
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
        <input className="input h-9" type="number" min={0} max={100} inputMode="numeric" placeholder="0 to 100" aria-label="Score" value={score} onChange={(e) => setScore(e.target.value)} />
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
          <button className="btn-primary btn-sm" disabled={bad || pending}>
            {pending ? "Saving…" : "Save score"}
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

function Doc({ doc }: { doc: DrApplication["documents"][number] }) {
  const { open } = useCtx();
  return (
    <DocLine doc={doc}>
      <button className="btn-secondary btn-sm shrink-0" onClick={() => open(doc.id)}>
        Download
      </button>
    </DocLine>
  );
}

function ApplicationTab() {
  const { app, openError, can, act, pending } = useCtx();
  const drafting = ["Lead", "Invited", "Draft"].includes(app.status);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Organisation">
        <KV
          rows={[
            ["Legal name", app.org.name],
            ["Registration", app.org.regNo || "–"],
            ["Country", app.org.country || "–"],
            ["Sector", app.org.sector || "–"],
            ["Website", app.org.website || "–"],
            ["Applicant", `${app.contact.name || "–"}, ${app.contact.email}, ${app.contact.phone || "–"}`],
          ]}
        />
      </Section>
      <Section
        title="Decision-maker"
        action={
          app.decisionMaker.confirmed ? (
            <Pill tone="ok">Confirmed</Pill>
          ) : can.review && !drafting && app.decisionMaker.name ? (
            <button className="btn-secondary btn-sm" disabled={pending} onClick={() => act({ kind: "confirmDecisionMaker" })}>
              Confirm
            </button>
          ) : null
        }
      >
        <KV rows={[["Name", app.decisionMaker.name || "–"], ["Title", app.decisionMaker.title || "–"], ["Email", app.decisionMaker.email || "–"], ["Phone", app.decisionMaker.phone || "–"]]} />
      </Section>
      {app.type === "seeker" ? (
        <Section title="The ask">
          {app.ask ? (
            <KV
              rows={[
                ["Amount", compact(app.ask.amount, app.ask.currency)],
                ["Pathway", app.ask.instrument],
                ["Stage", app.ask.stage],
                ["Use of funds", app.ask.useOfFunds],
                ["Revenue", app.traction?.revenueBand || "–"],
                ["Customers", app.traction?.customers || "–"],
                ["Metrics", app.traction?.metrics || "–"],
              ]}
            />
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
          <Section title={app.challenge ? "Who could solve it" : "Mandate"}>
            {app.mandate ? (
              <KV
                rows={[
                  ["Sectors", app.mandate.sectors.join(", ") || "–"],
                  ["Countries", app.mandate.countries.join(", ") || "–"],
                  ["Stages", app.mandate.stages.join(", ") || "–"],
                  [app.challenge ? "Contract size" : "Ticket", `${compact(app.mandate.ticketMin, app.mandate.currency)} to ${compact(app.mandate.ticketMax, app.mandate.currency)}`],
                  ["Pathways", app.mandate.instruments.join(", ") || "–"],
                  ["Exclusions", app.mandate.exclusions.join(", ") || "None"],
                  ["Decision timeline", app.mandate.timeline || "–"],
                ]}
              />
            ) : (
              <Empty>Not filled in yet.</Empty>
            )}
          </Section>
        </>
      )}
      <Section title={`Documents, ${app.documents.length}`}>
        {app.documents.length ? app.documents.map((d) => <Doc key={d.id} doc={d} />) : <Empty>No documents yet.</Empty>}
        {openError && (
          <p role="alert" className="mt-2 text-[13px] text-bad">
            {openError.message}
          </p>
        )}
      </Section>
    </div>
  );
}

/* ---------- information requests ---------- */

function Requests() {
  const { app, cfg, dr, can, act, pending, now } = useCtx();
  const [qs, setQs] = useState("");
  const [docs, setDocs] = useState<(typeof DOC_KINDS)[number][]>([]);
  const canAsk = can.review && app.status === "In review";
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
              <li key={r.id} className="border-b border-line px-5 py-4 text-sm last:border-0">
                <div className="flex flex-wrap justify-between gap-x-3 text-[13px] text-slate">
                  <span>
                    {staffName(dr as DealRoomState, r.by)}, {fmtStamp(r.at)}
                  </span>
                  <span>{r.response ? `Answered ${fmtStamp(r.response.at)}` : r.expiry ? `Expired: ${r.expiry.how}` : rfiExpired(r, cfg, now) ? "Expired, unanswered" : `Due ${fmtStamp(rfiDue(r, cfg), false)}`}</span>
                </div>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
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
                      return d ? <Doc key={id} doc={d} /> : null;
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
              act({ kind: "request", input: { questions, docs } }, () => {
                setQs("");
                setDocs([]);
              });
            }}
          >
            <Labeled label="Questions, one per line">
              <textarea className="input min-h-24" value={qs} onChange={(e) => setQs(e.target.value)} placeholder="Please send audited accounts for 2025." />
            </Labeled>
            <div>
              <span className="label">Documents to send</span>
              <div className="flex flex-wrap gap-1.5">
                {DOC_KINDS.map((k) => (
                  <button type="button" key={k} aria-pressed={docs.includes(k)} className={`pill ${docs.includes(k) ? "bg-ink text-white" : "bg-paper-200 text-slate"}`} onClick={() => setDocs(docs.includes(k) ? docs.filter((x) => x !== k) : [...docs, k])}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn-primary" disabled={!qs.trim() || pending}>
              {pending ? "Sending…" : "Send the request"}
            </button>
            <p className="text-[12px] text-slate">The applicant is told a request is waiting, with no details, and has {cfg.rules.rfiDays} days to answer from their status page.</p>
          </form>
        ) : (
          <p className="text-[14px] text-slate">
            {app.status === "Information requested"
              ? "A request is open; another can be sent once it is answered."
              : !can.review
                ? "Your role does not review."
                : `Requests are sent while an application is in review; this one is ${app.status.toLowerCase()}.`}
          </p>
        )}
      </Section>
    </div>
  );
}

function RfiExpiry() {
  const { act, pending } = useCtx();
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
      <button className="btn-primary btn-sm" disabled={!note.trim() || pending} onClick={() => act({ kind: "expiry", input: { how, note } })}>
        Apply
      </button>
    </span>
  );
}

/* ---------- the decision (M1.6) ---------- */

function DecisionTab() {
  const { app, cfg, dr, can, act, pending } = useCtx();
  const [decision, setDecision] = useState<Decision>("Qualified");
  const [reason, setReason] = useState("");
  const [conds, setConds] = useState([{ text: "", due: "" }]);
  const current = decisionOf(app);
  const open = ["In review", "Decided", "Information requested"].includes(app.status);
  const usd = app.ask ? (app.ask.currency === "USD" ? app.ask.amount : app.ask.amount / 130) : 0;
  const needsSecond = (decision === "Declined" && cfg.secondReview.decline) || usd > cfg.secondReview.askAbove;
  const blockers = readinessBlockers(app, cfg);
  const deciders = dr.staff.filter((s) => s.canDecide).map((s) => s.name.split(" ")[0]);
  const reset = () => {
    setReason("");
    setConds([{ text: "", due: "" }]);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Section title="Decision in force">
          {current ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <DecisionPill app={app} />
                <span className="text-[13px] text-slate">
                  {staffName(dr as DealRoomState, current.by)}, {fmtStamp(current.at)}
                  {current.second && `; confirmed by ${staffName(dr as DealRoomState, current.second.by)}`}
                </span>
              </div>
              <p className="mt-2 text-[14px]">{current.reason}</p>
              {current.conditions.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {current.conditions.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-paper px-3 py-2 text-[14px]">
                      <span>
                        {c.text} <span className="text-slate">· due {fmtStamp(c.due, false)}</span>
                      </span>
                      {c.met ? (
                        <Pill tone="ok">Met {fmtStamp(c.met.at, false)}</Pill>
                      ) : can.review ? (
                        <button className="btn-secondary btn-sm" disabled={pending} onClick={() => act({ kind: "meetCondition", conditionId: c.id })}>
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

        {qualified(app) && app.fee && <FeeNote />}

        {qualified(app) && (
          <Section title="Readiness" action={<ReadinessPill app={app} />}>
            {blockers.length > 0 ? (
              <ul className="space-y-1 text-[14px]">
                {blockers.map((b) => (
                  <li key={b} className="text-slate">
                    · {b}
                    {b === "Decision-maker not confirmed" && ": confirm them on the Application tab"}
                    {b.startsWith("No score") && ": score it on the Assessment tab"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-slate">Every readiness score is in, the decision-maker is confirmed and no condition is open.</p>
            )}
            {can.readiness && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(["Not ready", "In preparation", "Deal Room Ready"] as Readiness[]).map((r) => (
                  <button
                    key={r}
                    className={app.readiness === r ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
                    disabled={pending || app.readiness === r || (r === "Deal Room Ready" && blockers.length > 0)}
                    onClick={() => act({ kind: "readiness", input: { readiness: r } })}
                  >
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
              {[...app.decisions.map((d) => ({ kind: d.needsSecond && !d.second ? "Decision, waiting for a second decider" : "Decision", ...d })), ...app.recommendations.map((r) => ({ kind: "Recommendation", ...r }))]
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((x) => (
                  <li key={x.id} className="border-b border-line px-5 py-3 text-[14px] last:border-0">
                    <div className="text-[13px] text-slate">
                      {x.kind} · {staffName(dr as DealRoomState, x.by)} · {fmtStamp(x.at)}
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

      <Section title={can.decide ? "Record a decision" : "Recommend a decision"}>
        {!open ? (
          <p className="text-[14px] text-slate">{app.status === "Submitted" ? "Start the review first; decisions are recorded once it is in review." : "Decisions are recorded once the application is in review."}</p>
        ) : !can.review ? (
          <p className="text-[14px] text-slate">Your role doesn&rsquo;t decide.</p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason.trim()) return;
              if (can.decide) act({ kind: "decide", input: { decision, reason, conditions: decision === "Conditional" ? conds.filter((c) => c.text.trim()) : [] } }, reset);
              else act({ kind: "recommend", input: { decision, reason } }, reset);
            }}
          >
            <div className="grid grid-cols-2 gap-1.5">
              {DECISIONS.map((d) => (
                <button type="button" key={d} aria-pressed={decision === d} className={decision === d ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setDecision(d)}>
                  {d}
                </button>
              ))}
            </div>
            <Labeled label={can.decide ? "Reason, shown to the applicant" : "Reason, for the decider"}>
              <textarea className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Labeled>
            {can.decide && decision === "Conditional" && (
              <div className="space-y-2">
                <span className="label">Conditions</span>
                {conds.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_140px] gap-2">
                    <input className="input h-9 text-[13px]" placeholder="What must be met" aria-label={`Condition ${i + 1}`} value={c.text} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                    <input className="input h-9 text-[13px]" type="date" aria-label={`Condition ${i + 1} due`} value={c.due} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)))} />
                  </div>
                ))}
                <button type="button" className="link text-[13px]" onClick={() => setConds([...conds, { text: "", due: "" }])}>
                  Add a condition
                </button>
              </div>
            )}
            <button className="btn-primary w-full" disabled={pending || !reason.trim() || (can.decide && decision === "Conditional" && !conds.some((c) => c.text.trim() && c.due))}>
              {pending ? "Saving…" : can.decide ? `Decide: ${decision}` : `Recommend: ${decision}`}
            </button>
            <p className="text-[12px] text-slate">
              {can.decide
                ? needsSecond
                  ? `This needs a second decider: ${decision === "Declined" ? "every decline does" : `the ask is over ${compact(cfg.secondReview.askAbove)}`}. It takes effect when a different decider confirms.`
                  : "Takes effect at once and emails the applicant. A later decision supersedes it; this one stays on record."
                : `You recommend; a decider${deciders.length ? ` (${deciders.join(", ")})` : ""} records the decision.`}
            </p>
          </form>
        )}
      </Section>
    </div>
  );
}

/** The participation fee asked for with the approval. Paying and the lead's waiver come with M1.7. */
function FeeNote() {
  const { app, dr } = useCtx();
  const f = app.fee!;
  return (
    <Section title="Participation fee" action={<Pill tone={feeOwed(app) ? "warn" : "ok"}>{f.paid ? "Paid" : f.waived ? "Waived" : "Not paid"}</Pill>}>
      <p className="text-[14px]">
        {feeLabel(f)}, asked for with the decision on {fmtStamp(f.sentAt)}.{" "}
        {f.paid
          ? `Paid by ${f.paid.method} on ${fmtStamp(f.paid.at)}, reference ${f.paid.reference}.`
          : f.waived
            ? `Waived by ${staffName(dr as DealRoomState, f.waived.by)} on ${fmtStamp(f.waived.at)}: ${f.waived.reason}`
            : `Not paid yet: no badge, and no matching or introductions until it is. By M-Pesa it would be KES ${feeInKes(f).toLocaleString("en")}.`}
      </p>
    </Section>
  );
}

/* ---------- a provider's verification (M1.6) ---------- */

const KYC = ["Registration", "Beneficial owners", "Signatory ID"] as const;

function VerificationTab() {
  const { app, dr, can, act, pending, open: openDoc, openError } = useCtx();
  const [result, setResult] = useState<"Clear" | "Match found">("Clear");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const v = app.verification;
  const blockers = verificationBlockers(app);
  const drafting = ["Lead", "Invited", "Draft"].includes(app.status);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Section title="KYC pack" flush>
          <div className="overflow-x-auto">
            <table className="w-full">
              <tbody>
                {KYC.map((k) => {
                  const item = v?.kyc[k];
                  const doc = item && app.documents.find((d) => d.id === item.docId);
                  return (
                    <tr key={k}>
                      <td className="td font-medium">{k}</td>
                      <td className="td text-[13px] text-slate">
                        {doc ? (
                          <button className="link text-left" onClick={() => openDoc(doc.id)}>
                            {doc.name}
                          </button>
                        ) : (
                          "Not uploaded"
                        )}
                        {doc && `, ${fmtStamp(doc.at, false)}`}
                      </td>
                      <td className="td text-right">
                        {item?.checked ? (
                          <Pill tone="ok">Checked by {staffName(dr as DealRoomState, item.checked.by).split(" ")[0]}</Pill>
                        ) : item && can.review ? (
                          <button className="btn-secondary btn-sm" disabled={pending} onClick={() => act({ kind: "checkKyc", input: { item: k } })}>
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
                  <td className="td text-[13px] text-slate">{v?.nda ? `${v.nda.version}, signed by ${v.nda.name}, ${v.nda.title}, ${fmtStamp(v.nda.at)}` : "Not signed"}</td>
                  <td className="td text-right">{v?.nda ? <Pill tone="ok">Signed</Pill> : <Pill tone="warn">Missing</Pill>}</td>
                </tr>
                <tr>
                  <td className="td font-medium">Sanctions screening</td>
                  <td className="td text-[13px] text-slate">{v?.sanctions ? `${v.sanctions.result}${v.sanctions.note ? `: ${v.sanctions.note}` : ""}, ${staffName(dr as DealRoomState, v.sanctions.by)}, ${fmtStamp(v.sanctions.at)}` : "Not entered"}</td>
                  <td className="td text-right">{v?.sanctions ? <Pill tone={v.sanctions.result === "Clear" ? "ok" : "bad"}>{v.sanctions.result}</Pill> : <Pill tone="warn">Missing</Pill>}</td>
                </tr>
                <tr>
                  <td className="td font-medium">Decision-maker</td>
                  <td className="td text-[13px] text-slate">{app.decisionMaker.name ? `${app.decisionMaker.name}, ${app.decisionMaker.title}` : "Not named"}</td>
                  <td className="td text-right">
                    {app.decisionMaker.confirmed ? (
                      <Pill tone="ok">Confirmed</Pill>
                    ) : can.review && !drafting && app.decisionMaker.name ? (
                      <button className="btn-secondary btn-sm" disabled={pending} onClick={() => act({ kind: "confirmDecisionMaker" })}>
                        Confirm
                      </button>
                    ) : (
                      <Pill tone="warn">To confirm</Pill>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {openError && (
            <p role="alert" className="px-5 pb-3 text-[13px] text-bad">
              {openError.message}
            </p>
          )}
        </Section>
        {can.review && !drafting && (
          <Section title="Enter the sanctions screening result">
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                act({ kind: "sanctions", input: { result, note } }, () => setNote(""));
              }}
            >
              <select className="input h-9 w-auto" aria-label="Result" value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
                <option>Clear</option>
                <option>Match found</option>
              </select>
              <input className="input h-9 min-w-48 flex-1" placeholder="Note: the lists screened and the date" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn-secondary btn-sm" disabled={pending}>
                Save result
              </button>
            </form>
            <p className="mt-2 text-[12px] text-slate">A new result replaces the last; both stay in History.</p>
          </Section>
        )}
      </div>
      <Section title="Verification" action={<DecisionPill app={app} />}>
        {v?.decided && (
          <p className="mb-3 text-[14px]">
            {v.state} by {staffName(dr as DealRoomState, v.decided.by)}, {fmtStamp(v.decided.at)}: {v.decided.reason}
          </p>
        )}
        {blockers.length > 0 && (
          <ul className="mb-3 space-y-0.5 text-[13px] text-slate">
            {blockers.map((b) => (
              <li key={b}>· {b}</li>
            ))}
          </ul>
        )}
        {can.decide && !drafting ? (
          <div className="space-y-2">
            <textarea className="input min-h-16" aria-label="Reason" placeholder="Reason, recorded with the decision" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary btn-sm" disabled={pending || !reason.trim() || blockers.length > 0 || v?.state === "Verified"} onClick={() => act({ kind: "verify", input: { outcome: "Verified", reason } }, () => setReason(""))}>
                Verify
              </button>
              <button className="btn-secondary btn-sm text-bad" disabled={pending || !reason.trim() || v?.state === "Declined"} onClick={() => act({ kind: "verify", input: { outcome: "Declined", reason } }, () => setReason(""))}>
                Decline
              </button>
            </div>
            <p className="text-[12px] text-slate">Verifying opens the Deal Room to them and issues their Deal Room badge. It needs every KYC item checked, a clear screening, the NDA and a confirmed decision-maker.</p>
          </div>
        ) : (
          <p className="text-[13px] text-slate">{drafting ? "The applicant is still drafting." : can.review ? "A decider records the verification." : ""}</p>
        )}
      </Section>
    </div>
  );
}

function History() {
  const { app, dr } = useCtx();
  return (
    <Section title="History" flush>
      <ul>
        {[...app.history].reverse().map((h, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-x-4 border-b border-line px-5 py-3 text-[14px] last:border-0">
            <span>{h.what}</span>
            <span className="text-[13px] text-slate">
              {staffName(dr as DealRoomState, h.by)}, {fmtStamp(h.at)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
