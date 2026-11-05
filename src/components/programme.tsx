"use client";

import Link from "next/link";
import { useState } from "react";
import type { Room, Session } from "@/lib/types";

export function Programme({
  sessions,
  rooms,
  days,
  startDate,
  enrolled = [],
  canEnrol = false,
  onEnrol,
  myDayOnly = false,
  linkBase,
}: {
  sessions: Session[];
  rooms: Room[];
  days: number;
  startDate: string;
  enrolled?: string[];
  canEnrol?: boolean;
  onEnrol?: (id: string, on: boolean) => void;
  myDayOnly?: boolean;
  linkBase?: string;
}) {
  const [day, setDay] = useState(1);
  const dayLabel = (d: number) => {
    const dt = new Date(startDate);
    dt.setDate(dt.getDate() + d - 1);
    return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  };
  const list = sessions.filter((s) => s.day === day && (!myDayOnly || s.kind !== "breakout" || enrolled.includes(s.id)));
  const slots = [...new Set(list.map((s) => s.start))].sort();

  return (
    <div>
      <div className="flex gap-1.5 mb-5 overflow-x-auto">
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
          <button key={d} onClick={() => setDay(d)} className={`rounded-md px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${day === d ? "bg-ink text-white" : "bg-paper-200 text-slate hover:bg-line"}`}>
            Day {d}, {dayLabel(d)}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {slots.map((slot) => {
          const items = list.filter((s) => s.start === slot);
          return (
            <div key={slot} className="grid grid-cols-[56px_1fr] gap-3">
              <div className="pt-2.5 text-[13px] font-medium num text-slate">{slot}</div>
              <div className="grid gap-2 md:grid-cols-3">
                {items.map((s) => {
                  const room = rooms.find((r) => r.id === s.roomId);
                  const isIn = enrolled.includes(s.id);
                  const full = s.capacity !== undefined && s.enrolled >= s.capacity && !isIn;
                  const span = s.kind === "breakout" ? "" : "md:col-span-3";
                  const edge = s.kind === "plenary" ? "border-l-coral" : s.kind === "breakout" ? "border-l-ink" : "border-l-line-strong";
                  const title = linkBase ? (
                    <Link href={`${linkBase}/${s.id}`} className="font-medium leading-snug hover:underline">
                      {s.title}
                    </Link>
                  ) : (
                    <span className="font-medium leading-snug">{s.title}</span>
                  );
                  return (
                    <div key={s.id} className={`surface border-l-[3px] ${edge} p-3 flex flex-col ${span} ${s.kind === "break" ? "bg-paper" : ""}`}>
                      <div className="text-[13px] text-slate">
                        {s.start}–{s.end}
                        {room && `, ${room.name}`}
                        {s.track && `, ${s.track}`}
                      </div>
                      <div className="mt-0.5">{title}</div>
                      {s.speakers.length > 0 && <div className="text-[13px] text-slate mt-0.5">{s.speakers.join(", ")}</div>}
                      {s.kind === "breakout" && (
                        <div className="mt-auto pt-3 flex items-center justify-between">
                          <span className={`text-[13px] num ${full ? "text-bad font-medium" : "text-slate"}`}>
                            {s.enrolled} of {s.capacity} seats
                          </span>
                          {canEnrol && (
                            <button onClick={() => onEnrol?.(s.id, !isIn)} disabled={full} className={`text-[13px] font-medium rounded px-2 py-1 ${isIn ? "bg-ok text-white" : full ? "bg-paper-200 text-mute" : "bg-coral text-white"}`}>
                              {isIn ? "Enrolled" : full ? "Full" : "Enrol"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {slots.length === 0 && <div className="text-sm text-slate">Nothing on this day.</div>}
      </div>
    </div>
  );
}
