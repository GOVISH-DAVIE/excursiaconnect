"use client";

import Link from "next/link";
import { useState } from "react";
import type { Room, Session } from "@/lib/types";

/** The programme as a ruled schedule: a time rail, one row per slot, breakouts side by side as open
 *  columns. No boxes, no coloured edges; a breakout's seats and the enrol action sit in its own lines. */
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
    <div className="prog">
      <div className="prog__days" role="tablist">
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
          <button key={d} role="tab" aria-selected={day === d} onClick={() => setDay(d)} className="prog__day">
            Day {d}, {dayLabel(d)}
          </button>
        ))}
      </div>
      {slots.map((slot) => {
        const items = list.filter((s) => s.start === slot);
        const breakouts = items.every((s) => s.kind === "breakout");
        return (
          <div key={slot} className="prog__slot">
            <div className="prog__time">{slot}</div>
            <div className={`prog__items ${breakouts ? "prog__items--cols" : ""}`}>
              {items.map((s) => {
                const room = rooms.find((r) => r.id === s.roomId);
                const isIn = enrolled.includes(s.id);
                const full = s.capacity !== undefined && s.enrolled >= s.capacity && !isIn;
                // one seat per slot: another enrolled session at the same time blocks this one
                const clash = !isIn ? sessions.find((o) => o.id !== s.id && enrolled.includes(o.id) && o.day === s.day && o.start < s.end && s.start < o.end) : undefined;
                const where = [room?.name ?? (s.kind === "plenary" ? "Main hall" : null), s.track].filter(Boolean).join(", ");
                const title = linkBase ? (
                  <Link href={`${linkBase}/${s.id}`} className="prog__title">
                    {s.title}
                  </Link>
                ) : (
                  <span className="prog__title">{s.title}</span>
                );
                return (
                  <div key={s.id} className={`prog__item prog__item--${s.kind}`}>
                    <div className="prog__meta">
                      {s.start} to {s.end}
                      {where && `, ${where}`}
                    </div>
                    {title}
                    {s.speakers.length > 0 && <div className="prog__speakers">{s.speakers.join(", ")}</div>}
                    {s.kind === "breakout" && (
                      <div className="prog__seats">
                        <span className={full ? "text-bad" : ""}>
                          {s.enrolled} of {s.capacity} seats{full ? ", full" : ""}
                        </span>
                        {canEnrol && (isIn ? (
                          <button onClick={() => onEnrol?.(s.id, false)} className="prog__enrol is-in">
                            Enrolled, leave
                          </button>
                        ) : clash ? (
                          <span className="prog__note">Clashes with {clash.title}</span>
                        ) : full ? (
                          <span className="prog__note">Full</span>
                        ) : (
                          <button onClick={() => onEnrol?.(s.id, true)} className="prog__enrol">
                            Enrol
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {slots.length === 0 && <div className="prog__empty">Nothing on this day.</div>}
    </div>
  );
}
