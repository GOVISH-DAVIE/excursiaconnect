"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Empty, PageHeader, Section } from "@/components/ui";
import { MEETING_OUTCOMES, MEETING_OUTCOME_HELP, PROGRAMME_DAYS, SESSION_FORMATS, eventDay, formatInfo, occupies, PARTNER_KINDS, roleOf, sessionOpenOutcomes, staffName, trackName } from "@/lib/dealroom/logic";
import { acceptProblems, invitable, sessionProblems, type DrSessionDraft } from "@/lib/dealroom/sessions";
import type { DrSession, MeetingOutcome, SessionFormat } from "@/lib/dealroom/types";
import { addMinutes, fmtStamp } from "@/lib/time";
import { Labeled, Pill, typeLabel, useDr } from "../bits";

/*
  The programme: the decision paper's activity formats beyond one-to-one meetings, day by day, each day on its
  emphasis and closed out against its checklist. A session a participant accepts holds their time, so the meeting
  scheduler cannot book over it. The coordinator and the lead plan and invite; operations take attendance; the
  outcome of each attendee is recorded in the paper's seven categories.
*/

type Phase = "Planned" | "In progress" | "Held" | "Cancelled";
const phase = (s: DrSession, now: string): Phase => (s.cancelled ? "Cancelled" : now < s.start ? "Planned" : now < s.end ? "In progress" : "Held");
const PHASE_TONE = { Planned: "mute", "In progress": "coral", Held: "ink", Cancelled: "bad" } as const;

