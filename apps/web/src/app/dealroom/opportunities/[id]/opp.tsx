"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, PageHeader, Section } from "@/components/ui";
import { CLOSE_REASONS, COMMITMENT_TIERS, OPEN_STAGES, OUTCOME_NEEDS, PATHWAYS, STAGE_EVIDENCE, canSeeInternal, compact, drCan, oppOpen, oppOverdue, oppParties, oppStalled, staffName } from "@excursia/domain/dealroom/logic";
import type { CloseReason, Currency, DrDocument, DrOpportunity, Instrument, OppStage, OutcomeKind } from "@excursia/domain/dealroom/types";
import { fmtStamp } from "@excursia/domain/time";
import { DocLine, Labeled, Refusal, UploadDoc, When, useDr } from "../../bits";
import { OppStagePill, oppTitle } from "../parts";

const STAGES: OppStage[] = ["Follow-up", "Diligence", "Negotiation", "Closed – won", "Closed – lost"];
const INSTRUMENTS: Instrument[] = PATHWAYS;
// the tiers that rest on a signed document and carry an amount
const SIGNED_TIERS: OutcomeKind[] = ["Signed commitment", "Approved, not disbursed", "Deployed"];

/** One opportunity: its stage with the evidence for each, the outcomes recorded separately, updates and requests (PRD Conversion). */
export function OpportunityDetail({ id }: { id: string }) {
  const { dr, cfg, me, now, hydrated, state } = useDr();
  const o = dr.opportunities.find((x) => x.id === id);
  if (!o || !cfg) return <Empty>{hydrated ? "No such opportunity." : "Loading…"}</Empty>;
  if (!canSeeInternal(me, o.owner)) return <Refusal title="This opportunity is not yours">It belongs to {staffName(dr, o.owner)}. The lead sees every opportunity.</Refusal>;
  const { seeker, provider } = oppParties(dr, o);
  const meeting = dr.meetings.find((m) => m.id === o.meetingId);
  const room = state.rooms.find((r) => r.id === meeting?.roomId);
  const works = !dr.archivedAt && (me?.role === "Lead" || me?.id === o.owner);
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/dealroom/opportunities", label: "Opportunities" }, { label: oppTitle(dr, o) }]}
        title={oppTitle(dr, o)}
        badge={<OppStagePill stage={o.stage} />}
        kicker={
          <>
            From the meeting of{" "}
            {meeting ? (
              <Link className="link" href={drCan(me, "schedule") ? `/dealroom/meetings?meeting=${meeting.id}` : `/dealroom/matches/${o.matchId}`}>
                {fmtStamp(meeting.start)}
                {room ? `, ${room.name}` : ""}
              </Link>
            ) : (
              "the summit"
            )}
            . Owned by {staffName(dr, o.owner)}.
          </>
        }
      />
      {dr.archivedAt && <p className="mb-4 rounded-lg bg-paper-200 px-4 py-3 text-[14px]">Archived {fmtStamp(dr.archivedAt, false)}: read-only.</p>}
      {!dr.archivedAt && oppOpen(o) && (oppOverdue(o, now) || oppStalled(o, now)) && (
        <p className="mb-4 rounded-lg bg-warn-50 px-4 py-3 text-[14px] text-warn">
          {oppOverdue(o, now) ? `The next action was due ${fmtStamp(o.due, false)}. ` : ""}
          {oppStalled(o, now) ? "Nothing has moved for over 30 days; the lead may reassign it at the monthly review." : ""}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <Stages o={o} works={works} />
          <Outcomes o={o} works={works} />
          <Updates o={o} works={works} />
        </div>
        <div className="min-w-0 space-y-4">
          <NextAction o={o} works={works} />
          <Section title="Parties">
            {[seeker, provider].map(
              (a) =>
                a && (
                  <div key={a.id} className="py-2 border-b border-line last:border-0 text-[14px]">
                    <Link href={`/dealroom/applications/${a.id}`} className="font-medium hover:underline">
                      {a.org.name}
                    </Link>
                    <div className="text-[13px] text-slate">
                      {a.type === "seeker" ? `Seeker, asks ${compact(a.ask!.amount, a.ask!.currency)} ${a.ask!.instrument.toLowerCase()}` : a.providerKind}. {a.decisionMaker.name}, {a.decisionMaker.title}.
                    </div>
                  </div>
                ),
            )}
            <Link href={`/dealroom/matches/${o.matchId}`} className="link mt-2 inline-block text-[13px]">
              The match and its brief
            </Link>
          </Section>
          {works && oppOpen(o) && <Close o={o} />}
          <Section title="Monthly reviews">
            {o.reviews.length === 0 ? (
              <p className="text-[14px] text-slate">Not reviewed yet.</p>
            ) : (
              <ul className="text-[14px]">
                {o.reviews.map((r) => (
                  <li key={r.month} className="py-1.5">
                    {new Date(r.month + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}: {staffName(dr, r.by)}, {fmtStamp(r.at, false)}
                    {r.note && r.note !== "Monthly review" ? `. ${r.note}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="History" flush>
            <ul className="max-h-80 overflow-auto">
              {[...o.history].reverse().map((h, i) => (
                <li key={i} className="px-5 py-2 border-b border-line last:border-0 text-[13px]">
                  <div className="text-slate">
                    {fmtStamp(h.at)} · {staffName(dr, h.by)}
                  </div>
                  <div>{h.what}</div>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}

function Stages({ o, works }: { o: DrOpportunity; works: boolean }) {
  const { dispatch } = useDr();
  const options = [...OPEN_STAGES, "Closed – won" as OppStage].filter((s) => s !== o.stage);
  const [to, setTo] = useState<OppStage>(options[0]);
  const [evidence, setEvidence] = useState("");
  const committed = o.outcomes.some((x) => SIGNED_TIERS.includes(x.kind));
  const refuse = to === "Closed – won" && !committed ? "Record the signed commitment first: an indicative one is not enough to call it won." : (to === "Diligence" || to === "Negotiation") && !evidence.trim() ? `Needs ${STAGE_EVIDENCE[to].toLowerCase()}.` : "";
  return (
    <Section title="Stage">
      <ol className="grid gap-2 sm:grid-cols-5">
        {STAGES.filter((s) => s !== "Closed – lost" || o.stage === "Closed – lost")
          .filter((s) => s !== "Closed – won" || o.stage !== "Closed – lost")
          .map((s) => {
            const at = o.stageDates[s];
            return (
              <li key={s} className="text-[12px]">
                <span className={`block h-1.5 rounded-full ${at ? (s === "Closed – lost" ? "bg-slate" : "bg-ok") : "bg-paper-200"}`} />
                <span className={`mt-1.5 block font-medium ${at ? "text-ink" : "text-slate"}`}>{s}</span>
                <span className="block text-slate">{at ? fmtStamp(at, false) : STAGE_EVIDENCE[s]}</span>
                {at && o.stageEvidence?.[s] && <span className="block text-slate">{o.stageEvidence[s]}</span>}
              </li>
            );
          })}
      </ol>
      {o.closed && (
        <p className="mt-3 text-[14px]">
          Closed as lost: <b className="font-medium">{o.closed.reason}</b>. {o.closed.note}
        </p>
      )}
      {works && oppOpen(o) && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
            <select className="input h-9 text-[13px]" aria-label="Move to" value={to} onChange={(e) => setTo(e.target.value as OppStage)}>
              {options.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <input className="input h-9 text-[13px]" placeholder={STAGE_EVIDENCE[to]} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
            <button className="btn-primary btn-sm" disabled={!!refuse} onClick={() => { dispatch({ type: "dr/oppStage", oppId: o.id, stage: to, evidence }); setEvidence(""); }}>
              Move to {to}
            </button>
          </div>
          {refuse && <p className="mt-2 text-[13px] text-slate">{refuse}</p>}
        </div>
      )}
    </Section>
  );
}

/** The paper's five tiers: expression of interest, indicative, signed, approved but not disbursed, deployed. Kept apart, never merged. */
function Outcomes({ o, works }: { o: DrOpportunity; works: boolean }) {
  const { dr, dispatch, now } = useDr();
  const { seeker } = oppParties(dr, o);
  const [kind, setKind] = useState<OutcomeKind>("Indicative commitment");
  const [f, setF] = useState({ amount: "", currency: (seeker?.ask?.currency ?? "USD") as Currency, instrument: (seeker?.ask?.instrument ?? "Debt and credit") as Instrument, date: now.slice(0, 10), evidence: "" });
  const [doc, setDoc] = useState<DrDocument | null>(null);
  const money = SIGNED_TIERS.includes(kind);
  const evidence = doc ? doc.name : f.evidence;
  const missing = !f.date ? "a date" : f.date > now.slice(0, 10) ? "a date that has passed" : money && !(Number(f.amount) > 0) ? "the amount" : !evidence.trim() ? (money ? "the signed document or evidence" : "how it was expressed") : "";
  return (
    <Section title="Outcomes" action={<span className="text-[12px] text-slate">Recorded separately, never merged</span>}>
      {o.outcomes.length === 0 ? (
        <p className="text-[14px] text-slate">None recorded yet.</p>
      ) : (
        <ul>
          {o.outcomes.map((x) => (
            <li key={x.id} className="py-2 border-b border-line last:border-0 text-[14px] flex flex-wrap justify-between gap-2">
              <span>
                <b className="font-medium">{x.kind}</b>
                {x.amount ? `, ${compact(x.amount, x.currency)}` : ""}
                {x.instrument ? ` ${x.instrument.toLowerCase()}` : ""}
                <span className="block text-[13px] text-slate">{x.evidence}</span>
              </span>
              <span className="text-[12px] text-slate">
                Dated {fmtStamp(x.date, false)} · {staffName(dr, x.by)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {works && !o.closed && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Labeled label="Outcome">
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as OutcomeKind)}>
                {COMMITMENT_TIERS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Labeled>
            <Labeled label={money ? "Amount" : "Amount, if named"}>
              <input className="input" type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            </Labeled>
            <Labeled label="Currency">
              <select className="input" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}>
                <option>USD</option>
                <option>KES</option>
              </select>
            </Labeled>
            {kind === "Signed commitment" && (
              <Labeled label="Pathway">
                <select className="input" value={f.instrument} onChange={(e) => setF({ ...f, instrument: e.target.value as Instrument })}>
                  {INSTRUMENTS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Labeled>
            )}
            <Labeled label="Dated">
              <input className="input" type="date" max={now.slice(0, 10)} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </Labeled>
            <Labeled label="Evidence" span>
              {doc ? (
                <DocLine doc={doc}>
                  <button className="btn-quiet" onClick={() => setDoc(null)}>
                    Remove
                  </button>
                </DocLine>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input className="input flex-1 min-w-48" placeholder={money ? "Or describe it" : "Email, call note, letter"} value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} />
                  {money && <UploadDoc kind={kind === "Deployed" ? "Disbursement evidence" : "Commitment letter"} at={now} label="Attach the document" onDone={setDoc} />}
                </div>
              )}
            </Labeled>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              className="btn-primary btn-sm"
              disabled={!!missing}
              onClick={() => {
                dispatch({ type: "dr/oppOutcome", oppId: o.id, outcome: { kind, amount: Number(f.amount) || undefined, currency: Number(f.amount) || money ? f.currency : undefined, instrument: kind === "Signed commitment" ? f.instrument : undefined, date: f.date, evidence } });
                setF({ ...f, amount: "", evidence: "" });
                setDoc(null);
              }}
            >
              Record {kind.toLowerCase()}
            </button>
            <span className="text-[13px] text-slate">{missing ? `Needs ${missing}.` : OUTCOME_NEEDS[kind]}</span>
          </div>
        </div>
      )}
    </Section>
  );
}

function Updates({ o, works }: { o: DrOpportunity; works: boolean }) {
  const { dr, dispatch } = useDr();
  const [text, setText] = useState("");
  const open = o.requests.filter((r) => !r.answeredAt);
  return (
    <Section title="Updates">
      {o.updates.length === 0 ? (
        <p className="text-[14px] text-slate">No updates yet.</p>
      ) : (
        <ul>
          {[...o.updates].reverse().map((u) => (
            <li key={u.id} className="py-2.5 border-b border-line last:border-0 text-[14px]">
              <div className="text-[12px] text-slate">
                {fmtStamp(u.at)} · {u.from === "owner" ? staffName(dr, u.by) : `${dr.apps.find((a) => a.id === u.by)?.org.name}, the ${u.from === "provider" ? "counterparty" : u.from}${o.requests.some((r) => r.to === u.from && r.answeredAt === u.at) ? ", replying to a request" : ""}`}
              </div>
              <div>{u.text}</div>
              {u.doc && <DocLine doc={u.doc} />}
            </li>
          ))}
        </ul>
      )}
      {works && oppOpen(o) && (
        <div className="mt-4 border-t border-line pt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input className="input h-9 flex-1 min-w-48 text-[13px]" placeholder="Latest progress, in a sentence" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn-secondary btn-sm" disabled={!text.trim()} onClick={() => { dispatch({ type: "dr/oppNote", oppId: o.id, text }); setText(""); }}>
              Add the update
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-slate">Ask for a status update by email:</span>
            <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/oppRequest", oppId: o.id, to: ["seeker"] })}>
              The seeker
            </button>
            <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/oppRequest", oppId: o.id, to: ["provider"] })}>
              The counterparty
            </button>
            <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "dr/oppRequest", oppId: o.id, to: ["seeker", "provider"] })}>
              Both
            </button>
          </div>
          {open.length > 0 && <p className="text-[13px] text-slate">Waiting for a reply from {open.map((r) => `the ${r.to === "provider" ? "counterparty" : r.to}, asked ${fmtStamp(r.at, false)}`).join(" and ")}. Replies attach here; the stage stays yours to change.</p>}
        </div>
      )}
    </Section>
  );
}

function NextAction({ o, works }: { o: DrOpportunity; works: boolean }) {
  const { dr, now, dispatch } = useDr();
  const [f, setF] = useState({ nextAction: o.nextAction, due: o.due < now.slice(0, 10) ? "" : o.due });
  if (!oppOpen(o))
    return (
      <Section title="Next action">
        <p className="text-[14px] text-slate">Closed {o.stage === "Closed – won" ? "as won" : "as lost"}, {fmtStamp(o.stageDates[o.stage] ?? "", false)}.</p>
      </Section>
    );
  return (
    <Section title="Next action">
      <p className="text-[14px]">
        {o.nextAction}
        <span className={`block text-[13px] ${oppOverdue(o, now) ? "text-bad" : "text-slate"}`}>
          {oppOverdue(o, now) ? "Overdue since" : "Due"} <When at={o.due} time={false} />, {staffName(dr, o.owner)}
        </span>
      </p>
      {works && (
        <div className="mt-3 grid gap-2">
          <input className="input h-9 text-[13px]" aria-label="Next action" value={f.nextAction} onChange={(e) => setF({ ...f, nextAction: e.target.value })} />
          <div className="flex gap-2">
            <input className="input h-9 flex-1 text-[13px]" type="date" aria-label="Due" min={now.slice(0, 10)} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
            <button className="btn-secondary btn-sm" disabled={!f.nextAction.trim() || !f.due || f.due < now.slice(0, 10)} onClick={() => dispatch({ type: "dr/oppNext", oppId: o.id, nextAction: f.nextAction, due: f.due })}>
              Save
            </button>
          </div>
        </div>
      )}
      {!drCan(dr.staff.find((s) => s.id === dr.actingStaffId), "conversion") && works && <p className="mt-2 text-[12px] text-slate">Only the lead reassigns an opportunity, at the monthly review.</p>}
    </Section>
  );
}

function Close({ o }: { o: DrOpportunity }) {
  const { dispatch } = useDr();
  const [reason, setReason] = useState<CloseReason | "">("");
  const [note, setNote] = useState("");
  return (
    <Section title="Close as lost">
      <div className="grid gap-2">
        <select className="input h-9 text-[13px]" aria-label="Close reason" value={reason} onChange={(e) => setReason(e.target.value as CloseReason)}>
          <option value="">Reason…</option>
          {CLOSE_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <input className="input h-9 text-[13px]" placeholder="A note on why" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-secondary btn-sm justify-self-start" disabled={!reason || !note.trim()} onClick={() => reason && dispatch({ type: "dr/oppClose", oppId: o.id, reason, note })}>
          Close the opportunity
        </button>
      </div>
      <p className="mt-2 text-[12px] text-slate">A reason from the list and a note are both required.</p>
    </Section>
  );
}
