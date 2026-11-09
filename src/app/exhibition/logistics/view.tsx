"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Empty, PageHeader, Section, Tabs } from "@/components/ui";
import {
  contractorsOf,
  deliveryProblems,
  deliverySlots,
  deliveryStatus,
  dismantleOpen,
  dismantleState,
  inSlot,
  moveInProblems,
  peopleProblems,
  rentalsOut,
  signOffProblems,
  slotTimes,
  windowProblems,
  type NewPerson,
} from "@/lib/expo/onsite";
import { addMinutes, fmtStamp } from "@/lib/time";
import { Refusal } from "@/app/dealroom/bits";
import { Field, ScannerWork, StatePill, useExpo, useStands } from "../bits";

const allTabs = ["Schedule", "Deliveries", "Contractors", "Dismantling"] as const;
type Tab = (typeof allTabs)[number];
const toInput = (s: string) => s.replace(" ", "T");
const fromInput = (s: string) => s.replace("T", " ").slice(0, 16);

export default function LogisticsView() {
  const q = useSearchParams();
  return <Logistics key={q.toString()} />;
}

/** LOG-1 to LOG-3 and LOG-5: the build-up and dismantling around the show, the loading bays and who may build. */
function Logistics() {
  const { expo, cfg, now, can } = useExpo();
  const q = useSearchParams();
  const asked = allTabs.find((t) => t === q.get("tab"));
  const [tab, setTab] = useState<Tab>(asked ?? (now >= (cfg?.dismantle.from ?? "") ? "Dismantling" : "Schedule"));
  if (!cfg) return null;
  if (!can("expo.manage") && !can("expo.floor")) return <Refusal title="Logistics are for the exhibition team"><ScannerWork /></Refusal>;
  const missed = expo.deliveries.filter((d) => d.eventId === cfg.eventId && deliveryStatus(cfg, d, now) === "Missed").length;
  return (
    <>
      <PageHeader title="Logistics" kicker={`Build-up ${fmtStamp(cfg.buildUp.from)} to ${fmtStamp(cfg.buildUp.to)}; dismantling ${fmtStamp(cfg.dismantle.from)} to ${fmtStamp(cfg.dismantle.to)}.`} />
      <Tabs tabs={allTabs} value={tab} onChange={setTab} counts={{ Deliveries: missed }} />
      {tab === "Schedule" && <Schedule />}
      {tab === "Deliveries" && <Deliveries />}
      {tab === "Contractors" && <Contractors />}
      {tab === "Dismantling" && <Dismantling />}
    </>
  );
}

