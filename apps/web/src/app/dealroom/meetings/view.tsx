"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Empty, PageHeader, Section, Tabs } from "@/components/ui";
import { useStore } from "@/lib/store";
import { DR_ZONE, compact, drCan, lapsed, occupies, readyToSchedule, sideName, slotTimes } from "@excursia/domain/dealroom/logic";
import type { DrMeeting } from "@excursia/domain/dealroom/types";
import { row } from "@excursia/domain/csv";
import { downloadCsv } from "@/lib/download";
import { addMinutes, fmtStamp } from "@excursia/domain/time";
import { Refusal, useDr } from "../bits";
import { MeetingPanel, MeetingPill, SlotPicker } from "./parts";

const tabs = ["Ready to schedule", "Schedule", "Changes", "Caps", "Rooms and tables", "Export"] as const;

/** DO-1 to DO-6: operations turns accepted introductions into a schedule that holds. */
export default function Meetings() {
  // a link to this page with other filters starts the view afresh
  const q = useSearchParams();
  return <MeetingsBody key={q.toString()} />;
}

function MeetingsBody() {
  const { dr, cfg, me, now } = useDr();
  const q = useSearchParams();
  // a drill-down lands on the schedule for a day, a participant, a status or one meeting
  const asked = tabs.find((t) => t === q.get("tab")) ?? (q.get("day") || q.get("meeting") || q.get("who") ? "Schedule" : undefined);
  const [tab, setTab] = useState<(typeof tabs)[number]>(asked ?? "Ready to schedule");
  if (!cfg) return null;
  if (!drCan(me, "schedule")) return <Refusal title="Scheduling is for operations and the lead">Reviewers see each match&apos;s meeting on its page.</Refusal>;
  const ready = readyToSchedule(dr, cfg).length;
  const changes = dr.meetings.filter((m) => m.status === "Change requested" && !lapsed(m, cfg, now)).length;
  return (
    <>
      <PageHeader title="Meetings" kicker={`${dr.meetings.filter((m) => occupies(m, cfg, now) || m.status === "Held").length} booked. A slot is ${cfg.rules.meetingMin} minutes with ${cfg.rules.bufferMin} between; a room, a table or a person is never booked twice.`} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} counts={{ "Ready to schedule": ready, Changes: changes }} />
      {tab === "Ready to schedule" && <Ready />}
      {tab === "Schedule" && <Grid day={q.get("day") ?? undefined} meeting={q.get("meeting") ?? undefined} who={q.get("who") ?? undefined} status={q.get("status") ?? undefined} />}
      {tab === "Changes" && <Changes />}
      {tab === "Caps" && <Caps />}
      {tab === "Rooms and tables" && <Rooms />}
      {tab === "Export" && <Export />}
    </>
  );
}

