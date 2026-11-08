"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Empty, PageHeader, Section, Stat } from "@/components/ui";
import { FloorPlan, PlanLegend } from "@/components/floor-plan";
import { paidInFull } from "@/lib/expo/logic";
import { ISSUE_CATEGORIES, ISSUE_PRIORITIES, issueDue, issueProblems, issueStatus, type IssueStatus } from "@/lib/expo/onsite";
import { showDayOf, staffedOn } from "@/lib/expo/ops";
import type { Booth, IssueCategory, IssuePriority } from "@/lib/expo/types";
import { fmtStamp } from "@/lib/time";
import { Refusal } from "@/app/dealroom/bits";
import { Field, ScannerWork, StatePill, useExpo, useStands } from "../bits";

const STAFFED = { fill: "#1e8e5a", stroke: "#156b43", ink: "#ffffff" };
const EMPTY = { fill: "#fdf2dd", stroke: "#b7791f", ink: "#1c1c1e" };
const NONE = { fill: "#f1efe9", stroke: "#d6d3cc", ink: "#8a877f" };
const I_STATES: IssueStatus[] = ["Overdue", "Open", "Assigned", "Resolved"];

export default function OperationsView() {
  const q = useSearchParams();
  return <Operations key={q.toString()} />;
}

/** OPS-1 to OPS-5 on a show day: which stands are staffed, who checked in, what is wrong and who is on it. */
function Operations() {
  const { state, expo, cfg, now, can } = useExpo();
  const q = useSearchParams();
  const stands = useStands();
  const today = cfg ? showDayOf(cfg, now) || (now < cfg.showDays[0].date ? 1 : cfg.showDays.length) : 1;
  const asked = Number(q.get("day"));
  const [day, setDay] = useState(asked >= 1 && asked <= (cfg?.showDays.length ?? 3) ? asked : today);
  const halls = cfg ? expo.halls.filter((h) => h.eventId === cfg.eventId) : [];
  const [hallId, setHall] = useState(halls[0]?.id);
  const [sel, setSel] = useState<string | null>(null);
  if (!cfg) return null;
  if (!can("expo.floor") && !can("expo.manage")) return <Refusal title="Operations are for the exhibition team"><ScannerWork /></Refusal>;
  const started = `${cfg.showDays[day - 1].date} ${cfg.exhibitorOpen}` <= now;
  const standOf = (b: Booth) => stands.find((s) => s.booths.some((x) => x.id === b.id));
  const rows = stands.map((s) => ({ ...s, st: staffedOn(state, s.e.id, day), paid: paidInFull(expo, s.e.id) }));
  const staffed = rows.filter((r) => r.st.staffed);
  const people = rows.reduce((n, r) => n + r.st.ins.length, 0);
  const issues = expo.issues.filter((i) => i.eventId === cfg.eventId);
  const open = issues.filter((i) => !i.resolved);
  const late = open.filter((i) => issueStatus(cfg, i, now) === "Overdue");
  const overrides = expo.overrides.filter((o) => o.eventId === cfg.eventId && o.day === day);
  const hall = halls.find((h) => h.id === hallId) ?? halls[0];
  const picked = rows.find((r) => r.booths.some((b) => b.id === sel));
  return (
    <>
      <PageHeader title="Operations" kicker={`Show day ${day}, ${fmtStamp(cfg.showDays[day - 1].date, false)}. ${day === today ? `As of ${fmtStamp(now)}.` : ""}`} />
      <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
        {cfg.showDays.map((d, i) => (
          <button key={d.date} aria-pressed={day === i + 1} onClick={() => setDay(i + 1)} className={`pill ${day === i + 1 ? "bg-ink text-white" : "bg-paper-200 text-slate"}`}>
            Day {i + 1}, {fmtStamp(d.date, false)}
          </button>
        ))}
      </div>
      {!started ? (
        <Empty>Day {day} has not started: exhibitor passes open the halls at {cfg.exhibitorOpen} on {fmtStamp(cfg.showDays[day - 1].date, false)}.</Empty>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Stands staffed" value={`${staffed.length} of ${rows.length}`} tone={staffed.length < rows.length ? "warn" : "ok"} />
            <Stat label="Stand people checked in" value={people} href={`/exhibition/reports#attendance`} />
            <Stat label="Issues open" value={open.length} sub={late.length ? `${late.length} past their time` : undefined} tone={late.length ? "bad" : undefined} />
            <Stat label="Desk overrides" value={overrides.length} sub="stands not paid in full" tone={overrides.length ? "warn" : undefined} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Section
              title="Occupancy"
              action={
                <div className="flex gap-1">
                  {halls.map((h) => (
                    <button key={h.id} onClick={() => setHall(h.id)} className={`pill text-[13px] ${h.id === hall?.id ? "bg-ink text-white" : "bg-paper-200 text-slate"}`}>
                      {h.name}
                    </button>
                  ))}
                </div>
              }
            >
              {hall && (
                <FloorPlan
                  hall={hall}
                  booths={expo.booths.filter((b) => b.hallId === hall.id)}
                  statusOf={() => "Booked"}
                  paint={(b) => {
                    const s = standOf(b);
                    return !s ? NONE : staffedOn(state, s.e.id, day).staffed ? STAFFED : EMPTY;
                  }}
                  labelOf={(b) => standOf(b)?.e.name}
                  tip={(b) => {
                    const s = standOf(b);
                    if (!s) return [b.code, "No stand"];
                    const st = staffedOn(state, s.e.id, day);
                    return [`${b.code}, ${s.e.name}`, st.staffed ? (st.ins[0] ? `Staffed from ${st.ins[0].at}` : "Staffed, by the floor walk") : "Not staffed"];
                  }}
                  selected={sel}
                  onSelect={(id) => setSel(id === sel ? null : id)}
                />
              )}
              <div className="mt-3">
                <PlanLegend
                  statuses={[]}
                  extra={[
                    { label: "Staffed", ...STAFFED },
                    { label: "Not staffed", ...EMPTY },
                    { label: "No stand", ...NONE },
                  ]}
                />
              </div>
            </Section>
            <div className="space-y-4 min-w-0">
              {picked ? <StandPanel exhibitorId={picked.e.id} day={day} onClose={() => setSel(null)} /> : <NotStaffed rows={rows.filter((r) => !r.st.staffed)} onPick={(id) => setSel(id)} />}
            </div>
          </div>
        </>
      )}
      <Issues />
      {overrides.length > 0 && (
        <Section title={`Desk overrides on day ${day}`} flush className="mt-4">
          <ul>
            {overrides.map((o) => {
              const d = state.delegates.find((x) => x.id === o.delegateId);
              return (
                <li key={o.id} className="px-5 py-2.5 border-t border-line text-[14px] flex flex-wrap justify-between gap-2">
                  <span>
                    {d?.name}, {expo.exhibitors.find((e) => e.id === o.exhibitorId)?.name}: {o.reason}
                  </span>
                  <span className="text-slate">{fmtStamp(o.at)}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </>
  );
}

function NotStaffed({ rows, onPick }: { rows: { e: { id: string; name: string }; booths: Booth[]; paid: boolean }[]; onPick: (boothId: string) => void }) {
  return (
    <Section title={`Not staffed, ${rows.length}`} flush>
      {rows.length === 0 ? (
        <p className="px-5 pb-4 text-[14px] text-slate">Every stand is staffed.</p>
      ) : (
        <ul className="max-h-[420px] overflow-auto">
          {rows.map((r) => (
            <li key={r.e.id} className="border-t border-line">
              <button className="w-full px-5 py-2.5 text-left text-[14px] hover:bg-paper flex justify-between gap-2" onClick={() => onPick(r.booths[0].id)}>
                <span>
                  {r.e.name} <span className="text-slate">· {r.booths.map((b) => b.code).join(", ")}</span>
                </span>
                {!r.paid && <span className="text-[12px] text-bad whitespace-nowrap">Not paid in full</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** One stand on the day: who is on it, and the floor walk's own call (OPS-3). */
function StandPanel({ exhibitorId, day, onClose }: { exhibitorId: string; day: number; onClose: () => void }) {
  const { state, expo, can, dispatch } = useExpo();
  const e = expo.exhibitors.find((x) => x.id === exhibitorId)!;
  const st = staffedOn(state, e.id, day);
  const staff = state.delegates.filter((d) => d.exhibitorId === e.id && !d.cancelled && d.tierId !== "t_contractor");
  return (
    <Section
      title={e.name}
      action={
        <button className="text-[13px] text-slate underline underline-offset-4" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <StatePill s={st.staffed ? "Staffed" : "Not staffed"} />
        <span className="text-slate">{st.manual ? `set by the floor walk, ${fmtStamp(st.manual.at)}` : st.ins.length ? "from check-ins" : "nobody has checked in"}</span>
      </div>
      <ul className="mt-3 text-[14px]">
        {staff.map((d) => {
          const c = d.checkIns.find((x) => x.day === day);
          return (
            <li key={d.id} className="flex justify-between gap-2 py-1 border-b border-line last:border-0">
              <span>{d.name}</span>
              <span className="text-slate">{c ? `in ${c.at}` : "not in"}</span>
            </li>
          );
        })}
        {staff.length === 0 && <li className="text-slate">No staff registered.</li>}
      </ul>
      {can("expo.floor") && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" disabled={st.manual?.staffed === true} onClick={() => dispatch({ type: "expo/occupancy", exhibitorId: e.id, day, staffed: true })}>
            Seen staffed
          </button>
          <button className="btn-secondary btn-sm" disabled={st.manual?.staffed === false} onClick={() => dispatch({ type: "expo/occupancy", exhibitorId: e.id, day, staffed: false })}>
            Seen empty
          </button>
          {st.manual && (
            <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "expo/occupancy", exhibitorId: e.id, day, staffed: null })}>
              Go by check-ins
            </button>
          )}
        </div>
      )}
      <Link href={`/exhibition/exhibitors/${e.id}`} className="mt-3 inline-block text-[13px] underline underline-offset-4">
        Their record
      </Link>
    </Section>
  );
}

/** OPS-4 and OPS-5: report, assign and resolve, each against its service time by priority. */
function Issues() {
  const { state, expo, cfg, now, can, dispatch, event } = useExpo();
  const stands = useStands();
  const [pick, setPick] = useState<IssueStatus[]>(["Overdue", "Open", "Assigned"]);
  const [f, setF] = useState<{ exhibitorId: string; category: IssueCategory; priority: IssuePriority; text: string }>({ exhibitorId: "", category: "Power", priority: "Normal", text: "" });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const all = expo.issues.filter((i) => i.eventId === cfg!.eventId);
  const list = all.filter((i) => pick.includes(issueStatus(cfg!, i, now))).sort((a, b) => issueDue(cfg!, a).localeCompare(issueDue(cfg!, b)));
  const team = state.team.filter((m) => m.organiserId === event.organiserId && m.status === "Active" && (m.role === "Staff" || m.role === "Owner"));
  const problems = f.exhibitorId ? issueProblems(expo, cfg!, f, now, false) : ["Choose the stand"];
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <Section
        title="Issues"
        action={
          <div className="flex flex-wrap gap-1 text-[13px]">
            {I_STATES.map((s) => {
              const on = pick.includes(s);
              return (
                <button key={s} aria-pressed={on} onClick={() => setPick(on ? pick.filter((x) => x !== s) : [...pick, s])} className={`pill ${on ? "bg-ink text-white" : "bg-paper-200 text-slate"}`}>
                  {s} {all.filter((i) => issueStatus(cfg!, i, now) === s).length}
                </button>
              );
            })}
          </div>
        }
        flush
      >
        {list.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>No issues with these filters.</Empty>
          </div>
        ) : (
          <ul>
            {list.map((i) => {
              const st = issueStatus(cfg!, i, now);
              const e = expo.exhibitors.find((x) => x.id === i.exhibitorId);
              const b = expo.booths.find((x) => x.id === i.boothId);
              return (
                <li key={i.id} className="px-5 py-3 border-t border-line">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 text-[14px]">
                      <span className="font-medium">
                        {i.category}, {i.priority.toLowerCase()}
                      </span>
                      <span className="text-slate">
                        {" "}
                        · {b?.code} {e?.name}
                      </span>
                      <div>{i.text}</div>
                      <div className="text-[12px] text-slate">
                        Reported {fmtStamp(i.at)} by {i.by === "exhibitor" ? "the stand" : state.team.find((m) => m.id === i.by)?.name}
                        {i.resolved ? ` · resolved ${fmtStamp(i.resolved.at)}: ${i.resolved.note}` : ` · due ${fmtStamp(issueDue(cfg!, i))}`}
                        {i.assignee && !i.resolved ? ` · with ${state.team.find((m) => m.id === i.assignee)?.name}` : ""}
                      </div>
                    </div>
                    <StatePill s={st} />
                  </div>
                  {!i.resolved && can("expo.floor") && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <select className="input h-9 w-auto text-[13px]" aria-label="Assign to" value={i.assignee ?? ""} onChange={(x) => x.target.value && dispatch({ type: "expo/issueAssign", id: i.id, assignee: x.target.value })}>
                        <option value="">Assign to…</option>
                        {team.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <input className="input h-9 flex-1 min-w-40 text-[13px]" placeholder="What was done" value={notes[i.id] ?? ""} onChange={(x) => setNotes({ ...notes, [i.id]: x.target.value })} />
                      <button className="btn-primary btn-sm" disabled={!(notes[i.id] ?? "").trim()} onClick={() => dispatch({ type: "expo/issueResolve", id: i.id, note: notes[i.id] ?? "" })}>
                        Resolve
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="px-5 py-3 border-t border-line text-[12px] text-slate">
          Service times: urgent {cfg!.slaMin.Urgent} minutes, normal {cfg!.slaMin.Normal / 60} hours, low {cfg!.slaMin.Low / 60} hours.
        </p>
      </Section>
      {can("expo.floor") && (
        <Section title="Report an issue">
          <div className="grid gap-3">
            <Field label="Stand">
              <select className="input" value={f.exhibitorId} onChange={(x) => setF({ ...f, exhibitorId: x.target.value })}>
                <option value="">Choose…</option>
                {stands.map(({ e, booths }) => (
                  <option key={e.id} value={e.id}>
                    {booths.map((b) => b.code).join(", ")}, {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Kind">
                <select className="input" value={f.category} onChange={(x) => setF({ ...f, category: x.target.value as IssueCategory })}>
                  {ISSUE_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select className="input" value={f.priority} onChange={(x) => setF({ ...f, priority: x.target.value as IssuePriority })}>
                  {ISSUE_PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="What is wrong">
              <textarea className="input min-h-16" value={f.text} onChange={(x) => setF({ ...f, text: x.target.value })} />
            </Field>
          </div>
          {tried && problems.length > 0 && <p className="mt-2 text-[13px] text-bad">{problems.join(". ")}.</p>}
          <button
            className="btn-primary btn-sm mt-3"
            onClick={() => {
              setTried(true);
              if (problems.length) return;
              dispatch({ type: "expo/issue", id: `is_${Date.now().toString(36)}`, exhibitorId: f.exhibitorId, category: f.category, priority: f.priority, text: f.text });
              setF({ ...f, text: "" });
              setTried(false);
            }}
          >
            Log it
          </button>
        </Section>
      )}
    </div>
  );
}
