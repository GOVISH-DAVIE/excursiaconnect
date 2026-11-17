"use client";

/**
 * A Deal Room participant's meetings (backend-plan.md, M3.2). The emails about a meeting link here: one proposed to
 * confirm by its date, a move the other side asks for, and the reminders before it. What waits on the participant
 * comes first; then the agenda day by day, each meeting with its own actions in its row: confirm, ask to move it to
 * a time when both sides and a table are free, answer the other side's request, add it to a calendar. Meetings that
 * have taken place fold away under Earlier.
 */
import Link from "next/link";
import { useState } from "react";
import type { MyMeeting, MyMeetings } from "@excursia/contracts/meetings";
import { fmtStamp } from "@excursia/domain/time";
import { useMoveTimes, useMyMeetingActions, useMyMeetings } from "@/features/meetings/hooks/use-my-meetings";
import { Panel, ParticipantPage, Skeleton } from "../participant";

export function MyMeetingsPage({ slug }: { slug: string }) {
  return (
    <ParticipantPage
      slug={slug}
      page="meetings"
      title="Meetings"
      lede="Your one-to-one meetings in the Deal Room. Confirm each one by its date: a time nobody confirms is released for others."
      signIn="Sign in to see your meetings"
      aside={<HowItWorks slug={slug} />}
    >
      <Body slug={slug} />
    </ParticipantPage>
  );
}

/** Whether the meeting is behind us: held, a no-show, or its time gone. */
const done = (m: MyMeeting, now: string) => m.status === "Held" || m.status === "No-show" || (m.end <= now && m.status !== "In progress");
/** What the participant must do about it now, if anything. */
const needs = (m: MyMeeting) => m.can.confirm || m.can.answer;