export default function Programme() {
  const { state, dr, cfg, me, now, can, event } = useDr();
  const q = useSearchParams();
  const router = useRouter();
  const [planning, setPlanning] = useState(false);
  if (!cfg) return null;
  const days = PROGRAMME_DAYS.map((d) => ({ ...d, date: addMinutes(`${event.startDate} 12:00`, (d.day - 1) * 1440).slice(0, 10) }));
  const today = days.find((d) => d.date === now.slice(0, 10));
  const day = days.find((d) => String(d.day) === q.get("day")) ?? today ?? days[0];
  const go = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams(q.toString());
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined) u.delete(k);
      else u.set(k, v);
    }
    router.replace(`/dealroom/programme?${u.toString()}`, { scroll: false });
  };
  const all = dr.sessions.filter((s) => s.eventId === cfg.eventId);
  const list = all.filter((s) => s.start.slice(0, 10) === day.date).sort((a, b) => a.start.localeCompare(b.start) || a.roomId.localeCompare(b.roomId));
  const open = all.find((s) => s.id === q.get("s"));
  const room = (id: string) => state.rooms.find((r) => r.id === id)?.name ?? id;
  const org = (id?: string) => (id ? dr.apps.find((a) => a.id === id)?.org.name ?? id : "The Deal Room team");

  // the day's close-out, as far as the records can show it
  const ended = list.filter((s) => !s.cancelled && s.end <= now);
  const noAttendance = ended.filter((s) => s.attended.length === 0);
  const openOutcomes = ended.reduce((n, s) => n + sessionOpenOutcomes(s).length, 0);
  const meetingsHeld = dr.meetings.filter((m) => m.eventId === cfg.eventId && m.start.slice(0, 10) === day.date && m.status === "Held");
  const meetingsNoOutcome = meetingsHeld.filter((m) => !m.outcome).length;
  // past their end and still waiting on attendance: never marked held or a no-show
  const meetingsPast = dr.meetings.filter((m) => m.eventId === cfg.eventId && m.start.slice(0, 10) === day.date && occupies(m, cfg, now) && m.status !== "Held" && m.status !== "No-show" && m.end <= now).length;
  const dayOver = now >= `${day.date} ${cfg.rules.dayEnd}`;

  return (
    <>
      <PageHeader
        title="Programme"
        kicker="The activity formats beyond one-to-one meetings, day by day. A session someone accepts holds their time: no meeting is booked over it, and no session over their meetings."
        actions={
          can("schedule") ? (
            <button className="btn-primary" onClick={() => setPlanning((v) => !v)}>
              {planning ? "Close the form" : "Plan a session"}
            </button>
          ) : undefined
        }
      />

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Summit days">
        {days.map((d) => (
          <button key={d.day} onClick={() => go({ day: String(d.day), s: undefined })} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] ${d.day === day.day ? "border-ink font-medium text-ink" : "border-transparent text-slate hover:text-ink"}`}>
            Day {d.day}, {fmtStamp(d.date, false)}
            <span className="ml-1.5 text-slate">{all.filter((s) => s.start.startsWith(d.date) && !s.cancelled).length}</span>
          </button>
        ))}
      </nav>

      {planning && <PlanForm date={day.date} onDone={() => setPlanning(false)} />}

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="surface p-5">
          <div className="text-[12px] uppercase tracking-[0.08em] text-slate">Day {day.day} emphasis</div>
          <p className="mt-1 text-[17px] font-medium">{day.emphasis}</p>
          <p className="mt-2 text-[13px] text-slate">Bilateral meetings and deal progression run on all four days alongside the sessions.</p>
        </section>
        <section className="surface p-5" aria-label="Daily close-out">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] uppercase tracking-[0.08em] text-slate">Daily close-out</span>
            <span className="text-[12px] text-slate">{dayOver ? "Day ended" : now.slice(0, 10) < day.date ? "Not started" : "Under way"}</span>
          </div>
          <ul className="mt-2 space-y-1.5 text-[14px]">
            {day.closeOut.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[13px]">
            <Check ok={noAttendance.length === 0} text={noAttendance.length ? `${noAttendance.length} session${noAttendance.length > 1 ? "s" : ""} ended with no attendance taken` : "Attendance taken at every session that ended"} />
            <Check ok={openOutcomes === 0} text={openOutcomes ? `${openOutcomes} session attendee${openOutcomes > 1 ? "s" : ""} without an outcome` : "Every session attendee has an outcome"} />
            <Check ok={meetingsNoOutcome === 0 && meetingsPast === 0} text={meetingsNoOutcome || meetingsPast ? `${meetingsNoOutcome + meetingsPast} meeting${meetingsNoOutcome + meetingsPast > 1 ? "s" : ""} ended without an outcome` : `${meetingsHeld.length} meetings held, outcomes recorded`} />
          </ul>
        </section>
      </div>

      <Section title={`Sessions, ${list.filter((s) => !s.cancelled).length}`} flush>
        {list.length === 0 ? (
          <div className="p-5">
            <Empty>No sessions planned for this day.</Empty>
          </div>
        ) : (
          <ul>
            {/* one row per session: a table's columns on a wide screen, a stacked card on a phone */}
            <li className="hidden grid-cols-[110px_minmax(0,1fr)_130px_150px_160px] gap-3 px-5 py-2 text-[12px] font-medium text-slate sm:grid" aria-hidden="true">
              <span>Time</span>
              <span>Session</span>
              <span>Room</span>
              <span>Answers</span>
              <span>Status</span>
            </li>
            {list.map((s) => {
              const r = Object.values(s.responses);
              const p = phase(s, now);
              const left = sessionOpenOutcomes(s).length;
              const on = open?.id === s.id;
              return (
                <li key={s.id} className="border-t border-line">
                  <button
                    className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-5 py-3 text-left text-[14px] hover:bg-paper sm:grid-cols-[110px_minmax(0,1fr)_130px_150px_160px] sm:items-start ${on ? "bg-paper" : ""}`}
                    onClick={() => go({ s: on ? undefined : s.id })}
                    aria-expanded={on}
                  >
                    <span className="tabular-nums text-slate sm:text-ink">
                      {s.start.slice(11)} to {s.end.slice(11)}
                      <span className="sm:hidden"> · {room(s.roomId)}</span>
                    </span>
                    <span className="row-span-1 justify-self-end sm:order-last sm:justify-self-start">
                      <Pill tone={PHASE_TONE[p]}>{p}</Pill>
                      {p !== "Planned" && !s.cancelled && <span className="mt-1 hidden text-[12px] text-slate sm:block">{s.attended.length} attended{left ? `, ${left} outcome${left > 1 ? "s" : ""} to record` : ""}</span>}
                    </span>
                    <span className="col-span-2 min-w-0 sm:col-span-1">
                      <span className="block font-medium">{s.title}</span>
                      <span className="block text-[12px] text-slate">
                        {formatInfo(s.format).short} · {s.host ? `hosted by ${org(s.host)}` : "run by the Deal Room team"}
                        {s.track ? ` · ${trackName(cfg, s.track)}` : ""}
                      </span>
                    </span>
                    <span className="hidden sm:block">{room(s.roomId)}</span>
                    <span className="col-span-2 text-[13px] text-slate sm:col-span-1">
                      {r.filter((x) => x.answer === "Accepted").length} in, {r.filter((x) => x.answer === "Declined").length} out, {s.invitees.length - r.length} to answer
                      {p !== "Planned" && !s.cancelled && <span className="sm:hidden"> · {s.attended.length} attended{left ? `, ${left} to record` : ""}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {open && <SessionDetail key={open.id} s={open} onClose={() => go({ s: undefined })} />}

      <details className="surface mt-4 p-5">
        <summary className="cursor-pointer text-[15px] font-medium">The eleven formats</summary>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {SESSION_FORMATS.map((f) => (
            <div key={f.format}>
              <dt className="text-[14px] font-medium">{f.format}</dt>
              <dd className="text-[13px] text-slate">{f.what}</dd>
            </div>
          ))}
        </dl>
      </details>
      {!can("schedule") && <p className="mt-3 text-[12px] text-slate">{me?.role === "Oversight" ? "Oversight reads the programme; the coordinator plans it." : "The coordinator and the lead plan sessions; operations take attendance."}</p>}
    </>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={ok ? "text-ok" : "text-warn"}>
      {ok ? "✓" : "!"} {text}
    </li>
  );
}

/** Plan a session, or move one: the same rules as the reducer, shown before saving. */
function PlanForm({ date, session, onDone }: { date: string; session?: DrSession; onDone: () => void }) {
  const { state, dispatch, dr, cfg, now } = useDr();
  const [format, setFormat] = useState<SessionFormat>(session?.format ?? "Investment opportunity presentation");
  const [title, setTitle] = useState(session?.title ?? "");
  const [day, setDay] = useState(session?.start.slice(0, 10) ?? date);
  const [start, setStart] = useState(session?.start.slice(11) ?? "14:00");
  const [end, setEnd] = useState(session?.end.slice(11) ?? "15:00");
  const [roomId, setRoom] = useState(session?.roomId ?? cfg!.sessionRooms[0]);
  const [host, setHost] = useState(session?.host ?? "");
  const [track, setTrack] = useState(session?.track ?? "");
  const info = formatInfo(format);
  const hosts = dr.apps
    .filter((a) => a.eventId === cfg!.eventId && invitable(a))
    .filter((a) => (info.hostKind === "seeker" ? a.type === "seeker" : info.hostKind === "provider" ? a.type === "provider" && !a.challenge : info.hostKind === "partner" ? roleOf(a) === "partner" || (!!a.challenge && !!a.providerKind && PARTNER_KINDS.includes(a.providerKind)) : info.hostKind === "challenge" ? !!a.challenge || a.providerKind === "Corporate buyer" : true))
    .sort((a, b) => a.org.name.localeCompare(b.org.name));
  const draft: DrSessionDraft = { id: session?.id, eventId: cfg!.eventId, format, title, start: `${day} ${start}`, end: `${day} ${end}`, roomId, host: host || undefined, track: track || undefined };
  const problems = sessionProblems(state, draft);
  const event = state.events.find((e) => e.id === cfg!.eventId)!;
  return (
    <section className="surface mb-4 p-5" aria-label={session ? "Move the session" : "Plan a session"}>
      <h2 className="h2 mb-3">{session ? "Change the session" : "Plan a session"}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Labeled label="Format" span>
          <select className="input" value={format} onChange={(e) => (setFormat(e.target.value as SessionFormat), setHost(""))}>
            {SESSION_FORMATS.map((f) => (
              <option key={f.format}>{f.format}</option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Title" span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Scale-up pitches: AI, software and fintech" />
        </Labeled>
        <Labeled label="Day">
          <select className="input" value={day} onChange={(e) => setDay(e.target.value)}>
            {PROGRAMME_DAYS.map((d) => {
              const v = addMinutes(`${event.startDate} 12:00`, (d.day - 1) * 1440).slice(0, 10);
              return (
                <option key={v} value={v}>
                  Day {d.day}, {fmtStamp(v, false)}
                </option>
              );
            })}
          </select>
        </Labeled>
        <Labeled label="From">
          <input className="input" type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
        </Labeled>
        <Labeled label="To">
          <input className="input" type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Labeled>
        <Labeled label="Room">
          <select className="input" value={roomId} onChange={(e) => setRoom(e.target.value)}>
            {cfg!.sessionRooms.map((id) => (
              <option key={id} value={id}>
                {state.rooms.find((r) => r.id === id)?.name ?? id}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Host" help={info.hostKind === "none" ? "Optional: the team runs this format" : info.hostKind === "challenge" ? "An institution or buyer with a verified challenge" : info.hostKind === "partner" ? "A verified commercial or strategic partner" : info.hostKind === "seeker" ? "A qualified business presenting" : "A verified investor or partner"} span>
          <select className="input" value={host} onChange={(e) => setHost(e.target.value)}>
            <option value="">{info.hostKind === "none" ? "The Deal Room team" : "Choose"}</option>
            {hosts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.org.name}, {typeLabel(a).toLowerCase()}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Strategic track" help="Optional">
          <select className="input" value={track} onChange={(e) => setTrack(e.target.value)}>
            <option value="">Any</option>
            {cfg!.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} {t.name}
              </option>
            ))}
          </select>
        </Labeled>
      </div>
      <p className="mt-3 text-[13px] text-slate">{info.what}</p>
      {problems.length > 0 && title.trim() && (
        <ul role="alert" className="mt-3 space-y-0.5 rounded-md bg-bad-50 px-3 py-2 text-[13px] text-bad">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="btn-primary"
          disabled={problems.length > 0 || (info.hostKind !== "none" && !host)}
          onClick={() => {
            dispatch({ type: "dr/sessionSave", draft });
            onDone();
          }}
        >
          {session ? "Save the change" : "Plan it"}
        </button>
        <button className="btn-quiet" onClick={onDone}>
          Cancel
        </button>
        {info.hostKind !== "none" && !host && <span className="text-[13px] text-slate">This format needs a host.</span>}
        {now >= `${day} ${start}` && <span className="text-[13px] text-slate">Pick a time after {fmtStamp(now)}.</span>}
      </div>
    </section>
  );
}

/** One session: who is invited and how they answered, attendance, each attendee's outcome, invitations to add. */
function SessionDetail({ s, onClose }: { s: DrSession; onClose: () => void }) {
  const { state, dispatch, dr, cfg, now, can } = useDr();
  const [editing, setEditing] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const p = phase(s, now);
  const info = formatInfo(s.format);
  const room = state.rooms.find((r) => r.id === s.roomId)?.name ?? s.roomId;
  const people = [...(s.host ? [s.host] : []), ...s.invitees].map((id) => dr.apps.find((a) => a.id === id)!).filter(Boolean);
  const canAttend = !s.cancelled && (can("liveboard") || can("outcome")) && now >= addMinutes(s.start, -30) && now.slice(0, 10) === s.start.slice(0, 10);
  const canOutcome = !s.cancelled && can("outcome") && now >= s.start;
  const future = !s.cancelled && now < s.start;
  // who else to invite: qualified or verified, not already in; on the session's track first
  const pool = dr.apps
    .filter((a) => a.eventId === s.eventId && invitable(a) && a.id !== s.host && !s.invitees.includes(a.id))
    .filter((a) => !filter.trim() || `${a.org.name} ${a.org.sector} ${typeLabel(a)}`.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => Number(b.track === s.track) - Number(a.track === s.track) || a.org.name.localeCompare(b.org.name));

  return (
    <section className="surface mt-4" aria-label={s.title}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="text-[12px] text-slate">{s.format}</div>
          <h2 className="h2 mt-0.5">{s.title}</h2>
          <div className="mt-1 text-[13px] text-slate">
            {fmtStamp(s.start)} to {s.end.slice(11)} · {room} · run by {staffName(dr, s.owner)}
            {s.track ? ` · ${trackName(cfg!, s.track)}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={PHASE_TONE[p]}>{p}</Pill>
          {future && can("schedule") && (
            <button className="btn-secondary btn-sm" onClick={() => setEditing((v) => !v)}>
              {editing ? "Close" : "Move or change"}
            </button>
          )}
          <button className="btn-quiet" onClick={onClose} aria-label="Close the session">
            Close
          </button>
        </div>
      </div>
      {s.cancelled && <p className="border-b border-line bg-bad-50 px-5 py-2 text-[13px] text-bad">Cancelled {fmtStamp(s.cancelled.at)}: {s.cancelled.reason}</p>}
      {editing && (
        <div className="border-b border-line p-4">
          <PlanForm date={s.start.slice(0, 10)} session={s} onDone={() => setEditing(false)} />
        </div>
      )}
      <p className="px-5 pt-3 text-[13px] text-slate">{info.what}</p>

      {/* one row per participant: columns on a wide screen; on a phone, the name and answer, then a large attendance tick, then the outcome */}
      <ul className="mt-2">
        <li className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.6fr)] gap-3 px-5 py-2 text-[12px] font-medium text-slate sm:grid" aria-hidden="true">
          <span>Participant</span>
          <span>Answer</span>
          <span>Attended</span>
          <span>Outcome</span>
        </li>
        {people.map((a) => {
          const isHost = a.id === s.host;
          const r = s.responses[a.id];
          const going = isHost || r?.answer === "Accepted";
          const was = s.attended.includes(a.id);
          const o = s.outcomes.find((x) => x.appId === a.id);
          const ticks = canAttend && (going || was);
          return (
            <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-t border-line px-5 py-3 text-[14px] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.6fr)]">
              <div className="min-w-0">
                <span className="font-medium">{a.org.name}</span>
                <div className="text-[12px] text-slate">{isHost ? "Host" : typeLabel(a)}</div>
              </div>
              <div className="justify-self-end text-[13px] sm:justify-self-start">{isHost ? <Pill tone="ink">Hosting</Pill> : r ? <Pill tone={r.answer === "Accepted" ? "ok" : "mute"}>{r.answer}</Pill> : <span className="text-slate">No answer yet</span>}</div>
              <div className={`col-span-2 sm:col-span-1 ${!ticks && !was && !(p === "Held" && going) ? "hidden sm:block" : ""}`}>
                {ticks ? (
                  <label className={`flex min-h-11 items-center gap-3 rounded-md border px-3 text-[14px] sm:min-h-0 sm:border-0 sm:px-0 sm:text-[13px] ${was ? "border-ok bg-ok-50 sm:bg-transparent" : "border-line"}`}>
                    <input type="checkbox" className="h-5 w-5 sm:h-4 sm:w-4" checked={was} onChange={(e) => dispatch({ type: "dr/sessionAttend", sessionId: s.id, appId: a.id, present: e.target.checked })} />
                    {was ? "Present" : "Not yet: tap when they arrive"}
                  </label>
                ) : (
                  <span className="text-[13px] text-slate">{was ? "Present" : p === "Held" && going ? "Absent" : "–"}</span>
                )}
              </div>
              <div className={`col-span-2 min-w-0 sm:col-span-1 ${isHost || (!o && !(canOutcome && was)) ? "hidden sm:block" : ""}`}>{isHost ? <span className="text-[13px] text-slate">–</span> : <OutcomeCell s={s} appId={a.id} current={o} editable={canOutcome && was} />}</div>
            </li>
          );
        })}
      </ul>

      {future && can("schedule") && (
        <div className="border-t border-line px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 className="text-[15px] font-medium">Invite</h3>
            <input className="input h-9 w-56 text-[13px]" placeholder="Filter by name, sector or kind" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter who to invite" />
          </div>
          {pool.length === 0 ? (
            <p className="mt-2 text-[13px] text-slate">No one else qualified or verified to invite.</p>
          ) : (
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-md border border-line">
              {pool.slice(0, 40).map((a) => {
                const busy = acceptProblems(dr, s, a.id);
                return (
                  <li key={a.id} className="border-b border-line last:border-0">
                    <label className="flex items-start gap-2 px-3 py-2 text-[14px]">
                      <input type="checkbox" className="mt-1" checked={picked.includes(a.id)} onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, a.id] : xs.filter((x) => x !== a.id)))} />
                      <span className="min-w-0">
                        {a.org.name}
                        <span className="block text-[12px] text-slate">
                          {typeLabel(a)} · {a.org.sector || a.mandate?.sectors[0]}
                          {busy.length ? ` · busy then: ${busy[0].replace(/^You (have|are)/, (m) => (m === "You have" ? "has" : "is"))}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <button className="btn-secondary btn-sm mt-3" disabled={!picked.length} onClick={() => (dispatch({ type: "dr/sessionInvite", sessionId: s.id, appIds: picked }), setPicked([]))}>
            Invite {picked.length || ""}
          </button>
          <span className="ml-3 text-[12px] text-slate">Each gets an email and a text, and accepts or declines from their Deal Room page.</span>
        </div>
      )}

      {future && can("schedule") && (
        <div className="flex flex-wrap items-end gap-2 border-t border-line px-5 py-4">
          <Labeled label="Cancel the session">
            <input className="input h-9 w-72 text-[13px]" placeholder="Reason, sent to everyone attending" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </Labeled>
          <button className="btn-secondary btn-sm text-bad" disabled={!cancelReason.trim()} onClick={() => dispatch({ type: "dr/sessionCancel", sessionId: s.id, reason: cancelReason })}>
            Cancel it
          </button>
        </div>
      )}

      <details className="border-t border-line px-5 py-3">
        <summary className="cursor-pointer text-[13px] text-slate">History, {s.history.length}</summary>
        <ul className="mt-2 space-y-1 text-[13px]">
          {[...s.history].reverse().map((h, i) => (
            <li key={i}>
              <span className="text-slate">{fmtStamp(h.at)}</span> {h.by === "applicant" || h.by === "door" ? "" : `${staffName(dr, h.by)}: `}
              {h.what}
            </li>
          ))}
        </ul>
      </details>
      {s.host && (
        <p className="border-t border-line px-5 py-3 text-[12px] text-slate">
          Host record:{" "}
          {can("review") || can("assign") ? (
            <Link className="link" href={`/dealroom/applications/${s.host}`}>
              {dr.apps.find((a) => a.id === s.host)?.org.name}
            </Link>
          ) : (
            dr.apps.find((a) => a.id === s.host)?.org.name
          )}
          , day {eventDay(state.events.find((e) => e.id === s.eventId)!.startDate, s.start)} of the summit.
        </p>
      )}
    </section>
  );
}

function OutcomeCell({ s, appId, current, editable }: { s: DrSession; appId: string; current?: DrSession["outcomes"][number]; editable: boolean }) {
  const { dispatch } = useDr();
  const [category, setCategory] = useState<MeetingOutcome | "">(current?.category ?? "");
  const [note, setNote] = useState(current?.note ?? "");
  // once saved, it reads as saved; Change opens it again
  const [editing, setEditing] = useState(!current);
  if (!editable) return current ? <Outcome o={current} /> : <span className="text-[13px] text-slate">–</span>;
  if (current && !editing)
    return (
      <div className="flex items-start justify-between gap-2">
        <div>
          <Outcome o={current} />
          <span className="text-[12px] text-ok">✓ Saved {current.at.slice(11)}</span>
        </div>
        <button className="btn-quiet text-[13px]" onClick={() => (setCategory(current.category), setNote(current.note), setEditing(true))}>
          Change
        </button>
      </div>
    );
  const needsNote = !!category && category !== "No fit" && !note.trim();
  const changed = category !== (current?.category ?? "") || note !== (current?.note ?? "");
  return (
    <div className="grid gap-1.5">
      <select className="input h-11 text-[14px] sm:h-8 sm:text-[13px]" value={category} onChange={(e) => setCategory(e.target.value as MeetingOutcome)} aria-label="Outcome">
        <option value="">Choose an outcome</option>
        {MEETING_OUTCOMES.map((x) => (
          <option key={x} value={x} title={MEETING_OUTCOME_HELP[x]}>
            {x}
          </option>
        ))}
      </select>
      {category && category !== "No fit" && <input className="input h-11 text-[14px] sm:h-8 sm:text-[13px]" value={note} placeholder="What happens next, and who owns it" onChange={(e) => setNote(e.target.value)} aria-label="Next step" />}
      {(changed || current) && (
        <div className="flex items-center gap-2">
          {changed && (
            <button
              className="btn-primary btn-sm"
              disabled={!category || needsNote}
              onClick={() => {
                if (!category) return;
                dispatch({ type: "dr/sessionOutcome", sessionId: s.id, appId, category, note });
                setEditing(false);
              }}
            >
              Save the outcome
            </button>
          )}
          {current && (
            <button className="btn-quiet text-[13px]" onClick={() => setEditing(false)}>
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Outcome({ o }: { o: DrSession["outcomes"][number] }) {
  return (
    <div className="text-[13px]">
      <span className="font-medium">{o.category}</span>
      {o.note && <span className="block text-slate">{o.note}</span>}
    </div>
  );
}