function Ready() {
  const { dr, cfg, dispatch } = useDr();
  const [open, setOpen] = useState<string | null>(null);
  const [made, setMade] = useState<number | null>(null);
  const list = readyToSchedule(dr, cfg!);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Section title={list.length ? `${list.length} match${list.length === 1 ? "" : "es"} ready to schedule` : "Ready to schedule"} flush>
        {list.length === 0 ? (
          <div className="p-5">
            <Empty>Every match both parties accepted has a slot. New ones appear here as introductions are accepted.</Empty>
          </div>
        ) : (
          <ul>
            {list.map((m) => {
              const s = dr.apps.find((a) => a.id === m.seekerId)!;
              const p = dr.apps.find((a) => a.id === m.providerId)!;
              return (
                <li key={m.id} className="px-5 py-3 border-b border-line last:border-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[14px]">
                      <Link className="font-medium hover:underline" href={`/dealroom/matches/${m.id}`}>
                        {s.org.name} · {p.org.name}
                      </Link>
                      <div className="text-[12px] text-slate">
                        {s.ask ? compact(s.ask.amount, s.ask.currency) : ""} · {p.providerKind} · accepted {fmtStamp(m.intro!.provider!.at > m.intro!.seeker!.at ? m.intro!.provider!.at : m.intro!.seeker!.at)}
                      </div>
                    </div>
                    <button className="btn-secondary btn-sm" onClick={() => setOpen(open === m.id ? null : m.id)}>
                      {open === m.id ? "Close" : "Propose a slot"}
                    </button>
                  </div>
                  {open === m.id && (
                    <div className="mt-3 rounded-md bg-paper p-3">
                      <SlotPicker matchId={m.id} label="Propose this slot" initial={{ flagged: p.providerKind === "DFI" }} onBook={(r, override) => { dispatch({ type: "dr/propose", req: { ...r, matchId: m.id }, override }); setOpen(null); }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <Section title="Auto-propose">
        <p className="text-[14px] text-slate">Proposes the earliest free slot for every ready match, inside the rules. Confirmed meetings are never moved; each proposal still needs both parties to confirm.</p>
        <button
          className="btn-primary mt-3"
          disabled={!list.length}
          onClick={() => {
            const before = dr.meetings.length;
            dispatch({ type: "dr/autoPropose", limit: 40 });
            setMade(-before);
          }}
        >
          Propose a schedule
        </button>
        {made !== null && <p className="mt-2 text-[13px] text-ok">{dr.meetings.length + made} proposed.</p>}
      </Section>
    </div>
  );
}

/** Short names for the status groups the reports link with. */
const STATUS_NAMES: Record<string, string> = { "Confirmed,In progress,Proposed,Change requested": "Booked, not yet held", "Confirmed,In progress": "Confirmed" };

/** The day grid. A drill-down can open it on a day, on one meeting, or with one participant's meetings or one status picked out. */
function Grid(props: { day?: string; meeting?: string; who?: string; status?: string }) {
  const { state } = useStore();
  const { dr, cfg, event, now } = useDr();
  const days = Array.from({ length: event.days }, (_, i) => addMinutes(`${event.startDate} 00:00`, i * 1440).slice(0, 10));
  const opened = dr.meetings.find((m) => m.id === props.meeting);
  const [day, setDay] = useState(opened?.start.slice(0, 10) ?? days.find((d) => d === props.day) ?? days.find((d) => d === now.slice(0, 10)) ?? days[0]);
  const [pick, setPick] = useState<string | null>(opened?.id ?? null);
  const [who, setWho] = useState(props.who ?? "");
  const [status, setStatus] = useState(props.status ?? "");
  const whoApp = dr.apps.find((a) => a.id === who);
  const statuses = status ? status.split(",") : [];
  const lit = (m: DrMeeting) => {
    const mm = dr.matches.find((x) => x.id === m.matchId);
    return (!who || mm?.seekerId === who || mm?.providerId === who) && (!statuses.length || statuses.includes(m.status));
  };
  const focus = !!who || statuses.length > 0;
  const rows = state.rooms.filter((r) => r.zoneId === DR_ZONE && cfg!.rooms[r.id]).flatMap((r) => Array.from({ length: cfg!.rooms[r.id].tables }, (_, i) => ({ r, table: i + 1 })));
  const times = slotTimes(cfg!);
  const todays = dr.meetings.filter((m) => m.start.slice(0, 10) === day && m.status !== "Cancelled");
  const name = (m: DrMeeting) => {
    const mm = dr.matches.find((x) => x.id === m.matchId)!;
    return `${dr.apps.find((a) => a.id === mm.seekerId)?.org.name.split(" ")[0]} · ${dr.apps.find((a) => a.id === mm.providerId)?.org.name.split(" ")[0]}`;
  };
  const picked = dr.meetings.find((m) => m.id === pick);
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1">
        {days.map((d) => (
          <button key={d} className={d === day ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setDay(d)}>
            {fmtStamp(d, false)} ({dr.meetings.filter((m) => m.start.slice(0, 10) === d && m.status !== "Cancelled" && (!focus || lit(m))).length})
          </button>
        ))}
      </div>
      {focus && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-slate">Picked out:</span>
          {whoApp && (
            <span className="pill bg-paper-200 text-ink">
              <Link className="hover:underline" href={`/dealroom/applications/${whoApp.id}`}>
                {whoApp.org.name}
              </Link>
              <button className="ml-1 text-slate hover:text-ink" aria-label="Clear the participant" onClick={() => setWho("")}>
                ×
              </button>
            </span>
          )}
          {statuses.length > 0 && (
            <span className="pill bg-paper-200 text-ink">
              {STATUS_NAMES[status] ?? statuses.join(" or ")}
              <button className="ml-1 text-slate hover:text-ink" aria-label="Clear the status" onClick={() => setStatus("")}>
                ×
              </button>
            </span>
          )}
          <span className="text-slate">Other meetings are faded.</span>
        </p>
      )}
      <div className="surface">
        <table className="text-[12px] border-collapse">
          <thead>
            <tr>
              <th className="th sticky left-0 bg-white z-10">Room, table</th>
              {times.map((t) => (
                <th key={t} className="th text-center px-1">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, table }) => (
              <tr key={r.id + table}>
                <td className="td whitespace-nowrap sticky left-0 bg-white z-10">
                  {r.name}
                  {cfg!.rooms[r.id].tables > 1 ? `, ${table}` : ""}
                </td>
                {times.map((t) => {
                  const m = todays.find((x) => x.roomId === r.id && x.table === table && x.start.slice(11) === t);
                  const busy = !m && todays.some((x) => x.roomId === r.id && x.table === table && x.start.slice(11) < t && x.end.slice(11) > t);
                  return (
                    <td key={t} className={`border border-line p-0.5 min-w-[92px] align-top ${busy ? "bg-paper-200" : ""}`}>
                      {m && (
                        <button className={`w-full text-left rounded px-1.5 py-1 ${focus && !lit(m) ? "opacity-25" : ""} ${m.status === "Held" ? "bg-ink text-white" : m.status === "In progress" ? "bg-ok text-white" : m.status === "No-show" ? "bg-bad-50 text-bad" : m.status === "Confirmed" ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn"}`} onClick={() => setPick(m.id)}>
                          <span className="block truncate font-medium">{name(m)}</span>
                          <span className="block opacity-80">{lapsed(m, cfg!, now) ? "Lapsed" : m.status}</span>
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {todays.filter((m) => m.link).length > 0 && <p className="mt-2 text-[13px] text-slate">Online: {todays.filter((m) => m.link).map((m) => `${m.start.slice(11)} ${name(m)}`).join("; ")}</p>}
      {picked && <MeetingPanel m={picked} onClose={() => setPick(null)} />}
    </>
  );
}

function Changes() {
  const { dr, cfg, now } = useDr();
  const [pick, setPick] = useState<string | null>(null);
  const list = dr.meetings.filter((m) => m.status === "Change requested" || (m.status === "Proposed" && !lapsed(m, cfg!, now)));
  const picked = dr.meetings.find((m) => m.id === pick);
  return (
    <>
      <Section title="Waiting on a participant" flush>
        {list.length === 0 ? (
          <div className="p-5">
            <Empty>Nothing waiting.</Empty>
          </div>
        ) : (
          <ul>
            {list.map((m) => {
              const mm = dr.matches.find((x) => x.id === m.matchId)!;
              const s = dr.apps.find((a) => a.id === mm.seekerId)!;
              const p = dr.apps.find((a) => a.id === mm.providerId)!;
              return (
                <li key={m.id}>
                  <button className="w-full text-left px-5 py-3 border-b border-line hover:bg-paper text-[14px] flex flex-wrap items-center justify-between gap-2" onClick={() => setPick(m.id)}>
                    <span>
                      {s.org.name} · {p.org.name}
                      <span className="block text-[12px] text-slate">
                        {fmtStamp(m.start)} ·{" "}
                        {m.change?.start
                          ? `${m.change.by === "seeker" ? s.org.name : p.org.name} asks to move it to ${fmtStamp(m.change.start)}; ${m.change.agreed ? "both agreed, ready to accept" : `waiting for ${m.change.by === "seeker" ? p.org.name : s.org.name} to agree`}`
                          : m.change
                            ? `the ${sideName(m.change.by)} asks: ${m.change.reason}`
                            : `to confirm: ${!m.confirm.seeker ? "seeker" : ""}${!m.confirm.seeker && !m.confirm.provider ? " and " : ""}${!m.confirm.provider ? "counterparty" : ""}`}
                      </span>
                    </span>
                    <MeetingPill m={m} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      {picked && <MeetingPanel m={picked} onClose={() => setPick(null)} />}
    </>
  );
}

function Caps() {
  const { dr, cfg, event, now } = useDr();
  const days = Array.from({ length: event.days }, (_, i) => addMinutes(`${event.startDate} 00:00`, i * 1440).slice(0, 10));
  const occ = dr.meetings.filter((m) => occupies(m, cfg!, now));
  const of = (id: string) => occ.filter((m) => { const mm = dr.matches.find((x) => x.id === m.matchId); return mm?.seekerId === id || mm?.providerId === id; });
  const providers = dr.apps.filter((a) => a.type === "provider" && a.verification?.state === "Verified");
  const seekers = dr.apps.filter((a) => a.type === "seeker" && of(a.id).length > 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Investors and partners, per day against their cap" flush>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Counterparty</th>
              {days.map((d) => (
                <th key={d} className="th-r">
                  {fmtStamp(d, false).split(" ").slice(1).join(" ")}
                </th>
              ))}
              <th className="th-r">All</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => {
              const cap = p.caps?.perDay ?? cfg!.rules.providerCapDay;
              const mine = of(p.id);
              return (
                <tr key={p.id}>
                  <td className="td text-[13px]">
                    <Link className="hover:underline" href={`/dealroom/meetings?tab=Schedule&who=${p.id}`}>
                      {p.org.name}
                    </Link>
                  </td>
                  {days.map((d) => {
                    const n = mine.filter((m) => m.start.slice(0, 10) === d).length;
                    return (
                      <td key={d} className={`td-r text-[13px] ${n >= cap ? "text-bad font-medium" : ""}`}>
                        {n}/{cap}
                      </td>
                    );
                  })}
                  <td className="td-r text-[13px]">
                    {mine.length}/{p.caps?.perEvent ?? cap * 4}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <Section title={`Seekers, against the cap of ${cfg!.rules.seekerCap}`} flush>
        <table className="w-full">
          <tbody>
            {seekers.map((s) => (
              <tr key={s.id}>
                <td className="td text-[13px]">
                  <Link className="hover:underline" href={`/dealroom/meetings?tab=Schedule&who=${s.id}`}>
                    {s.org.name}
                  </Link>
                </td>
                <td className={`td-r text-[13px] ${of(s.id).length >= cfg!.rules.seekerCap ? "text-bad font-medium" : ""}`}>
                  {of(s.id).length}/{cfg!.rules.seekerCap}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Rooms() {
  const { state, dispatch } = useStore();
  const { cfg, can } = useDr();
  // meeting rooms only: the presentation area and roundtable room hold sessions, not tables
  const rooms = state.rooms.filter((r) => r.zoneId === DR_ZONE && !cfg!.sessionRooms.includes(r.id));
  const [name, setName] = useState("");
  return (
    <Section title="Deal Room rooms and tables" flush>
      <table className="w-full">
        <thead>
          <tr>
            <th className="th">Room</th>
            <th className="th">Tables</th>
            <th className="th">Open from</th>
            <th className="th">To</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => {
            const rc = cfg!.rooms[r.id] ?? { tables: 1, from: "09:00", to: "17:30" };
            return (
              <tr key={r.id}>
                <td className="td text-[14px]">{r.name}</td>
                <td className="td">
                  <input className="input h-8 w-20 text-[13px]" type="number" min={1} max={12} disabled={!can("schedule")} defaultValue={rc.tables} onBlur={(e) => Number(e.target.value) !== rc.tables && dispatch({ type: "dr/roomConfig", roomId: r.id, tables: Number(e.target.value), from: rc.from, to: rc.to })} />
                </td>
                <td className="td">
                  <input className="input h-8 w-28 text-[13px]" type="time" disabled={!can("schedule")} defaultValue={rc.from} onBlur={(e) => e.target.value !== rc.from && dispatch({ type: "dr/roomConfig", roomId: r.id, tables: rc.tables, from: e.target.value, to: rc.to })} />
                </td>
                <td className="td">
                  <input className="input h-8 w-28 text-[13px]" type="time" disabled={!can("schedule")} defaultValue={rc.to} onBlur={(e) => e.target.value !== rc.to && dispatch({ type: "dr/roomConfig", roomId: r.id, tables: rc.tables, from: rc.from, to: e.target.value })} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {can("schedule") && (
        <div className="px-5 py-3 border-t border-line flex flex-wrap gap-2">
          <input className="input h-9 w-56 text-[13px]" placeholder="New room, for example Boardroom 5" value={name} onChange={(e) => setName(e.target.value)} />
          <button
            className="btn-secondary btn-sm"
            disabled={!name.trim()}
            onClick={() => {
              const id = `r_dr_${Date.now().toString(36)}`;
              dispatch({ type: "upsertRoom", room: { id, zoneId: DR_ZONE, name: name.trim(), capacity: 6 } });
              dispatch({ type: "dr/roomConfig", roomId: id, tables: 1, from: "09:00", to: "17:30" });
              setName("");
            }}
          >
            Add a room
          </button>
        </div>
      )}
      <p className="px-5 pb-3 text-[12px] text-slate">Deal Room rooms are rooms of the event inside the Deal Room zone, so the programme&apos;s room checks see them too. A room holding meetings cannot be removed.</p>
    </Section>
  );
}

function Export() {
  const { state } = useStore();
  const { dr, cfg, event } = useDr();
  const days = Array.from({ length: event.days }, (_, i) => addMinutes(`${event.startDate} 00:00`, i * 1440).slice(0, 10));
  const lines = (filter: (m: DrMeeting) => boolean) => {
    const out = [row(["Day", "Start", "End", "Room", "Table", "Seeker", "Counterparty", "Status"])];
    for (const m of dr.meetings.filter((x) => x.status !== "Cancelled" && filter(x)).sort((a, b) => a.start.localeCompare(b.start))) {
      const mm = dr.matches.find((x) => x.id === m.matchId)!;
      out.push(row([m.start.slice(0, 10), m.start.slice(11), m.end.slice(11), m.link ? "Online" : state.rooms.find((r) => r.id === m.roomId)?.name, m.table ?? "", dr.apps.find((a) => a.id === mm.seekerId)?.org.name, dr.apps.find((a) => a.id === mm.providerId)?.org.name, m.status]));
    }
    return out;
  };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Section title="By day">
        <ul className="space-y-2">
          {days.map((d) => (
            <li key={d} className="flex items-center justify-between gap-2 text-[14px]">
              {fmtStamp(d, false)}
              <span className="flex gap-2">
                <button className="link text-[13px]" onClick={() => downloadCsv(`deal-room-${d}`, lines((m) => m.start.slice(0, 10) === d))}>
                  CSV
                </button>
                <Link className="link text-[13px]" href={`/print/deal-room?kind=day&day=${d}`} target="_blank">
                  Print
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="By room">
        <ul className="space-y-2">
          {state.rooms
            .filter((r) => r.zoneId === DR_ZONE)
            .map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-[14px]">
                {r.name}
                <span className="flex gap-2">
                  <button className="link text-[13px]" onClick={() => downloadCsv(`deal-room-${r.name}`, lines((m) => m.roomId === r.id))}>
                    CSV
                  </button>
                  <Link className="link text-[13px]" href={`/print/deal-room?kind=room&room=${r.id}`} target="_blank">
                    Print
                  </Link>
                </span>
              </li>
            ))}
        </ul>
      </Section>
      <Section title="By participant">
        <p className="text-[14px] text-slate">One file with every participant&apos;s meetings, for the printed backup at the desk.</p>
        <button
          className="btn-secondary btn-sm mt-3"
          onClick={() => {
            const out = [row(["Participant", "Type", "Day", "Start", "Room", "Table", "With", "Status"])];
            for (const a of dr.apps.filter((x) => x.delegateId)) {
              for (const m of dr.meetings.filter((x) => x.status !== "Cancelled" && dr.matches.some((mm) => mm.id === x.matchId && (mm.seekerId === a.id || mm.providerId === a.id)))) {
                const mm = dr.matches.find((x) => x.id === m.matchId)!;
                const other = dr.apps.find((x) => x.id === (mm.seekerId === a.id ? mm.providerId : mm.seekerId));
                out.push(row([a.org.name, a.type, m.start.slice(0, 10), m.start.slice(11), m.link ? "Online" : state.rooms.find((r) => r.id === m.roomId)?.name, m.table ?? "", other?.org.name, m.status]));
              }
            }
            downloadCsv("deal-room-by-participant", out);
          }}
        >
          Download CSV
        </button>
        <Link className="btn-secondary btn-sm mt-3 ml-2" href="/print/deal-room?kind=participants" target="_blank">
          Print
        </Link>
        <p className="mt-3 text-[12px] text-slate">CSV opens in Excel; Print gives the paper copy for an outage ({cfg!.rules.meetingMin}-minute slots).</p>
      </Section>
    </div>
  );
}