function Body({ slug }: { slug: string }) {
  const q = useMyMeetings(slug, true);
  if (q.isPending) return <Skeleton rows={4} />;
  if (q.isError)
    return (
      <Panel title="Your meetings didn't load">
        <p className="mb-4 text-[15px] text-slate">{q.error.message}</p>
        <button className="btn-secondary" onClick={() => q.refetch()}>
          Try again
        </button>
      </Panel>
    );
  const d = q.data;
  if (!d.meetings.length)
    return (
      <Panel title="No meetings yet">
        <p className="max-w-[60ch] text-[15px] text-slate">
          Once you and the other party both accept an introduction, the Deal Room team proposes a time and a table, and we email you to confirm it. It then appears here.
        </p>
        <Link href={`/e/${slug}/deal-room/introductions`} className="btn-secondary mt-4">
          See your introductions
        </Link>
      </Panel>
    );
  const now = d.event.now;
  const ahead = d.meetings.filter((m) => !done(m, now));
  const earlier = d.meetings.filter((m) => done(m, now)).reverse();
  const waiting = ahead.filter(needs);
  const days = [...new Set(ahead.map((m) => m.start.slice(0, 10)))];
  return (
    <>
      {waiting.length > 0 && <Waiting list={waiting} />}
      {days.map((day) => {
        const list = ahead.filter((m) => m.start.slice(0, 10) === day);
        return (
          <section key={day} aria-labelledby={`day-${day}`}>
            <h2 id={`day-${day}`} className="mb-3 flex items-baseline gap-2 text-[17px] font-medium">
              {fmtStamp(`${day} 00:00`, false)}
              <span className="text-[14px] font-normal text-slate">
                {list.length} meeting{list.length === 1 ? "" : "s"}
              </span>
            </h2>
            <ul className="agenda surface overflow-hidden">
              {list.map((m) => (
                <Row key={`${m.id}:${m.side}`} slug={slug} m={m} d={d} />
              ))}
            </ul>
          </section>
        );
      })}
      {ahead.length === 0 && (
        <Panel title="Nothing ahead">
          <p className="text-[15px] text-slate">Every meeting has taken place. Their record is below.</p>
        </Panel>
      )}
      {earlier.length > 0 && (
        <details className="group" open={ahead.length === 0}>
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-[var(--r-sm)] text-[15px] font-medium text-slate hover:text-ink">
            <svg className="size-4 transition-transform group-open:rotate-90" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Earlier ({earlier.length})
          </summary>
          <ul className="agenda surface mt-3 overflow-hidden">
            {earlier.map((m) => (
              <Row key={`${m.id}:${m.side}`} slug={slug} m={m} d={d} past />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** What waits on the participant, each a link down to its meeting. */
function Waiting({ list }: { list: MyMeeting[] }) {
  return (
    <section className="surface p-5 sm:p-6" aria-labelledby="waiting-title">
      <h2 id="waiting-title" className="h2 flex items-center gap-2">
        <span className="portal__count" aria-hidden="true">
          {list.length}
        </span>
        {list.length === 1 ? "One meeting needs you" : "Meetings need you"}
      </h2>
      <ul className="mt-3 space-y-2">
        {list.map((m) => (
          <li key={m.id} className="text-[15px]">
            <a href={`#${m.id}`} className="link">
              {m.can.answer ? `${m.other.org} asks to move ${fmtStamp(m.start)}` : `Confirm ${fmtStamp(m.start)} with ${m.other.org}`}
            </a>
            {m.can.confirm && m.confirmBy && <span className="text-slate">, by {fmtStamp(m.confirmBy)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function status(m: MyMeeting): { tone: string; label: string } {
  if (m.lapsed) return { tone: "bg-paper-200 text-slate", label: "Released" };
  if (m.status === "Change requested" && m.change) return { tone: "bg-warn-50 text-warn", label: m.change.agreed ? "Move agreed" : m.change.byMe ? "Move asked" : "Asks to move" };
  if (m.status === "Proposed") return m.mine.confirmed ? { tone: "bg-paper-200 text-ink", label: "Waiting for them" } : { tone: "bg-warn-50 text-warn", label: "To confirm" };
  if (m.status === "Confirmed") return { tone: "bg-ok-50 text-ok", label: "Confirmed" };
  if (m.status === "In progress") return { tone: "bg-ok text-white", label: "Under way" };
  if (m.status === "Held") return { tone: "bg-paper-200 text-ink", label: "Held" };
  if (m.status === "No-show") return { tone: "bg-bad-50 text-bad", label: "Missed" };
  return { tone: "bg-paper-200 text-slate", label: m.status };
}

/** One meeting: time, who and where, its status, and what the participant can do with it. */
function Row({ slug, m, d, past = false }: { slug: string; m: MyMeeting; d: MyMeetings; past?: boolean }) {
  const act = useMyMeetingActions(slug, m.id);
  const [asking, setAsking] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [why, setWhy] = useState("");
  const s = status(m);
  const error = act.confirm.error ?? act.answer.error ?? act.calendar.error;
  const ch = m.status === "Change requested" && !m.lapsed ? m.change : null;
  const note = past
    ? null
    : m.lapsed
      ? "Nobody confirmed it in time, so the time was released. The Deal Room team will propose another and email you."
      : m.status === "Proposed"
        ? m.mine.confirmed
          ? `You confirmed. It is booked once ${m.other.org} confirms too${m.confirmBy ? `, by ${fmtStamp(m.confirmBy)}` : ""}.`
          : `Please confirm by ${fmtStamp(m.confirmBy!)}.${m.theirs.confirmed ? ` ${m.other.org} has confirmed.` : ""}`
        : null;
  const actions = !past && !asking && !declining && (m.can.confirm || m.can.calendar || m.can.move || m.can.answer);
  return (
    <li id={m.id} className="agenda__row scroll-mt-[calc(var(--ptop)+16px)]">
      <div className="agenda__time">
        <span className={`block text-[17px] font-medium ${past ? "text-slate" : "text-ink"}`}>{m.start.slice(11)}</span>
        <span className="block text-[13px] text-slate">to {m.end.slice(11)}</span>
      </div>
      <div className="agenda__who min-w-0">
        <p className={`text-[16px] font-medium ${past ? "text-slate" : "text-ink"}`}>{m.other.org}</p>
        <p className="text-[14px] text-slate">
          {m.other.person ? `${m.other.person} · ` : ""}
          {m.other.label}
        </p>
        <p className={`mt-1 text-[14px] ${past ? "text-slate" : "text-ink"}`}>
          {m.online ? (
            m.link && m.status === "Confirmed" ? (
              <a className="link" href={m.link} target="_blank" rel="noreferrer">
                Join online
              </a>
            ) : (
              "Online"
            )
          ) : (
            m.where
          )}
        </p>
      </div>
      <div className="agenda__status">
        <span className={`pill whitespace-nowrap ${s.tone}`}>{s.label}</span>
      </div>

      {(note || ch || error || actions || asking || declining) && (
        <div className="agenda__more space-y-3">
          {note && <p className="max-w-[62ch] text-[14px] text-slate">{note}</p>}

          {/* a move: who asked, the time proposed, and where it stands */}
          {ch && (
            <div className="rounded-[var(--r-sm)] bg-paper-200 px-4 py-3 text-[14px]">
              <p className="text-ink">
                {ch.byMe ? "You asked" : `${m.other.org} asks`} to move it
                {ch.start ? (
                  <>
                    {" "}
                    to <b className="font-medium">{fmtStamp(ch.start)}</b>
                  </>
                ) : null}
                : {ch.reason}
              </p>
              <p className="mt-1 text-slate">
                {!ch.start
                  ? "The Deal Room team will propose another time; until then this one stands."
                  : ch.agreed
                    ? "Both of you agreed. The Deal Room team confirms the new time; until then this one stands."
                    : ch.byMe
                      ? `Waiting for ${m.other.org} to agree; then the Deal Room team confirms it.`
                      : "If you agree, the Deal Room team confirms the new time. If you decline, it stays where it is."}
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-[var(--r-sm)] bg-bad-50 px-3 py-2 text-[14px] text-bad">
              {error.message}
            </p>
          )}

          {actions && (
            <div className="flex flex-wrap gap-2">
              {m.can.confirm && (
                <button className="btn-primary btn-sm" disabled={act.confirm.isPending} onClick={() => act.confirm.mutate()}>
                  {act.confirm.isPending ? "Confirming…" : "Confirm"}
                </button>
              )}
              {m.can.answer && ch?.start && (
                <>
                  <button className="btn-primary btn-sm" disabled={act.answer.isPending} onClick={() => act.answer.mutate({ agree: true })}>
                    {act.answer.isPending ? "Sending…" : "Agree"}
                  </button>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setDeclining(true);
                      setWhy("");
                    }}
                  >
                    Decline
                  </button>
                </>
              )}
              {m.can.calendar && (
                <button className="btn-secondary btn-sm" disabled={act.calendar.isPending} onClick={() => act.calendar.mutate(m.start)}>
                  Add to calendar
                </button>
              )}
              {m.can.move && (
                <button className="btn-quiet btn-sm" onClick={() => setAsking(true)}>
                  Ask to move
                </button>
              )}
            </div>
          )}

          {declining && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                act.answer.mutate({ agree: false, reason: why.trim() || undefined }, { onSuccess: () => setDeclining(false) });
              }}
            >
              <label className="block">
                <span className="label">Why, for {m.other.org} (optional)</span>
                <input className="input" maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} autoFocus />
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary btn-sm" disabled={act.answer.isPending}>
                  {act.answer.isPending ? "Sending…" : "Decline the move"}
                </button>
                <button type="button" className="btn-quiet btn-sm" onClick={() => setDeclining(false)}>
                  Back
                </button>
              </div>
            </form>
          )}
          {asking && <AskMove slug={slug} m={m} d={d} onDone={() => setAsking(false)} />}
        </div>
      )}
    </li>
  );
}

/** Suggest a new time: only times when both sides and a table are free are offered. */
function AskMove({ slug, m, d, onDone }: { slug: string; m: MyMeeting; d: MyMeetings; onDone: () => void }) {
  const act = useMyMeetingActions(slug, m.id);
  const today = d.event.now.slice(0, 10);
  const days = d.event.days.filter((x) => x >= today);
  const [day, setDay] = useState(days.includes(m.start.slice(0, 10)) ? m.start.slice(0, 10) : (days[0] ?? ""));
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const t = useMoveTimes(slug, m.id, day);
  const times = t.data?.times ?? [];
  return (
    <form
      className="space-y-3 rounded-[var(--r-sm)] border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (day && time && reason.trim()) act.ask.mutate({ start: `${day} ${time}`, reason: reason.trim() }, { onSuccess: onDone });
      }}
    >
      <p className="text-[14px] text-slate">Only times when you are both free and a table is open are listed. {m.other.org} agrees or declines first; then the Deal Room team confirms it.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Day</span>
          <select
            className="input"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setTime("");
            }}
          >
            {days.map((x) => (
              <option key={x} value={x}>
                {fmtStamp(`${x} 00:00`, false)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Time</span>
          <select className="input" value={time} disabled={!times.length} onChange={(e) => setTime(e.target.value)}>
            <option value="">{t.isPending ? "Looking for free times…" : t.isError ? "Couldn't load the times" : times.length ? "Choose a time" : "No free time that day"}</option>
            {times.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Why, for {m.other.org}</span>
        <input className="input" placeholder="For example, our CEO lands at noon" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {act.ask.error && (
        <p role="alert" className="rounded-[var(--r-sm)] bg-bad-50 px-3 py-2 text-[14px] text-bad">
          {act.ask.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary btn-sm" disabled={act.ask.isPending || !day || !time || !reason.trim()}>
          {act.ask.isPending ? "Sending…" : "Send the request"}
        </button>
        <button type="button" className="btn-quiet btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The few rules a participant needs, beside the agenda on a big screen and after it on a phone. */
function HowItWorks({ slug }: { slug: string }) {
  return (
    <Panel title="How meetings work">
      <ul className="space-y-3 text-[14px] text-slate">
        <li>
          <b className="font-medium text-ink">Confirm in time.</b> A proposed time is held for both of you until its confirm-by date, then released.
        </li>
        <li>
          <b className="font-medium text-ink">Moving one.</b> Pick a time you are both free; the other side agrees, then the Deal Room team confirms it.
        </li>
        <li>
          <b className="font-medium text-ink">On the day.</b> We remind you a day before and half an hour before. Check in at the Deal Room desk with your badge.
        </li>
      </ul>
      <Link href={`/e/${slug}/badge`} className="link mt-4 inline-block text-[14px]">
        Open your badge
      </Link>
    </Panel>
  );
}
