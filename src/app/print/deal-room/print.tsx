"use client";

import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { missionName } from "@/lib/dealroom/logic";
import type { DrMeeting } from "@/lib/dealroom/types";
import { fmtStamp } from "@/lib/time";

/** The paper backup: schedules per day, room or participant, and the match briefs. Printed with the browser's own print. */
export function PrintView() {
  const { state } = useStore();
  const q = useSearchParams();
  const dr = state.dealRoom;
  const cfg = Object.values(dr.configs)[0];
  const kind = q.get("kind") ?? "day";
  const room = (id?: string) => state.rooms.find((r) => r.id === id)?.name ?? "Online";
  const names = (m: DrMeeting) => {
    const mm = dr.matches.find((x) => x.id === m.matchId)!;
    return [dr.apps.find((a) => a.id === mm.seekerId)!, dr.apps.find((a) => a.id === mm.providerId)!];
  };
  const live = dr.meetings.filter((m) => m.status !== "Cancelled").sort((a, b) => a.start.localeCompare(b.start));
  let title = "";
  let body: React.ReactNode = null;

  if (kind === "matches") {
    const mission = q.get("mission") ?? cfg.missions[0].id;
    title = `Match briefs, ${missionName(cfg, mission)}`;
    const list = dr.matches.filter((m) => m.brief && m.decision === "Approved" && dr.apps.find((a) => a.id === m.seekerId)?.mission === mission);
    body = list.map((m) => (
      <article key={m.id} className="break-inside-avoid border-b border-line py-4">
        <h2 className="font-medium">
          {dr.apps.find((a) => a.id === m.seekerId)?.org.name} · {dr.apps.find((a) => a.id === m.providerId)?.org.name}
        </h2>
        <p className="mt-1 whitespace-pre-line text-[13px]">{m.brief!.text}</p>
        <ol className="mt-1 list-decimal pl-5 text-[13px]">
          {m.brief!.agenda.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      </article>
    ));
  } else if (kind === "participants") {
    title = "Schedules by participant";
    body = dr.apps
      .filter((a) => live.some((m) => names(m).some((x) => x.id === a.id)))
      .sort((a, b) => a.org.name.localeCompare(b.org.name))
      .map((a) => (
        <section key={a.id} className="break-inside-avoid py-3 border-b border-line">
          <h2 className="font-medium">{a.org.name}</h2>
          <table className="w-full text-[13px]">
            <tbody>
              {live
                .filter((m) => names(m).some((x) => x.id === a.id))
                .map((m) => (
                  <tr key={m.id}>
                    <td className="py-0.5 w-40">{fmtStamp(m.start)}</td>
                    <td>{room(m.roomId)}{m.table ? `, table ${m.table}` : ""}</td>
                    <td>with {names(m).find((x) => x.id !== a.id)?.org.name}</td>
                    <td className="w-20">{m.status}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ));
  } else {
    const filter = kind === "room" ? (m: DrMeeting) => m.roomId === q.get("room") : (m: DrMeeting) => m.start.slice(0, 10) === (q.get("day") ?? dr.clock.slice(0, 10));
    title = kind === "room" ? `Schedule, ${room(q.get("room") ?? "")}` : `Schedule, ${fmtStamp(q.get("day") ?? dr.clock.slice(0, 10), false)}`;
    body = (
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left border-b border-line">
            <th className="py-1">When</th>
            <th>Room, table</th>
            <th>Seeker</th>
            <th>Provider</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {live.filter(filter).map((m) => {
            const [s, p] = names(m);
            return (
              <tr key={m.id} className="border-b border-line align-top">
                <td className="py-1.5 w-36">{fmtStamp(m.start)}</td>
                <td>{room(m.roomId)}{m.table ? `, ${m.table}` : ""}</td>
                <td>
                  {s.org.name}
                  <div className="text-slate">{s.decisionMaker.name}</div>
                </td>
                <td>
                  {p.org.name}
                  <div className="text-slate">{p.decisionMaker.name}</div>
                </td>
                <td className="w-48">{m.status === "Held" || m.status === "No-show" ? m.status : "Held / No-show / Moved: ____"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-8 print:p-0 bg-white min-h-screen">
      <header className="flex items-baseline justify-between gap-4 border-b border-ink pb-2 mb-3">
        <h1 className="text-[20px] font-medium">{title}</h1>
        <span className="text-[12px] text-slate">Connected Africa 3.0 Deal Room · printed {fmtStamp(dr.clock)}</span>
      </header>
      <button className="btn-secondary btn-sm mb-4 print:hidden" onClick={() => window.print()}>
        Print
      </button>
      {body}
    </main>
  );
}