function Schedule() {
  const { expo, cfg, now, can, dispatch } = useExpo();
  const stands = useStands();
  const [w, setW] = useState({ buildUp: cfg!.buildUp, dismantle: cfg!.dismantle });
  const [why, setWhy] = useState("");
  const problems = windowProblems(cfg!, w.buildUp, w.dismantle);
  const changed = JSON.stringify(w) !== JSON.stringify({ buildUp: cfg!.buildUp, dismantle: cfg!.dismantle });
  const slots = slotTimes(cfg!, cfg!.buildUp).filter((s) => s > now);
  const moveIn = (id: string) => expo.moveIns.find((m) => m.exhibitorId === id)?.at;
  const rows = [...stands].sort((a, b) => (moveIn(a.e.id) ?? "9").localeCompare(moveIn(b.e.id) ?? "9"));
  return (
    <div className="grid gap-4">
      <Section title="Windows">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["buildUp", "from", "Build-up starts"],
              ["buildUp", "to", "Build-up ends"],
              ["dismantle", "from", "Dismantling starts"],
              ["dismantle", "to", "Dismantling ends"],
            ] as const
          ).map(([k, end, label]) => (
            <Field key={label} label={label}>
              <input className="input" type="datetime-local" disabled={!can("expo.manage")} value={toInput(w[k][end])} onChange={(e) => setW({ ...w, [k]: { ...w[k], [end]: fromInput(e.target.value) } })} />
            </Field>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-slate">
          Show days {cfg!.showDays.map((d) => `${fmtStamp(d.date, false)} ${d.open} to ${d.close}`).join("; ")}. Exhibitor passes enter from {cfg!.exhibitorOpen}; contractor passes only inside these windows.
        </p>
        {changed && problems.length > 0 && <p className="mt-2 text-[13px] text-bad">{problems.join(". ")}.</p>}
        {can("expo.manage") && changed && (
          <div className="mt-3 flex flex-wrap gap-2">
            <input className="input h-9 flex-1 min-w-56 text-[13px]" placeholder="Why the times change (logged)" value={why} onChange={(e) => setWhy(e.target.value)} />
            <button className="btn-primary btn-sm" disabled={problems.length > 0 || !why.trim()} onClick={() => dispatch({ type: "expo/config", eventId: cfg!.eventId, patch: w, note: `Build-up and dismantling times changed: ${why.trim()}` })}>
              Save the times
            </button>
          </div>
        )}
      </Section>
      <Section title={`Move-in, ${rows.filter((r) => moveIn(r.e.id)).length} of ${rows.length} stands timed`} flush>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-slate">
                <th className="px-5 py-2 font-normal">Company</th>
                <th className="px-3 py-2 font-normal">Stand</th>
                <th className="px-3 py-2 font-normal">Move-in</th>
                <th className="px-5 py-2 font-normal text-right">Vehicles booked</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, booths }) => {
                const at = moveIn(e.id);
                return (
                  <tr key={e.id} className="border-t border-line">
                    <td className="px-5 py-2">
                      <Link href={`/exhibition/exhibitors/${e.id}`} className="hover:underline">
                        {e.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate">
                      {booths.map((b) => b.code).join(", ")}, {booths[0].type.toLowerCase()}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {can("expo.manage") && slots.length ? (
                        <select className="input h-9 text-[13px]" aria-label={`Move-in for ${e.name}`} value={at && slots.includes(at) ? at : ""} onChange={(x) => x.target.value && !moveInProblems(cfg!, x.target.value, now).length && dispatch({ type: "expo/moveIn", exhibitorId: e.id, at: x.target.value })}>
                          <option value="">{at ? fmtStamp(at) : "Not set"}</option>
                          {slots.map((s) => (
                            <option key={s} value={s}>
                              {fmtStamp(s)}
                            </option>
                          ))}
                        </select>
                      ) : at ? (
                        fmtStamp(at)
                      ) : (
                        <span className="text-slate">Not set</span>
                      )}
                    </td>
                    <td className="px-5 py-2 text-right">{expo.deliveries.filter((d) => d.exhibitorId === e.id && !d.cancelled).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!slots.length && <p className="px-5 py-3 text-[13px] text-slate border-t border-line">Build-up is over, so move-in times are fixed.</p>}
      </Section>
    </div>
  );
}

/** LOG-3: each bay's slots for a day, the vehicles in them, arrivals recorded by the bay team. */
function Deliveries() {
  const { expo, cfg, now, can, dispatch } = useExpo();
  const stands = useStands();
  const all = deliverySlots(cfg!);
  const days = [...new Set(all.map((s) => s.slice(0, 10)))];
  const [dayPick, setDay] = useState(days.find((d) => d >= now.slice(0, 10)) ?? days[days.length - 1]);
  const [f, setF] = useState({ exhibitorId: "", bayId: cfg!.bays[0].id, slot: "", vehicle: "", what: "" });
  const [tried, setTried] = useState(false);
  const problems = f.exhibitorId ? deliveryProblems(expo, cfg!, f, now) : ["Choose the company"];
  const slots = all.filter((s) => s.startsWith(dayPick));
  const name = (id: string) => expo.exhibitors.find((e) => e.id === id)?.name ?? id;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {days.map((d) => (
          <button key={d} aria-pressed={d === dayPick} onClick={() => setDay(d)} className={`pill ${d === dayPick ? "bg-ink text-white" : "bg-paper-200 text-slate"}`}>
            {fmtStamp(d, false)}, {d < cfg!.showDays[0].date ? "build-up" : "dismantling"}
          </button>
        ))}
        <span className="text-slate">
          {cfg!.vehiclesPerSlot} vehicles a {cfg!.slotMin}-minute slot at each bay
        </span>
      </div>
      <Section title={fmtStamp(dayPick, false)} flush>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-slate">
                <th className="px-5 py-2 font-normal w-24">Slot</th>
                {cfg!.bays.map((b) => (
                  <th key={b.id} className="px-3 py-2 font-normal min-w-56">
                    {b.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s} className={`border-t border-line align-top ${s <= now && now < addMinutes(s, cfg!.slotMin) ? "bg-coral/10" : ""}`}>
                  <td className="px-5 py-2 whitespace-nowrap text-slate">{s.slice(11)}</td>
                  {cfg!.bays.map((b) => {
                    const here = expo.deliveries.filter((d) => d.bayId === b.id && d.slot === s);
                    const live = inSlot(expo, b.id, s).length;
                    return (
                      <td key={b.id} className="px-3 py-2">
                        {here.length === 0 ? (
                          <span className="text-slate">—</span>
                        ) : (
                          <ul className="space-y-1.5">
                            {here.map((d) => {
                              const st = deliveryStatus(cfg!, d, now);
                              return (
                                <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <Link href={`/exhibition/exhibitors/${d.exhibitorId}`} className="hover:underline">
                                    {name(d.exhibitorId)}
                                  </Link>
                                  <span className="text-slate">
                                    {d.vehicle} · {d.what}
                                  </span>
                                  <StatePill s={st} />
                                  {can("expo.floor") && (st === "Booked" || st === "Missed") && d.slot <= now && (
                                    <button className="underline underline-offset-4" onClick={() => dispatch({ type: "expo/deliveryState", id: d.id, state: "Arrived" })}>
                                      Arrived
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {live >= cfg!.vehiclesPerSlot && <div className="mt-1 text-[12px] text-slate">Full</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      {(can("expo.floor") || can("expo.manage")) && (
        <Section title="Book a slot for a company">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Company">
              <select className="input" value={f.exhibitorId} onChange={(e) => setF({ ...f, exhibitorId: e.target.value })}>
                <option value="">Choose…</option>
                {stands.map(({ e, booths }) => (
                  <option key={e.id} value={e.id}>
                    {e.name}, {booths.map((b) => b.code).join(", ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bay">
              <select className="input" value={f.bayId} onChange={(e) => setF({ ...f, bayId: e.target.value })}>
                {cfg!.bays.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Slot">
              <select className="input" value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value })}>
                <option value="">Choose…</option>
                {all
                  .filter((s) => s > now)
                  .map((s) => {
                    const n = inSlot(expo, f.bayId, s).length;
                    return (
                      <option key={s} value={s} disabled={n >= cfg!.vehiclesPerSlot}>
                        {fmtStamp(s)}
                        {n >= cfg!.vehiclesPerSlot ? ", full" : n ? `, ${cfg!.vehiclesPerSlot - n} left` : ""}
                      </option>
                    );
                  })}
              </select>
            </Field>
            <Field label="Vehicle">
              <input className="input uppercase" value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })} />
            </Field>
            <Field label="Carrying">
              <input className="input" value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} />
            </Field>
          </div>
          {tried && problems.length > 0 && <p className="mt-2 text-[13px] text-bad">{problems.join(". ")}.</p>}
          <button
            className="btn-primary btn-sm mt-3"
            onClick={() => {
              setTried(true);
              if (problems.length) return;
              dispatch({ type: "expo/delivery", id: `dl_${Date.now().toString(36)}`, ...f });
              setF({ ...f, slot: "", vehicle: "", what: "" });
              setTried(false);
            }}
          >
            Book it
          </button>
        </Section>
      )}
    </div>
  );
}
/** LOG-2: contractors by company; their passes open the hall doors in build-up and dismantling only. */
function Contractors() {
  const { state, cfg, now, can, dispatch } = useExpo();
  const stands = useStands();
  const [exId, setEx] = useState("");
  const [p, setP] = useState<NewPerson>({ name: "", email: "", phone: "", title: "" });
  const [tried, setTried] = useState(false);
  const problems = exId ? peopleProblems(state, cfg!, exId, [p], now) : ["Choose the company"];
  const groups = stands.map((s) => ({ ...s, people: contractorsOf(state, s.e.id) })).filter((g) => g.people.length);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">
      <Section title={`${groups.reduce((n, g) => n + g.people.length, 0)} contractors, ${groups.length} stands`} flush>
        {groups.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>No contractors registered.</Empty>
          </div>
        ) : (
          <ul>
            {groups.map((g) => (
              <li key={g.e.id} className="px-5 py-3 border-t border-line">
                <Link href={`/exhibition/exhibitors/${g.e.id}`} className="font-medium hover:underline">
                  {g.e.name}
                </Link>
                <span className="text-[13px] text-slate"> · {g.booths.map((b) => b.code).join(", ")}</span>
                <ul className="mt-1 text-[13px]">
                  {g.people.map((d) => (
                    <li key={d.id} className="flex flex-wrap justify-between gap-2 py-0.5">
                      <span>
                        {d.name} <span className="text-slate">· {d.jobTitle}</span>
                      </span>
                      <span className="text-slate">{d.badgeCode}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {can("expo.manage") && (
        <Section title="Register a contractor">
          <div className="grid gap-3">
            <Field label="For">
              <select className="input" value={exId} onChange={(e) => setEx(e.target.value)}>
                <option value="">Choose…</option>
                {stands.map(({ e, booths }) => (
                  <option key={e.id} value={e.id}>
                    {e.name}, {booths.map((b) => b.code).join(", ")}
                  </option>
                ))}
              </select>
            </Field>
            {(["name", "email", "phone", "title"] as const).map((k) => (
              <Field key={k} label={k === "title" ? "Company and role" : k[0].toUpperCase() + k.slice(1)}>
                <input className="input" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
          {tried && problems.length > 0 && <p className="mt-2 text-[13px] text-bad">{problems.join(". ")}.</p>}
          <button
            className="btn-primary btn-sm mt-3"
            onClick={() => {
              setTried(true);
              if (problems.length) return;
              dispatch({ type: "expo/people", exhibitorId: exId, kind: "Contractor", people: [p], idBase: `d_ct_${Date.now().toString(36)}` });
              setP({ name: "", email: "", phone: "", title: "" });
              setTried(false);
            }}
          >
            Issue the pass
          </button>
          <p className="mt-2 text-[12px] text-slate">The pass opens the hall doors {fmtStamp(cfg!.buildUp.from)} to {fmtStamp(cfg!.buildUp.to)} and {fmtStamp(cfg!.dismantle.from)} to {fmtStamp(cfg!.dismantle.to)}.</p>
        </Section>
      )}
    </div>
  );
}

/** LOG-5: each stand cleared, its rentals collected, any damage noted, then signed off. */
function Dismantling() {
  const { expo, cfg, now, can } = useExpo();
  const stands = useStands();
  const open = dismantleOpen(cfg!, now);
  const done = stands.filter((s) => dismantleState(expo.dismantles.find((d) => d.exhibitorId === s.e.id)) === "Signed off").length;
  return (
    <div className="grid gap-4">
      {!open && (
        <p className="text-[14px] text-slate">
          Dismantling starts {fmtStamp(cfg!.dismantle.from)}. Companies mark their stand cleared in the portal; the floor team signs each one off once its rentals are collected.
        </p>
      )}
      <Section title={`${done} of ${stands.length} stands signed off`} flush>
        <ul>
          {stands.map(({ e, booths }) => (
            <DismantleRow key={e.id} exhibitorId={e.id} name={e.name} booths={booths.map((b) => b.code).join(", ")} floor={can("expo.floor")} />
          ))}
        </ul>
      </Section>
    </div>
  );
}

function DismantleRow({ exhibitorId, name, booths, floor }: { exhibitorId: string; name: string; booths: string; floor: boolean }) {
  const { expo, cfg, now, dispatch } = useExpo();
  const [damage, setDamage] = useState("");
  const d = expo.dismantles.find((x) => x.exhibitorId === exhibitorId);
  const out = rentalsOut(expo, exhibitorId);
  const blocked = signOffProblems(expo, cfg!, exhibitorId, now);
  const open = dismantleOpen(cfg!, now);
  return (
    <li className="px-5 py-3 border-t border-line">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 text-[14px]">
          <Link href={`/exhibition/exhibitors/${exhibitorId}`} className="font-medium hover:underline">
            {name}
          </Link>
          <span className="text-[13px] text-slate"> · {booths}</span>
          <div className="text-[13px] text-slate">
            {d?.cleared ? `Cleared ${fmtStamp(d.cleared.at)}` : "Not cleared"} · {out.length ? `${out.length} rental ${out.length === 1 ? "order" : "orders"} to collect` : "No rentals out"}
            {d?.signedOff ? ` · signed off ${fmtStamp(d.signedOff.at)}${d.signedOff.damage ? `, damage: ${d.signedOff.damage}` : ", no damage"}` : ""}
          </div>
        </div>
        <StatePill s={dismantleState(d)} />
      </div>
      {floor && open && !d?.signedOff && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!d?.cleared && (
            <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "expo/dismantleTick", exhibitorId, step: "cleared" })}>
              Mark cleared
            </button>
          )}
          {out.length > 0 && (
            <button className="btn-secondary btn-sm" onClick={() => out.forEach((o) => dispatch({ type: "expo/orderState", orderId: o.id, state: "Collected" }))}>
              Rentals collected
            </button>
          )}
          <input className="input h-9 flex-1 min-w-48 text-[13px]" placeholder="Damage, if any" value={damage} onChange={(e) => setDamage(e.target.value)} />
          <button className="btn-primary btn-sm" disabled={blocked.length > 0} onClick={() => dispatch({ type: "expo/signOff", exhibitorId, damage })}>
            Sign off
          </button>
          {blocked.length > 0 && <span className="w-full text-[12px] text-slate">{blocked.join(". ")}.</span>}
        </div>
      )}
    </li>
  );
}
