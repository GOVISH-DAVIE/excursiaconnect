"use client";

import type { ReactNode } from "react";
import { Rail, type NavItem } from "@/components/ui";
import { drCan } from "@/lib/dealroom/logic";
import { addMinutes, fmtStamp } from "@/lib/time";
import { useDr } from "./bits";

/** The Deal Room workspace: the rail shows only what the signed-in role may use (PRD Reporting req. 5). */
export function DealRoomShell({ children }: { children: ReactNode }) {
  const { dr, me, dispatch, cfg } = useDr();
  const nav: (NavItem & { show: boolean })[] = [
    { href: "/dealroom", label: "Dashboard", exact: true, show: true },
    { href: "/dealroom/applications", label: "Applications", show: drCan(me, "review") || drCan(me, "assign") },
    { href: "/dealroom/matching", label: "Matching", show: drCan(me, "match") },
    { href: "/dealroom/meetings", label: "Meetings", show: drCan(me, "schedule") },
    { href: "/dealroom/live", label: "Live board", show: drCan(me, "liveboard") || drCan(me, "outcome") },
    { href: "/dealroom/programme", label: "Programme", show: !!me },
    { href: "/dealroom/pipeline", label: "Pipeline", show: !!me },
    { href: "/dealroom/opportunities", label: "Opportunities", show: me?.role === "Lead" || me?.role === "Reviewer" || me?.role === "Coordinator" },
    { href: "/dealroom/reports", label: "Reports", show: true },
    { href: "/dealroom/notifications", label: "Notifications", show: true },
    { href: "/dealroom/settings", label: "Settings and rules", show: true },
  ];
  const today = dr.clock.slice(0, 10);
  const steps = [
    { label: "+25 min", to: addMinutes(dr.clock, 25) },
    { label: "19:00", to: `${today} 19:00` },
    { label: "18 May", to: "2027-05-18 10:00" },
    { label: "22 Aug", to: "2027-08-22 09:00" },
  ].filter((s) => s.to > dr.clock);

  const context = (
    <div className="space-y-3 text-[13px]">
      <label className="block">
        <span className="text-white/60">Signed in as</span>
        <select className="mt-1 w-full rounded-md bg-white/10 px-2 py-1.5 text-[13px] text-white" value={dr.actingStaffId} onChange={(e) => dispatch({ type: "dr/actAs", staffId: e.target.value })}>
          {dr.staff
            .filter((s) => s.active)
            .map((s) => (
              <option key={s.id} value={s.id} className="text-ink">
                {`${s.name}, ${s.role}${s.org ? `, ${s.org}` : ""}${s.role === "Reviewer" && s.canDecide ? " (decides)" : ""}`}
              </option>
            ))}
        </select>
      </label>
      <div>
        <div className="text-white/60">Demo clock</div>
        <div className="font-medium text-white">{fmtStamp(dr.clock)}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {steps.map((s) => (
            <button key={s.label} type="button" className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20" onClick={() => dispatch({ type: "dr/clock", clock: s.to })}>
              {s.label}
            </button>
          ))}
        </div>
        {dr.archivedAt && <div className="mt-2 text-coral">Archived {fmtStamp(dr.archivedAt, false)}: read-only</div>}
      </div>
    </div>
  );

  return (
    <Rail persona={`Deal Room · ${cfg ? "Connected Africa 3.0" : ""}`} who={me ? `${me.name}, ${me.role}` : "Signed out"} nav={nav.filter((n) => n.show)} context={context}>
      {children}
    </Rail>
  );
}
