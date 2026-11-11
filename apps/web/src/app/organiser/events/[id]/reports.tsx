"use client";

import Link from "next/link";
import { Empty, Meter, Section, Stat } from "@/components/ui";
import { money, useStore } from "@/lib/store";
import type { AppState, Delegate, EventRecord, Order, Room, Session, Tier, Zone } from "@excursia/domain/types";

/*
  Reports: what happened in the rooms, the sessions, the zones and at the desk, from the scans the
  staff app writes. Room performance is the headline: how many people the door let into each room,
  against the seats and the roster. Everything here is also in the downloadable report.
*/

const inSession = (d: Delegate, sessionId: string) => (d.roomLog ?? []).some((l) => l.sessionId === sessionId && l.verdict !== "deny");

export function sessionFigures(state: AppState, s: Session) {
  const roster = state.delegates.filter((d) => d.sessions.includes(s.id));
  const checkedIn = state.delegates.filter((d) => inSession(d, s.id));
  const walkIns = checkedIn.filter((d) => !d.sessions.includes(s.id));
  const denied = state.delegates.reduce((a, d) => a + (d.roomLog ?? []).filter((l) => l.sessionId === s.id && l.verdict === "deny").length, 0);
  return { roster: roster.length, checkedIn: checkedIn.length, walkIns: walkIns.length, denied, attendance: roster.length ? Math.round((checkedIn.length / roster.length) * 100) : 0 };
}

export function roomFigures(state: AppState, room: Room, sessions: Session[]) {
  const here = sessions.filter((s) => s.roomId === room.id);
  const figs = here.map((s) => ({ s, ...sessionFigures(state, s) }));
  // a session counts as held once it has started, or once the door has let someone in early
  const held = figs.filter((f) => f.s.status !== "scheduled" || f.checkedIn > 0);
  const checkedIn = held.reduce((a, f) => a + f.checkedIn, 0);
  const roster = held.reduce((a, f) => a + f.roster, 0);
  const walkIns = held.reduce((a, f) => a + f.walkIns, 0);
  const busiest = figs.reduce<(typeof figs)[number] | undefined>((m, f) => (f.checkedIn > (m?.checkedIn ?? -1) ? f : m), undefined);
  const peakFill = busiest ? Math.round((busiest.checkedIn / room.capacity) * 100) : 0;
  return { sessions: here.length, held: held.length, checkedIn, roster, walkIns, attendance: roster ? Math.round((checkedIn / roster) * 100) : 0, busiest, peakFill };
}

