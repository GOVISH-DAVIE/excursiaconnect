"use client";

/**
 * One application, for its reviewers, on the API (backend-plan.md, M1.3: the first half of review). The prototype's
 * own review screen, ported: the same tabs, rubric and wording, but every number comes from the server and every
 * button is a use case the server checks against the same rules. Decisions, readiness, the fee, the teaser and
 * verification come with M1.6.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import type { ReviewView } from "@excursia/contracts/review";
import { DOC_KINDS } from "@excursia/contracts/review";
import { Empty, KV, PageHeader, Section, Tabs } from "@/components/ui";
import { compact, eligibility, latestScore, missionName, openRfi, qualified, readinessScore, rfiDue, rfiExpired, staffName, trackName, weighted } from "@excursia/domain/dealroom/logic";
import type { DealRoomState, DrApplication, DrConfig, DrStaff, Layer } from "@excursia/domain/dealroom/types";
import { fmtStamp } from "@excursia/domain/time";
import { DecisionPill, DocLine, Labeled, ReadinessPill, StatusPill, typeLabel } from "@/app/dealroom/bits";
import { useOpenDocument, useReview, useReviewAction, type ReviewAction } from "@/features/dealroom/hooks/use-review";

/** What the tabs need, from the server's view: the record, the rules' config and clock, who's who, and what I may do. */
type Ctx = {
  app: DrApplication;
  cfg: DrConfig;
  dr: Pick<DealRoomState, "staff">;
  now: string;
  can: ReviewView["can"];
  act: (a: ReviewAction, after?: () => void) => void;
  pending: boolean;
  error: Error | null;
  open: (docId: string) => void;
  openError: Error | null;
};
const ReviewCtx = createContext<Ctx | null>(null);
const useCtx = () => useContext(ReviewCtx)!;

const TABS = ["Assessment", "Application", "Requests", "History"] as const;
type Tab = (typeof TABS)[number];

export function Review({ eventId, appId }: { eventId: string; appId: string }) {
  const view = useReview(eventId, appId);
  const action = useReviewAction(eventId, appId);
  const openDoc = useOpenDocument(eventId, appId);
  const [tab, setTab] = useState<Tab>("Assessment");
  if (view.isPending) return <Empty>Loading…</Empty>;
  if (view.isError) return <Empty>{view.error.message}</Empty>;

  const v = view.data;
  const app = v.application as unknown as DrApplication;
  // the rules' helpers read these parts of the config, so the view's parts stand in for the whole
  const cfg = { rubric: v.config.rubric, rules: { rfiDays: v.config.rfiDays }, missions: v.config.missions, tracks: v.config.tracks } as unknown as DrConfig;
  const ctx: Ctx = {
    app,
    cfg,
    dr: { staff: v.staff as unknown as DrStaff[] },
    now: v.now,
    can: v.can,
    act: (a, after) => action.mutate(a, { onSuccess: () => after?.() }),
    pending: action.isPending,
    error: action.error,
    open: (docId) => openDoc.mutate(docId),
    openError: openDoc.error,
  };
  const rfi = openRfi(app);
  const expired = rfi && rfiExpired(rfi, cfg, v.now);

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
      {rfi && (
        <Banner tone={expired ? "bad" : "warn"}>
          Information requested {fmtStamp(rfi.at)}, {expired ? <b className="font-medium">expired {fmtStamp(rfiDue(rfi, cfg), false)}</b> : `due ${fmtStamp(rfiDue(rfi, cfg), false)}`}.{" "}
          {expired && (v.can.decideExpiry ? <RfiExpiry /> : <span>The lead decides what happens next.</span>)}
        </Banner>
      )}

      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ Requests: app.rfis.filter((r) => !r.response && !r.expiry).length }} />
      {tab === "Assessment" && <Assessment />}
      {tab === "Application" && <ApplicationTab />}
      {tab === "Requests" && <Requests />}
      {tab === "History" && <History />}
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
  const { app, openError } = useCtx();
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
      <Section title="Decision-maker">
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
