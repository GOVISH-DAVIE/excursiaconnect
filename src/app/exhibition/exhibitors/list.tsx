"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Empty, PageHeader, Section } from "@/components/ui";
import { activeBookingOf, bookingStage, kes, owedBy, staffOf } from "@/lib/expo/logic";
import type { ExhibitorStatus } from "@/lib/expo/types";
import { fmtStamp } from "@/lib/time";
import { Refusal } from "@/app/dealroom/bits";
import { ExStatusPill, StagePill, useExpo, ScannerWork } from "../bits";

const STATUSES: ExhibitorStatus[] = ["Applied", "Under review", "Approved", "Waitlisted", "Declined"];

/** EXH-3: every company, filtered from the URL so the overview and reports can link straight to a slice of it. */
export default function ExhibitorList() {
  const { state, expo, cfg, now, can } = useExpo();
  const q = useSearchParams();
  const router = useRouter();
  const [needle, setNeedle] = useState("");
  if (!cfg) return null;
  if (!can("expo.manage") && !can("expo.floor") && !can("money.view")) return <Refusal title="Exhibitors are for the exhibition team"><ScannerWork /></Refusal>;
  const statuses = (q.get("status") ?? "").split(",").filter((s): s is ExhibitorStatus => STATUSES.includes(s as ExhibitorStatus));
  const sector = q.get("sector") ?? "";
  const hall = q.get("hall") ?? "";
  const booth = q.get("booth") ?? ""; // "none", or a booking stage
  const owes = q.get("owes") === "1";
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(q.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    router.replace(`/exhibition/exhibitors${p.toString() ? `?${p}` : ""}`);
  };
  const all = expo.exhibitors.filter((e) => e.eventId === cfg.eventId);
  const sectors = [...new Set(all.map((e) => e.sector))].sort();
  const list = all
    .filter((e) => !statuses.length || statuses.includes(e.status))
    .filter((e) => !sector || e.sector === sector)
    .filter((e) => {
      const k = activeBookingOf(expo, e.id, cfg, now);
      if (booth === "none" && k) return false;
      if (booth && booth !== "none" && (!k || bookingStage(expo, k, cfg, now) !== booth)) return false;
      if (hall && !(k ? k.boothIds.some((id) => expo.booths.find((b) => b.id === id)?.hallId === hall) : e.application.hallId === hall)) return false;
      return true;
    })
    .filter((e) => !owes || owedBy(expo, e.id) > 0)
    .filter((e) => !needle.trim() || `${e.name} ${e.ref} ${e.contact.name} ${e.sector}`.toLowerCase().includes(needle.trim().toLowerCase()))
    .sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.name.localeCompare(b.name));
  const money = can("money.view");

  return (
    <>
      <PageHeader title="Exhibitors" kicker="Every company that applied, its decision, its booth and what it owes. Click a company for its record." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => {
          const on = statuses.includes(s);
          return (
            <button key={s} aria-pressed={on} className={`pill ${on ? "bg-ink text-white" : "bg-paper-200 text-slate hover:text-ink"}`} onClick={() => set("status", (on ? statuses.filter((x) => x !== s) : [...statuses, s]).join(","))}>
              {s} {all.filter((e) => e.status === s).length}
            </button>
          );
        })}
      </div>
      <Section title={`${list.length} ${list.length === 1 ? "company" : "companies"}`} flush>
        <div className="px-5 pb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input className="input lg:col-span-2" placeholder="Search company, reference, contact" value={needle} onChange={(e) => setNeedle(e.target.value)} />
          <select className="input" aria-label="Sector" value={sector} onChange={(e) => set("sector", e.target.value)}>
            <option value="">All sectors</option>
            {sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="input" aria-label="Hall" value={hall} onChange={(e) => set("hall", e.target.value)}>
            <option value="">Both halls</option>
            {expo.halls.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
          <select className="input" aria-label="Booth" value={booth} onChange={(e) => set("booth", e.target.value)}>
            <option value="">Any booth</option>
            <option value="none">No booth yet</option>
            <option value="Held">Held</option>
            <option value="Reserved">Reserved</option>
            <option value="Booked">Booked</option>
          </select>
        </div>
        {(owes || booth || hall || sector || statuses.length > 0) && (
          <div className="px-5 pb-3 text-[13px]">
            {owes && <span className="mr-2 pill bg-paper-200 text-ink">Owes money</span>}
            <button className="link" onClick={() => router.replace("/exhibition/exhibitors")}>
              Show every company
            </button>
          </div>
        )}
        {list.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>No company matches.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Company</th>
                  <th className="th">Status</th>
                  <th className="th">Booth</th>
                  <th className="th-r">Staff</th>
                  {money && <th className="th-r">Owes</th>}
                </tr>
              </thead>
              <tbody>
                {list.map((e) => {
                  const k = activeBookingOf(expo, e.id, cfg, now);
                  const owed = owedBy(expo, e.id);
                  return (
                    <tr key={e.id} className="hover:bg-paper">
                      <td className="td">
                        <Link className="font-medium hover:underline" href={`/exhibition/exhibitors/${e.id}`}>
                          {e.name}
                        </Link>
                        <div className="text-[12px] text-slate">
                          {e.ref} · {e.sector} · {e.status === "Applied" ? `applied ${fmtStamp(e.application.at, false)}` : `since ${fmtStamp(e.statusAt, false)}`}
                        </div>
                      </td>
                      <td className="td">
                        <ExStatusPill status={e.status} />
                      </td>
                      <td className="td">
                        {k ? (
                          <span className="inline-flex items-center gap-2">
                            <Link className="hover:underline" href={`/exhibition/plan?booth=${expo.booths.find((b) => b.id === k.boothIds[0])?.code}&hall=${expo.booths.find((b) => b.id === k.boothIds[0])?.hallId}`}>
                              {k.boothIds.map((id) => expo.booths.find((b) => b.id === id)?.code).join(", ")}
                            </Link>
                            <StagePill k={k} />
                          </span>
                        ) : e.status === "Approved" ? (
                          <span className="text-[13px] text-warn">No booth yet</span>
                        ) : (
                          <span className="text-[13px] text-slate">{e.application.boothPref ? `Asked for ${e.application.boothPref}` : "–"}</span>
                        )}
                      </td>
                      <td className="td-r">{staffOf(state, e.id).length + state.delegates.filter((d) => d.exhibitorId === e.id && d.tierId !== "t_exhibitor" && !d.cancelled).length}</td>
                      {money && <td className={`td-r whitespace-nowrap ${owed ? "text-bad" : "text-slate"}`}>{owed ? kes(owed) : "–"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
