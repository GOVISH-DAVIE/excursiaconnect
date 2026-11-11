"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, PageHeader, Section, Tabs } from "@/components/ui";
import { PROVIDER_FIELDS, SEEKER_DOCS, SEEKER_FIELDS, MATCH_LABEL, bothAccepted, deletionDate, staffName, validateDealRoom } from "@excursia/domain/dealroom/logic";
import { reducer } from "@/lib/store";
import type { AppState } from "@excursia/domain/types";
import type { DrConfig, DrException } from "@excursia/domain/dealroom/types";
import { fmtLong, fmtStamp } from "@excursia/domain/time";
import { Labeled, Pill, useDr } from "../bits";

const tabs = ["Missions and sources", "Forms", "Rubric", "Matching", "Rules and deadlines", "Exceptions", "Support access", "Archive and retention", "Checks"] as const;

/** DL-1, DL-2, DL-6, DL-11: the lead sets the Deal Room once; everyone else reads it. */
export default function Settings() {
  const { dr, cfg, me, state } = useDr();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Missions and sources");
  if (!cfg) return null;
  const lead = me?.role === "Lead";
  const frozen = dr.clock.slice(0, 10) > cfg.freezeDate;
  const problems = validateDealRoom(state);
  return (
    <>
      <PageHeader
        title="Settings and rules"
        kicker={lead ? "Set once and applied the same on every channel. Changes are logged." : "Set by the Deal Room lead. You can read them here."}
        badge={frozen ? <Pill tone="warn">Design frozen {fmtStamp(cfg.freezeDate, false)}</Pill> : undefined}
      />
      {frozen && lead && <p className="mb-3 text-[13px] text-slate">Rubric, matching fields and missions changed after the freeze are logged as exceptions with your reason.</p>}
      <Tabs tabs={tabs} value={tab} onChange={setTab} counts={{ Checks: problems.length }} />
      {tab === "Missions and sources" && <Missions cfg={cfg} lead={lead} />}
      {tab === "Forms" && <Forms cfg={cfg} lead={lead} />}
      {tab === "Rubric" && <Rubric cfg={cfg} lead={lead} />}
      {tab === "Matching" && <Matching cfg={cfg} lead={lead} />}
      {tab === "Rules and deadlines" && <Rules cfg={cfg} lead={lead} />}
      {tab === "Exceptions" && <Exceptions />}
      {tab === "Support access" && <Support />}
      {tab === "Archive and retention" && <Archive cfg={cfg} lead={lead} />}
      {tab === "Checks" && <Concurrency />}
      {tab === "Checks" && (
        <Section title="Invariant checks" className="mt-4">
          {problems.length === 0 ? <p className="text-[14px] text-ok">Every check passes: references unique, every qualified participant badged, every Ready seeker meets the gate, every decision has its decider and a different confirmer.</p> : (
            <ul className="space-y-1 text-[14px] text-bad">
              {problems.map((p) => (
                <li key={p}>· {p}</li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}

function Save({ cfg, patch, note, lead, disabled }: { cfg: DrConfig; patch: Partial<DrConfig>; note: string; lead: boolean; disabled?: boolean }) {
  const { dispatch } = useDr();
  const [done, setDone] = useState(false);
  if (!lead) return null;
  return (
    <div className="mt-4 flex items-center gap-3">
      <button className="btn-primary" disabled={disabled} onClick={() => { dispatch({ type: "dr/config", eventId: cfg.eventId, patch, note }); setDone(true); }}>
        Save
      </button>
      {done && <span className="text-[13px] text-slate">Saved and logged.</span>}
    </div>
  );
}

function Missions({ cfg, lead }: { cfg: DrConfig; lead: boolean }) {
  const [missions, setMissions] = useState(cfg.missions);
  const [sources, setSources] = useState(cfg.sources.join("\n"));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Missions">
        <div className="space-y-3">
          {missions.map((m, i) => (
            <div key={m.id} className="grid grid-cols-[64px_1fr] gap-2">
              <input className="input" aria-label="Code" disabled={!lead} value={m.code} onChange={(e) => setMissions(missions.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} />
              <input className="input" aria-label="Name" disabled={!lead} value={m.name} onChange={(e) => setMissions(missions.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <textarea className="input col-span-2 text-[13px]" aria-label="Description" disabled={!lead} value={m.description} onChange={(e) => setMissions(missions.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-slate">The three missions and six strategic tracks are the decision paper&apos;s, Deal Room Vis a Vis.</p>
        <Save cfg={cfg} lead={lead} patch={{ missions }} note="Missions edited" />
      </Section>
      <Section title="Sources">
        <textarea className="input min-h-40" disabled={!lead} value={sources} onChange={(e) => setSources(e.target.value)} />
        <p className="mt-2 text-[12px] text-slate">One per line. Every application and imported lead carries one source and one owner.</p>
        <Save cfg={cfg} lead={lead} patch={{ sources: sources.split("\n").map((s) => s.trim()).filter(Boolean) }} note="Sources edited" />
      </Section>
    </div>
  );
}

function Forms({ cfg, lead }: { cfg: DrConfig; lead: boolean }) {
  const [fields, setFields] = useState(cfg.fields);
  const row = (key: string, label: string) => (
    <li key={key} className="flex items-center justify-between gap-3 py-2 border-b border-line last:border-0 text-[14px]">
      <span>{label}</span>
      <select className="input h-8 w-auto text-[13px]" disabled={!lead} value={fields[key] ?? "required"} onChange={(e) => setFields({ ...fields, [key]: e.target.value as "required" | "advisory" })}>
        <option value="required">Required</option>
        <option value="advisory">Advisory</option>
      </select>
    </li>
  );
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Capital seeker form">
          <ul>
            {SEEKER_FIELDS.map((f) => row(f.key, f.label))}
            {SEEKER_DOCS.map((d) => row(d.key, `Document: ${d.kind}`))}
          </ul>
        </Section>
        <Section title="Finance provider form">
          <ul>{PROVIDER_FIELDS.filter((f) => f.key !== "org.name").map((f) => row(f.key, f.label))}</ul>
        </Section>
      </div>
      <p className="mt-2 text-[13px] text-slate">A required field blocks submission and is named in the message; an advisory one is flagged for correction but does not block (PRD Applications req. 6).</p>
      <Save cfg={cfg} lead={lead} patch={{ fields }} note="Form fields: required and advisory changed" />
    </>
  );
}

function Rubric({ cfg, lead }: { cfg: DrConfig; lead: boolean }) {
  const [rubric, setRubric] = useState(cfg.rubric);
  const total = rubric.assessment.reduce((a, c) => a + c.weight, 0);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Section title="Eligibility, pass or fail">
        <ul className="space-y-2">
          {rubric.eligibility.map((c, i) => (
            <li key={c.id}>
              <input className="input text-[13px]" disabled={!lead} value={c.text} onChange={(e) => setRubric({ ...rubric, eligibility: rubric.eligibility.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Assessment weights" action={<span className={`text-[13px] ${total === 100 ? "text-slate" : "text-bad"}`}>Total {total}%</span>}>
        <ul className="space-y-2">
          {rubric.assessment.map((c, i) => (
            <li key={c.id} className="grid grid-cols-[1fr_72px] gap-2">
              <input className="input text-[13px]" disabled={!lead} value={c.text} onChange={(e) => setRubric({ ...rubric, assessment: rubric.assessment.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              <input className="input text-[13px]" type="number" min={0} max={100} disabled={!lead} value={c.weight} onChange={(e) => setRubric({ ...rubric, assessment: rubric.assessment.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-slate">Default 30 / 30 / 20 / 15 / 5, as in the PRD; to be confirmed by Bouer.</p>
      </Section>
      <Section title="Readiness">
        <ul className="space-y-2">
          {rubric.readiness.map((c, i) => (
            <li key={c.id}>
              <input className="input text-[13px]" disabled={!lead} value={c.text} onChange={(e) => setRubric({ ...rubric, readiness: rubric.readiness.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
            </li>
          ))}
        </ul>
        <Save cfg={cfg} lead={lead} patch={{ rubric }} note={`Rubric edited, weights ${rubric.assessment.map((c) => c.weight).join("/")}`} disabled={total !== 100} />
        {total !== 100 && lead && <p className="mt-2 text-[12px] text-bad">Weights must add up to 100.</p>}
      </Section>
    </div>
  );
}

function Matching({ cfg, lead }: { cfg: DrConfig; lead: boolean }) {
  const [matching, setMatching] = useState(cfg.matching);
  const [ordering, setOrdering] = useState(cfg.ordering);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Matching fields">
        <ul>
          {matching.map((m, i) => (
            <li key={m.field} className="flex items-center justify-between gap-3 py-2 border-b border-line last:border-0 text-[14px]">
              <span>{MATCH_LABEL[m.field]}</span>
              <select className="input h-8 w-auto text-[13px]" disabled={!lead} value={m.mandatory ? "m" : "a"} onChange={(e) => setMatching(matching.map((x, j) => (j === i ? { ...x, mandatory: e.target.value === "m" } : x)))}>
                <option value="m">Mandatory</option>
                <option value="a">Advisory</option>
              </select>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-slate">Both forms capture every field. A miss on a mandatory field, or an exclusion hit, needs a reviewer&apos;s note to approve the pair.</p>
      </Section>
      <Section title="How candidates are ordered">
        <label className="flex items-start gap-2 text-[14px]">
          <input type="radio" disabled={!lead} checked={ordering === "criteria"} onChange={() => setOrdering("criteria")} />
          <span>Criteria met first, then the seeker&apos;s readiness score</span>
        </label>
        <label className="mt-2 flex items-start gap-2 text-[14px]">
          <input type="radio" disabled={!lead} checked={ordering === "readiness"} onChange={() => setOrdering("readiness")} />
          <span>Readiness score first, then criteria met</span>
        </label>
        <p className="mt-2 text-[12px] text-slate">The rule is printed on the matching screen beside every list. The system proposes; a reviewer decides.</p>
        <Save cfg={cfg} lead={lead} patch={{ matching, ordering }} note="Matching fields and ordering edited" />
      </Section>
    </div>
  );
}

function Rules({ cfg, lead }: { cfg: DrConfig; lead: boolean }) {
  const [r, setR] = useState(cfg.rules);
  const [freezeDate, setFreeze] = useState(cfg.freezeDate);
  const [second, setSecond] = useState(cfg.secondReview);
  const [fee, setFee] = useState(cfg.seekerFee);
  const num = (k: keyof typeof r, label: string, help?: string) => (
    <Labeled label={label} help={help}>
      <input className="input" type="number" min={0} disabled={!lead} value={r[k] as number} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} />
    </Labeled>
  );
  const date = (k: keyof typeof r, label: string, help?: string) => (
    <Labeled label={label} help={help}>
      <input className="input" type="date" disabled={!lead} value={r[k] as string} onChange={(e) => setR({ ...r, [k]: e.target.value })} />
    </Labeled>
  );
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Windows and deadlines">
          <div className="grid gap-3 sm:grid-cols-2">
            {date("appOpen", "Applications open")}
            {date("appClose", "Applications close", "Kept open through summit week in the demo")}
            {num("profileDays", "Profile deadline, working days after approval")}
            {num("rfiDays", "Information request expiry, days")}
            {num("introDays", "Introduction acceptance window, days")}
            {num("confirmHours", "Request-to-confirm window, hours before the slot")}
            {date("conversionEnd", "Conversion tracking ends")}
            {num("retentionMonths", "Documents deleted, months after tracking ends")}
            <Labeled label="Design freeze">
              <input className="input" type="date" disabled={!lead} value={freezeDate} onChange={(e) => setFreeze(e.target.value)} />
            </Labeled>
          </div>
        </Section>
        <Section title="Meetings and decisions">
          <div className="grid gap-3 sm:grid-cols-2">
            {num("meetingMin", "Meeting length, minutes")}
            {num("bufferMin", "Buffer between meetings, minutes")}
            {num("flaggedMin", "Flagged meetings, minutes", "Lead-sponsor or DFI meetings")}
            {num("seekerCap", "Meetings per seeker, whole summit")}
            {num("providerCapDay", "Default provider meetings a day", "Each provider's own cap is set at onboarding")}
            {num("lateMin", "A party later than this is a no-show, minutes")}
            <Labeled label="Second decider for asks over, USD">
              <input className="input" type="number" min={0} disabled={!lead} value={second.askAbove} onChange={(e) => setSecond({ ...second, askAbove: Number(e.target.value) })} />
            </Labeled>
            <label className="flex items-center gap-2 text-[14px] self-end pb-2">
              <input type="checkbox" disabled={!lead} checked={second.decline} onChange={(e) => setSecond({ ...second, decline: e.target.checked })} />
              Every decline needs a second decider
            </label>
          </div>
        </Section>
        <Section title="Participation fee">
          <div className="grid gap-3 sm:grid-cols-3">
            <Labeled label="Fee for an approved capital seeker" help="0 charges nothing">
              <input className="input" type="number" min={0} disabled={!lead} value={fee.amount} onChange={(e) => setFee({ ...fee, amount: Math.max(0, Number(e.target.value) || 0) })} />
            </Labeled>
            <Labeled label="Currency" help="M-Pesa pays the shilling amount at 130 to the dollar">
              <select className="input" disabled={!lead} value={fee.currency} onChange={(e) => setFee({ ...fee, currency: e.target.value as "USD" | "KES" })}>
                <option>USD</option>
                <option>KES</option>
              </select>
            </Labeled>
            <Labeled label="Reminder, days after the link">
              <input className="input" type="number" min={1} disabled={!lead} value={fee.reminderDays} onChange={(e) => setFee({ ...fee, reminderDays: Math.max(1, Number(e.target.value) || 1) })} />
            </Labeled>
          </div>
          <p className="mt-2 text-[13px] text-slate">Approval sends the payment link. Until the fee is paid or waived, the seeker has no badge and is not matched or introduced. A change applies to approvals from now on.</p>
        </Section>
      </div>
      <p className="mt-2 text-[13px] text-slate">The same rules apply on the web and in the apps. Operations can override a cap with a logged reason; every other exception is recorded under Exceptions.</p>
      <Save cfg={cfg} lead={lead} patch={{ rules: r, freezeDate, secondReview: second, seekerFee: fee }} note="Rules and deadlines edited" />
    </>
  );
}

function Exceptions() {
  const { dr, me, dispatch } = useDr();
  const [kind, setKind] = useState<DrException["kind"]>("Other");
  const [reason, setReason] = useState("");
  const [ref, setRef] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Section title={`${dr.exceptions.length} exceptions`} flush>
        {dr.exceptions.length === 0 ? (
          <div className="p-5">
            <Empty>No rule has been bent.</Empty>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">When</th>
                <th className="th">Kind</th>
                <th className="th">Reason</th>
                <th className="th">By</th>
              </tr>
            </thead>
            <tbody>
              {dr.exceptions.map((x) => (
                <tr key={x.id}>
                  <td className="td text-[13px] whitespace-nowrap">{fmtStamp(x.at)}</td>
                  <td className="td text-[13px]">
                    {x.kind}
                    <RefLink refText={x.ref} />
                  </td>
                  <td className="td text-[13px]">{x.reason}</td>
                  <td className="td text-[13px]">{staffName(dr, x.by)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title="Record an exception">
        <div className="space-y-3">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as DrException["kind"])}>
            {(["Other", "Cap override", "Re-proposed pair", "Expired request", "Change after freeze", "Paper entry over an outcome"] as const).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input className="input" placeholder="What it concerns, for example a reference" value={ref} onChange={(e) => setRef(e.target.value)} />
          <textarea className="input min-h-20" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-primary" disabled={!reason.trim() || !me} onClick={() => { dispatch({ type: "dr/exception", kind, reason, ref }); setReason(""); setRef(""); }}>
            Record it
          </button>
          <p className="text-[12px] text-slate">Cap overrides, re-proposed pairs, expired requests and changes after the freeze are recorded here automatically.</p>
        </div>
      </Section>
    </div>
  );
}

function Support() {
  const { dr } = useDr();
  return (
    <Section title="Support access granted to Algotech" flush>
      {dr.grants.length === 0 ? (
        <div className="p-5">
          <Empty>No grants. The lead grants time-limited access from an application&apos;s page.</Empty>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Record</th>
              <th className="th">To</th>
              <th className="th">Reason</th>
              <th className="th">Until</th>
              <th className="th">Granted by</th>
            </tr>
          </thead>
          <tbody>
            {dr.grants.map((g) => {
              const a = dr.apps.find((x) => x.id === g.appId);
              return (
                <tr key={g.id}>
                  <td className="td">
                    <Link className="hover:underline" href={`/dealroom/applications/${g.appId}`}>
                      {a?.ref ?? a?.org.name}
                    </Link>
                  </td>
                  <td className="td text-[13px]">{g.to}</td>
                  <td className="td text-[13px]">{g.reason}</td>
                  <td className="td text-[13px]">{g.expires > dr.clock ? fmtStamp(g.expires) : "Expired"}</td>
                  <td className="td text-[13px]">{staffName(dr, g.by)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
}

/**
 * PRD acceptance: "a 50-request concurrency test books no clashes". Fifty proposals arrive in one burst and go
 * through the real reducer one after another, on a copy of the state, so the live schedule is never touched.
 */
function Concurrency() {
  const { state } = useDr();
  const [result, setResult] = useState<{ name: string; requests: number; booked: number; refused: number; problems: number }[] | null>(null);
  const run = () => {
    const lead = state.dealRoom.staff.find((x) => x.role === "Lead" && x.active)!;
    const base: AppState = structuredClone(state);
    const acc = base.dealRoom.matches.filter(bothAccepted);
    base.dealRoom = { ...base.dealRoom, clock: "2027-02-01 09:00", actingStaffId: lead.id, meetings: base.dealRoom.meetings.filter((m) => !acc.slice(0, 50).some((a) => a.id === m.matchId)) };
    const test = (name: string, reqs: { matchId: string; roomId: string; table: number; start: string }[]) => {
      let st = base;
      const before = st.dealRoom.meetings.length;
      for (const req of reqs) st = reducer(st, { type: "dr/propose", req });
      const booked = st.dealRoom.meetings.length - before;
      return { name, requests: reqs.length, booked, refused: reqs.length - booked, problems: validateDealRoom(st).filter((p) => /share|two meetings/i.test(p)).length };
    };
    const day = "2027-02-17";
    const fifty = Array.from({ length: 50 }, (_, i) => acc[i % acc.length].id);
    setResult([
      test("Fifty requests for one room, one table, one time", fifty.map((matchId) => ({ matchId, roomId: "r_dr1", table: 1, start: `${day} 16:00` }))),
      test("Fifty requests for the four tables of Deal floor A at 16:00", fifty.map((matchId, i) => ({ matchId, roomId: "r_dr5", table: 1 + (i % 4), start: `${day} 16:00` }))),
      test("Fifty requests across three times and two rooms", fifty.map((matchId, i) => ({ matchId, roomId: i % 2 ? "r_dr2" : "r_dr3", table: 1, start: `${day} ${["14:00", "14:25", "14:50"][i % 3]}` }))),
    ]);
  };
  return (
    <Section title="Concurrency test, 50 requests at once">
      <p className="text-[14px] text-slate">Runs on a copy of today&apos;s state, with the clock set before the summit; nothing you see elsewhere changes.</p>
      <button className="btn-primary mt-3" onClick={run}>
        Run the test
      </button>
      {result && (
        <table className="w-full mt-4">
          <thead>
            <tr>
              <th className="th">Burst</th>
              <th className="th-r">Requests</th>
              <th className="th-r">Booked</th>
              <th className="th-r">Refused</th>
              <th className="th-r">Double bookings</th>
            </tr>
          </thead>
          <tbody>
            {result.map((r) => (
              <tr key={r.name}>
                <td className="td text-[13px]">{r.name}</td>
                <td className="td-r">{r.requests}</td>
                <td className="td-r">{r.booked}</td>
                <td className="td-r">{r.refused}</td>
                <td className={`td-r font-medium ${r.problems ? "text-bad" : "text-ok"}`}>{r.problems}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

/** DA-8: at the conversion end date the Deal Room turns read-only, the pack goes to the lead, and documents are
 *  scheduled for deletion 12 months later unless the lead extends retention with a reason (PRD Confidentiality req. 8). */
function Archive({ cfg, lead }: { cfg: DrConfig; lead: boolean }) {
  const { dr, dispatch } = useDr();
  const [months, setMonths] = useState(6);
  const [reason, setReason] = useState("");
  const docs = dr.apps.filter((a) => a.eventId === cfg.eventId).reduce((n, a) => n + a.documents.length, 0);
  const log = cfg.log.filter((l) => l.what.startsWith("Document retention"));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={dr.archivedAt ? `Archived ${fmtStamp(dr.archivedAt, false)}` : "Not archived yet"}>
        <dl className="grid gap-2 text-[14px]">
          <div className="flex justify-between gap-3">
            <dt className="text-slate">Tracking ends</dt>
            <dd>{fmtLong(cfg.rules.conversionEnd)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate">Then</dt>
            <dd className="text-right">Every record read-only; the post-summit pack sent to the lead</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate">Documents deleted on</dt>
            <dd className="font-medium">{fmtLong(deletionDate(cfg))}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate">Documents held</dt>
            <dd>{docs}</dd>
          </div>
        </dl>
        <Link href="/dealroom/opportunities?tab=Export" className="btn-secondary mt-4 inline-flex">
          The post-summit pack
        </Link>
        <p className="mt-3 text-[13px] text-slate">Records stay readable and exportable after the archive; only documents are deleted. {dr.archivedAt ? "Nothing in the Deal Room can change now except retention." : "Move the demo clock to 22 Aug to see the archive."}</p>
      </Section>
      <Section title="Extend document retention">
        {lead ? (
          <div className="grid gap-3">
            <Labeled label="By">
              <select className="input" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                {[3, 6, 12].map((m) => (
                  <option key={m} value={m}>
                    {m} months
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Reason">
              <input className="input" placeholder="For example: two deals still disbursing" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Labeled>
            <button className="btn-primary justify-self-start" disabled={!reason.trim()} onClick={() => { dispatch({ type: "dr/retention", eventId: cfg.eventId, months, reason }); setReason(""); }}>
              Extend to {fmtLong(deletionDate({ ...cfg, rules: { ...cfg.rules, retentionMonths: cfg.rules.retentionMonths + months } }))}
            </button>
          </div>
        ) : (
          <p className="text-[14px] text-slate">The lead extends retention, with a reason.</p>
        )}
        {log.length > 0 && (
          <ul className="mt-4 border-t border-line pt-3 text-[13px]">
            {log.map((l, i) => (
              <li key={i} className="py-1">
                {fmtStamp(l.at, false)}, {staffName(dr, l.by)}: {l.what}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** What an exception was about, opening it: a meeting on the schedule, an application, or the settings themselves. */
function RefLink({ refText }: { refText: string }) {
  const { dr } = useDr();
  const mt = dr.meetings.find((m) => m.id === refText);
  const app = dr.apps.find((a) => a.ref === refText || a.id === refText);
  const [label, href] = mt ? [`Meeting of ${fmtStamp(mt.start)}`, `/dealroom/meetings?meeting=${mt.id}`] : app ? [`${app.ref ?? "Application"}, ${app.org.name}`, `/dealroom/applications/${app.id}`] : [refText, undefined];
  return href ? (
    <Link className="block text-slate hover:text-ink hover:underline" href={href}>
      {label}
    </Link>
  ) : (
    <div className="text-slate">{label}</div>
  );
}
