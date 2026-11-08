"use client";

import type { ReactNode } from "react";
import { Rail, type NavItem } from "@/components/ui";
import { addMinutes, fmtStamp } from "@/lib/time";
import { useExpo } from "./bits";

/** The exhibition workspace: the organiser's own team, each seeing what their role allows (src/lib/roles.ts). */
export function ExhibitionShell({ children }: { children: ReactNode }) {
  const { state, expo, me, can, dispatch, event } = useExpo();
  const sees = (...caps: Parameters<typeof can>[0][]) => caps.some((c) => can(c));
  const nav: (NavItem & { show: boolean })[] = [
    { href: "/exhibition", label: "Overview", exact: true, show: true },
    { href: "/exhibition/plan", label: "Floor plan", show: sees("expo.manage", "expo.floor", "money.view") },
    { href: "/exhibition/exhibitors", label: "Exhibitors", show: sees("expo.manage", "expo.floor", "money.view") },
    { href: "/exhibition/sales", label: "Sales and payments", show: sees("expo.manage", "money.view") },
    { href: "/exhibition/services", label: "Stand services", show: sees("expo.manage", "expo.floor") },
    { href: "/exhibition/logistics", label: "Logistics", show: sees("expo.manage", "expo.floor") },
    { href: "/exhibition/operations", label: "Operations", show: sees("expo.manage", "expo.floor") },
    { href: "/exhibition/reports", label: "Reports", show: sees("expo.manage", "money.view") },
    { href: "/exhibition/messages", label: "Messages", show: true },
    { href: "/exhibition/settings", label: "Settings", show: true },
  ];
  const team = state.team.filter((m) => m.organiserId === event?.organiserId && m.status === "Active" && m.role !== "Speaker");
  const today = expo.clock.slice(0, 10);
  const steps = [
    { label: "+15 min", to: addMinutes(expo.clock, 15) },
    { label: "+1 hour", to: addMinutes(expo.clock, 60) },
    { label: "Day 2", to: "2026-11-26 08:30" },
    { label: "Day 3", to: "2026-11-27 08:30" },
    { label: "Dismantle", to: "2026-11-27 18:00" },
    { label: "After", to: "2026-12-04 09:00" },
  ].filter((s) => s.to > expo.clock);

  const context = (
    <div className="space-y-3 text-[13px]">
      <label className="block">
        <span className="text-white/60">Signed in as</span>
        <select className="mt-1 w-full rounded-md bg-white/10 px-2 py-1.5 text-[13px] text-white" value={expo.actingMemberId} onChange={(e) => dispatch({ type: "expo/actAs", memberId: e.target.value })}>
          {team.map((m) => (
            <option key={m.id} value={m.id} className="text-ink">
              {m.name}, {m.role}
            </option>
          ))}
        </select>
      </label>
      <div>
        <div className="text-white/60">Exhibition clock</div>
        <div className="font-medium text-white">
          {fmtStamp(expo.clock)}
          {today >= "2026-11-25" && today <= "2026-11-27" ? `, show day ${Number(today.slice(8)) - 24}` : ""}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {steps.map((s) => (
            <button key={s.label} type="button" className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20" onClick={() => dispatch({ type: "expo/clock", clock: s.to })}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <Rail persona={`Exhibition · ${event?.name ?? ""}`} who={me ? `${me.name}, ${me.role}` : "Signed out"} nav={nav.filter((n) => n.show)} context={context}>
      {children}
    </Rail>
  );
}