export function ReportsTab({ event, base }: { event: EventRecord; base: string }) {
  const { state } = useStore();
  const zones = state.zones.filter((z) => z.eventId === event.id);
  const rooms = state.rooms.filter((r) => zones.some((z) => z.id === r.zoneId));
  const sessions = state.sessions.filter((s) => s.eventId === event.id);
  const delegates = state.delegates.filter((d) => d.eventId === event.id);
  const tiers = state.tiers.filter((t) => t.eventId === event.id);
  const orders = state.orders.filter((o) => o.eventId === event.id);
  const breakouts = sessions.filter((s) => s.kind === "breakout");
  const days = Array.from({ length: event.days }, (_, i) => i + 1);

  const roomRows = rooms.map((r) => ({ r, ...roomFigures(state, r, sessions) }));
  const totalIn = roomRows.reduce((a, x) => a + x.checkedIn, 0);
  const totalRoster = roomRows.reduce((a, x) => a + x.roster, 0);
  const held = breakouts.filter((s) => s.status !== "scheduled").length;
  const zoneRows = zones.map((z) => {
    const logs = delegates.flatMap((d) => d.zoneLog.filter((l) => l.zoneId === z.id));
    const entries = logs.filter((l) => l.direction === "in" && l.verdict !== "deny").length;
    const denied = logs.filter((l) => l.verdict === "deny").length;
    const unique = new Set(delegates.filter((d) => d.zoneLog.some((l) => l.zoneId === z.id && l.direction === "in" && l.verdict !== "deny")).map((d) => d.id)).size;
    return { z, entries, denied, unique };
  });
  const dayRows = days.map((day) => ({ day, checkedIn: delegates.filter((d) => d.checkIns.some((c) => c.day === day)).length }));
  const confirmed = delegates.filter((d) => d.status === "Confirmed" || d.status === "Checked in").length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Checked into rooms" value={totalIn} sub={totalRoster ? `${Math.round((totalIn / totalRoster) * 100)}% of ${totalRoster} enrolled in sessions held` : "no session held yet"} tone="ok" />
        <Stat label="Sessions held" value={held} sub={`of ${breakouts.length} breakouts`} />
        <Stat label="Accredited at the desk" value={delegates.filter((d) => d.accredited).length} sub={confirmed ? `${Math.round((delegates.filter((d) => d.accredited).length / confirmed) * 100)}% of ${confirmed} confirmed` : undefined} />
        <Stat label="Zone entries" value={zoneRows.reduce((a, z) => a + z.entries, 0)} sub={`${zoneRows.reduce((a, z) => a + z.denied, 0)} denied`} />
      </div>

      <Section title="Room performance" flush action={<span className="text-[13px] text-slate">Checked in = badges the room door let in, enrolled or walk-in</span>}>
        {rooms.length === 0 ? (
          <div className="p-5"><Empty>No rooms yet. Add them under Zones and rooms.</Empty></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Room</th>
                <th className="th-r">Seats</th>
                <th className="th-r">Sessions</th>
                <th className="th-r">Enrolled</th>
                <th className="th-r">Checked in</th>
                <th className="th-r">Walk-ins</th>
                <th className="th">Attendance</th>
                <th className="th">Busiest session</th>
              </tr>
            </thead>
            <tbody>
              {roomRows.map(({ r, ...f }) => (
                <tr key={r.id} className="hover:bg-paper">
                  <td className="td font-medium whitespace-nowrap">{r.name}</td>
                  <td className="td-r text-slate">{r.capacity}</td>
                  <td className="td-r">{f.held} <span className="text-slate">of {f.sessions}</span></td>
                  <td className="td-r">{f.roster || "–"}</td>
                  <td className="td-r font-medium">{f.checkedIn || "–"}</td>
                  <td className="td-r text-slate">{f.walkIns || "–"}</td>
                  <td className="td w-40">
                    {f.held ? (
                      <div className="flex items-center gap-2">
                        <span className="flex-1"><Meter value={f.checkedIn} max={Math.max(1, f.roster)} warnAt={2} badAt={2} /></span>
                        <span className="num text-slate w-10 text-right">{f.attendance}%</span>
                      </div>
                    ) : (
                      <span className="text-slate">Not yet</span>
                    )}
                  </td>
                  <td className="td">
                    {f.busiest && f.busiest.checkedIn ? (
                      <Link href={`${base}/sessions/${f.busiest.s.id}`} className="hover:underline">
                        {f.busiest.s.title} <span className="text-slate">· {f.busiest.checkedIn} in, {f.peakFill}% of seats</span>
                      </Link>
                    ) : (
                      <span className="text-slate">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Session attendance" flush>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Session</th>
              <th className="th">When</th>
              <th className="th">Room</th>
              <th className="th-r">Enrolled</th>
              <th className="th-r">Checked in</th>
              <th className="th-r">Walk-ins</th>
              <th className="th-r">Denied</th>
              <th className="th">Attendance</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody>
            {breakouts.map((s) => {
              const f = sessionFigures(state, s);
              const room = rooms.find((r) => r.id === s.roomId);
              return (
                <tr key={s.id} className="hover:bg-paper">
                  <td className="td">
                    <Link href={`${base}/sessions/${s.id}`} className="font-medium hover:underline">{s.title}</Link>
                  </td>
                  <td className="td text-slate whitespace-nowrap">Day {s.day}, {s.start}</td>
                  <td className="td text-slate whitespace-nowrap">{room?.name ?? "–"}</td>
                  <td className="td-r">{f.roster} <span className="text-slate">/ {s.capacity ?? "–"}</span></td>
                  <td className="td-r font-medium">{s.status === "scheduled" && !f.checkedIn ? "–" : f.checkedIn}</td>
                  <td className="td-r text-slate">{f.walkIns || "–"}</td>
                  <td className="td-r text-slate">{f.denied || "–"}</td>
                  <td className="td w-36">
                    {s.status === "scheduled" && !f.checkedIn ? <span className="text-slate">Not yet</span> : (
                      <div className="flex items-center gap-2">
                        <span className="flex-1"><Meter value={f.checkedIn} max={Math.max(1, f.roster)} warnAt={2} badAt={2} /></span>
                        <span className="num text-slate w-10 text-right">{f.attendance}%</span>
                      </div>
                    )}
                  </td>
                  <td className="td">
                    <span className={`pill ${s.status === "live" ? "bg-ok text-white" : s.status === "ended" ? "bg-paper-200 text-slate" : "bg-paper-200 text-slate"}`}>{s.status === "live" ? "Live" : s.status === "ended" ? "Ended" : "Scheduled"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Zone traffic" flush>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Zone</th>
                <th className="th-r">Entries</th>
                <th className="th-r">People</th>
                <th className="th-r">Denied</th>
              </tr>
            </thead>
            <tbody>
              {zoneRows.map(({ z, entries, unique, denied }) => (
                <tr key={z.id} className="hover:bg-paper">
                  <td className="td">
                    <Link href={`${base}/zones/${z.id}`} className="font-medium hover:underline">{z.name}</Link>
                  </td>
                  <td className="td-r">{entries || "–"}</td>
                  <td className="td-r text-slate">{unique || "–"}</td>
                  <td className="td-r text-slate">{denied || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Check-ins at the desk" flush>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Day</th>
                <th className="th-r">Checked in</th>
                <th className="th">Of confirmed</th>
              </tr>
            </thead>
            <tbody>
              {dayRows.map(({ day, checkedIn }) => (
                <tr key={day} className="hover:bg-paper">
                  <td className="td font-medium">Day {day}</td>
                  <td className="td-r">{checkedIn || "–"}</td>
                  <td className="td w-32">
                    <div className="flex items-center gap-2">
                      <span className="flex-1"><Meter value={checkedIn} max={Math.max(1, confirmed)} warnAt={2} badAt={2} /></span>
                      <span className="num text-slate w-10 text-right">{confirmed ? Math.round((checkedIn / confirmed) * 100) : 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Tickets" flush>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Tier</th>
                <th className="th-r">Sold</th>
                <th className="th-r">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.id} className="hover:bg-paper">
                  <td className="td">
                    <Link href={`${base}/tiers/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                  </td>
                  <td className="td-r">{t.sold} <span className="text-slate">/ {t.cap}</span></td>
                  <td className="td-r">{money(orders.filter((o) => o.tierId === t.id && o.status === "paid").reduce((a, o) => a + o.gross, 0), t.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
      <p className="text-[13px] text-slate">Download report (top right) writes all of this with every delegate and order as one CSV workbook; the same figures are on the closing report.</p>
    </div>
  );
}

/** OR-17 / FI-8: the event's workbook as CSV: delegates, orders, rooms, sessions, zones. */
export function exportWorkbook(state: AppState, event: EventRecord, delegates: Delegate[], orders: Order[], tiers: Tier[], sessions: Session[], rooms: Room[], zones: Zone[]) {
  const tierName = (id: string) => tiers.find((t) => t.id === id)?.name ?? "";
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["Delegates", "Name,Email,Phone,Organisation,Category,Tier,Status,Accredited,Days checked in,Sessions attended"];
  for (const d of delegates) lines.push([d.name, d.email, d.phone, d.organisation, d.category, tierName(d.tierId), d.status, d.accredited ? "Yes" : "No", d.checkIns.length, (d.roomLog ?? []).filter((l) => l.verdict !== "deny").length].map(q).join(","));
  lines.push("", "Orders", "Date,Delegate,Tier,Method,Reference,Gross,Discount,Gateway fee,Commission,Net,Status");
  for (const o of orders) lines.push([o.at, delegates.find((d) => d.id === o.delegateId)?.name ?? o.delegateId, tierName(o.tierId), o.method, o.reference, o.gross, o.discount, o.gatewayFee, o.commission, o.net, o.status].map(q).join(","));
  lines.push("", "Rooms", "Room,Seats,Sessions,Sessions held,Enrolled,Checked in,Walk-ins,Attendance %,Busiest session,Peak fill %");
  for (const r of rooms) {
    const f = roomFigures(state, r, sessions);
    lines.push([r.name, r.capacity, f.sessions, f.held, f.roster, f.checkedIn, f.walkIns, f.attendance, f.busiest?.s.title ?? "", f.peakFill].map(q).join(","));
  }
  lines.push("", "Sessions", "Session,Day,Start,End,Room,Seats offered,Enrolled,Checked in,Walk-ins,Denied,Attendance %,Status,Rating");
  for (const s of sessions.filter((x) => x.kind === "breakout")) {
    const f = sessionFigures(state, s);
    lines.push([s.title, s.day, s.start, s.end, rooms.find((r) => r.id === s.roomId)?.name ?? "", s.capacity ?? "", f.roster, f.checkedIn, f.walkIns, f.denied, f.attendance, s.status, s.rating ?? ""].map(q).join(","));
  }
  lines.push("", "Zones", "Zone,Capacity,Entries,People,Denied");
  for (const z of zones) {
    const logs = delegates.flatMap((d) => d.zoneLog.filter((l) => l.zoneId === z.id));
    lines.push([z.name, z.capacity, logs.filter((l) => l.direction === "in" && l.verdict !== "deny").length, new Set(delegates.filter((d) => d.zoneLog.some((l) => l.zoneId === z.id && l.direction === "in" && l.verdict !== "deny")).map((d) => d.id)).size, logs.filter((l) => l.verdict === "deny").length].map(q).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${event.name.replace(/\W+/g, "-").toLowerCase()}-report.csv`;
  a.click();
}
