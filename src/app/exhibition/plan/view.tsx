"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageHeader, Section } from "@/components/ui";
import { FloorPlan, PlanLegend } from "@/components/floor-plan";
import { activeBookingOf, activeBookingOfBooth, area, bookingStage, boothNet, boothStatus, holdExpiresAt, holdProblems, kes, placementProblems } from "@/lib/expo/logic";
import type { Booth, BoothCategory, BoothStatus, BoothType } from "@/lib/expo/types";
import { fmtStamp } from "@/lib/time";
import { Refusal } from "@/app/dealroom/bits";
import { Field, StagePill, priceLine, useExpo, ScannerWork } from "../bits";

const STATUSES: BoothStatus[] = ["Available", "Held", "Reserved", "Booked", "Blocked"];
const CATEGORIES: BoothCategory[] = ["Standard", "Corner", "Island", "Premium location"];

export default function PlanView() {
  // a link to the plan with other filters starts the view afresh
  const q = useSearchParams();
  return <Plan key={q.toString()} />;
}

/** SET-2, BTH-1, BTH-2, BTH-6: the plan to scale; the organiser places booths, allocates them, and sees what is left. */
function Plan() {
  const { expo, cfg, now, can, dispatch } = useExpo();
  const q = useSearchParams();
  const halls = expo.halls.filter((h) => h.eventId === cfg?.eventId);
  const [hallId, setHallId] = useState(halls.find((h) => h.id === q.get("hall"))?.id ?? halls[0]?.id);
  const [status, setStatus] = useState<BoothStatus[]>((q.get("status") ?? "").split(",").filter((s): s is BoothStatus => STATUSES.includes(s as BoothStatus)));
  const [selected, setSelected] = useState<string | null>(expo.booths.find((b) => b.code === q.get("booth"))?.id ?? null);
  const [category, setCategory] = useState<BoothCategory | null>(CATEGORIES.find((c) => c === q.get("category")) ?? null);
  const [refused, setRefused] = useState("");
  if (!cfg) return null;
  if (!can("expo.manage") && !can("expo.floor") && !can("money.view")) return <Refusal title="The floor plan is for the exhibition team"><ScannerWork /></Refusal>;
  const hall = halls.find((h) => h.id === hallId)!;
  const booths = expo.booths.filter((b) => b.hallId === hall.id);
  const statusOf = (b: Booth) => boothStatus(expo, b, cfg, now);
  const ownerOf = (b: Booth) => {
    const k = activeBookingOfBooth(expo, b.id, cfg, now);
    return k ? expo.exhibitors.find((e) => e.id === k.exhibitorId) : undefined;
  };
  const edit = can("expo.manage");
  const move = (id: string, x: number, y: number) => {
    const b = expo.booths.find((z) => z.id === id)!;
    const moved = { ...b, x, y };
    const p = placementProblems(expo, moved);
    if (p.length) return setRefused(`${b.code} cannot go there: ${p.map((x) => x[0].toLowerCase() + x.slice(1)).join("; ")}.`);
    setRefused("");
    dispatch({ type: "expo/booth", booth: moved });
  };
  const sel = expo.booths.find((b) => b.id === selected && b.hallId === hall.id);
  const addBooth = () => {
    // the first free 3 × 3 m spot on the grid, so the new booth never lands on another
    for (let y = 0; y + 3 <= hall.depth; y += 3)
      for (let x = 0; x + 3 <= hall.width; x += 3) {
        const n = expo.booths.filter((b) => b.eventId === cfg.eventId).length + 1;
        const b: Booth = { id: `b_new${n}_${now.replace(/\D/g, "").slice(-6)}`, eventId: cfg.eventId, hallId: hall.id, code: `N${n}`, x, y, w: 3, d: 3, type: "Shell scheme", category: "Standard", openSides: 1 };
        if (!placementProblems(expo, b).length) {
          dispatch({ type: "expo/booth", booth: b });
          setSelected(b.id);
          return;
        }
      }
    setRefused(`${hall.name} has no free 3 × 3 m spot left.`);
  };

  return (
    <>
      <PageHeader
        title="Floor plan"
        kicker={edit ? "Drag a booth to move it, or select it and use the arrow keys; the grid is 1 m. Overlaps and the hall's walls are refused." : "Select a booth to see who has it. Your role can view the plan, not change it."}
        actions={edit ? <button className="btn-secondary" onClick={addBooth}>Add a booth</button> : undefined}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {halls.map((h) => (
          <button key={h.id} className={h.id === hall.id ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => { setHallId(h.id); setSelected(null); }}>
            {h.name}
          </button>
        ))}
        <span className="ml-2 text-[13px] text-slate">Pick out:</span>
        {STATUSES.map((s) => (
          <button key={s} aria-pressed={status.includes(s)} className={`pill ${status.includes(s) ? "bg-ink text-white" : "bg-paper-200 text-slate hover:text-ink"}`} onClick={() => setStatus(status.includes(s) ? status.filter((x) => x !== s) : [...status, s])}>
            {s === "Blocked" ? "Not for sale" : s} {booths.filter((b) => statusOf(b) === s).length}
          </button>
        ))}
        {category && (
          <button className="pill bg-ink text-white" aria-label={`Stop picking out ${category} booths`} onClick={() => setCategory(null)}>
            {category} ×
          </button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <section className="surface p-4">
            <FloorPlan
              hall={hall}
              booths={booths}
              statusOf={statusOf}
              labelOf={(b) => ownerOf(b)?.name}
              tip={(b) => [`${b.code}, ${statusOf(b) === "Blocked" ? "not for sale" : statusOf(b).toLowerCase()}`, `${b.w} × ${b.d} m ${b.type.toLowerCase()}, ${b.category.toLowerCase()}`, ownerOf(b)?.name ?? priceLine(b, cfg.vatPct, boothNet(cfg, b))]}
              selected={selected}
              onSelect={(id) => { setSelected(id); setRefused(""); }}
              faded={status.length || category ? (b) => (status.length > 0 && !status.includes(statusOf(b))) || (!!category && b.category !== category) : undefined}
              editable={edit}
              onMove={move}
              problemsAt={(b, x, y) => placementProblems(expo, { ...b, x, y })}
            />
            <div className="mt-3">
              <PlanLegend />
            </div>
            {refused && <p className="mt-2 text-[13px] text-bad">{refused}</p>}
          </section>
          <Availability hallId={hall.id} onPick={(s, c) => { setStatus([s]); setCategory(c); }} />
        </div>
        <div className="min-w-0">{sel ? <BoothPanel key={sel.id + sel.x + sel.y} booth={sel} onRemoved={() => setSelected(null)} /> : <Section title="Select a booth">Its size, price and who has it show here{edit ? ", with the controls to change it or allocate it" : ""}.</Section>}</div>
      </div>
    </>
  );
}

/** BTH-6: what is left, by category, each count picking out those booths: that status and that category. */
function Availability({ hallId, onPick }: { hallId: string; onPick: (s: BoothStatus, c: BoothCategory) => void }) {
  const { expo, cfg, now } = useExpo();
  const booths = expo.booths.filter((b) => b.hallId === hallId);
  return (
    <Section title="Availability in this hall" flush>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Category</th>
              {STATUSES.map((s) => (
                <th key={s} className="th-r">
                  {s === "Blocked" ? "Not for sale" : s}
                </th>
              ))}
              <th className="th-r">m² free</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.filter((c) => booths.some((b) => b.category === c)).map((c) => {
              const mine = booths.filter((b) => b.category === c);
              return (
                <tr key={c}>
                  <td className="td">{c}</td>
                  {STATUSES.map((s) => {
                    const n = mine.filter((b) => boothStatus(expo, b, cfg!, now) === s).length;
                    return (
                      <td key={s} className="td-r">
                        {n ? (
                          <button className="hover:underline underline-offset-4" aria-label={`Pick out the ${n} ${c.toLowerCase()} booths ${s === "Blocked" ? "not for sale" : s.toLowerCase()}`} onClick={() => onPick(s, c)}>
                            {n}
                          </button>
                        ) : (
                          <span className="text-slate">0</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="td-r">{mine.filter((b) => boothStatus(expo, b, cfg!, now) === "Available").reduce((n, b) => n + area(b), 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function BoothPanel({ booth, onRemoved }: { booth: Booth; onRemoved: () => void }) {
  const { expo, cfg, now, can, dispatch } = useExpo();
  const [f, setF] = useState(booth);
  const [to, setTo] = useState("");
  const edit = can("expo.manage");
  const st = boothStatus(expo, booth, cfg!, now);
  const k = activeBookingOfBooth(expo, booth.id, cfg!, now);
  const ex = k && expo.exhibitors.find((e) => e.id === k.exhibitorId);
  const problems = placementProblems(expo, f);
  const changed = JSON.stringify(f) !== JSON.stringify(booth);
  const waiting = expo.exhibitors.filter((e) => e.eventId === booth.eventId && e.status === "Approved" && !activeBookingOf(expo, e.id, cfg!, now));
  const pick = expo.exhibitors.find((e) => e.id === to);
  const holdWhy = pick ? holdProblems(expo, cfg!, pick, [booth.id], now) : [];
  const net = boothNet(cfg!, f);
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  return (
    <div className="space-y-4">
      <Section title={`Booth ${booth.code}`} action={<span className="text-[13px] text-slate">{st === "Blocked" ? "Not for sale" : st}</span>}>
        <dl className="grid gap-1.5 text-[14px]">
          <div className="flex justify-between gap-3">
            <dt className="text-slate">Size</dt>
            <dd>
              {booth.w} × {booth.d} m, {area(booth)} m², {booth.openSides} open side{booth.openSides === 1 ? "" : "s"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate">Type</dt>
            <dd>
              {booth.type}, {booth.category.toLowerCase()}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate">Price</dt>
            <dd className="text-right">{priceLine(booth, cfg!.vatPct, boothNet(cfg!, booth))}</dd>
          </div>
          {booth.blocked && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate">Why not for sale</dt>
              <dd className="text-right">{booth.blocked}</dd>
            </div>
          )}
        </dl>
        {k && ex && (
          <div className="mt-4 border-t border-line pt-3 text-[14px]">
            <div className="flex items-center justify-between gap-2">
              <Link className="font-medium hover:underline" href={`/exhibition/exhibitors/${ex.id}`}>
                {ex.name}
              </Link>
              <StagePill k={k} />
            </div>
            {bookingStage(expo, k, cfg!, now) === "Held" && <p className="mt-1 text-[13px] text-slate">Held until {fmtStamp(holdExpiresAt(k, cfg!))}; the booth comes back on sale if the contract is not signed by then.</p>}
          </div>
        )}
        {!k && edit && st === "Available" && (
          <div className="mt-4 border-t border-line pt-3">
            <Field label="Allocate to an approved exhibitor" help={waiting.length ? "Holds the booth for them; they have the hold hours to sign." : "Every approved exhibitor already has a booth."}>
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)} disabled={!waiting.length}>
                <option value="">Choose…</option>
                {waiting.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.application.boothPref ? `, asked for ${e.application.boothPref}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            {holdWhy.length > 0 && <p className="mt-2 text-[13px] text-bad">{holdWhy.join(". ")}.</p>}
            <button className="btn-primary btn-sm mt-2" disabled={!pick || holdWhy.length > 0} onClick={() => { dispatch({ type: "expo/hold", id: `bk_${expo.bookings.length + 1}_${now.replace(/\D/g, "").slice(-8)}`, exhibitorId: pick!.id, boothIds: [booth.id] }); setTo(""); }}>
              Allocate {booth.code}
            </button>
          </div>
        )}
      </Section>
      {edit && (
        <Section title="Change this booth">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code">
              <input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
            </Field>
            <Field label="Open sides">
              <input className="input" type="number" min={1} max={4} value={f.openSides} onChange={(e) => setF({ ...f, openSides: Math.min(4, Math.max(1, num(e.target.value))) })} />
            </Field>
            <Field label="Width, m">
              <input className="input" type="number" min={2} value={f.w} onChange={(e) => setF({ ...f, w: num(e.target.value) })} disabled={!!k} />
            </Field>
            <Field label="Depth, m">
              <input className="input" type="number" min={2} value={f.d} onChange={(e) => setF({ ...f, d: num(e.target.value) })} disabled={!!k} />
            </Field>
            <Field label="Type">
              <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as BoothType })} disabled={!!k}>
                <option>Shell scheme</option>
                <option>Space only</option>
              </select>
            </Field>
            <Field label="Category">
              <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as BoothCategory })} disabled={!!k}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Agreed price, net" help="Empty for the price list">
              <input className="input" type="number" min={0} value={f.priceOverride ?? ""} onChange={(e) => setF({ ...f, priceOverride: e.target.value === "" ? undefined : num(e.target.value) })} disabled={!!k} />
            </Field>
            <Field label="Not for sale because">
              <input className="input" value={f.blocked ?? ""} onChange={(e) => setF({ ...f, blocked: e.target.value || undefined })} disabled={!!k} />
            </Field>
          </div>
          <p className="mt-2 text-[13px] text-slate">
            Price: {kes(net)} + VAT{f.priceOverride === undefined ? `, from ${kes(cfg!.rates[f.type])} per m² × ${cfg!.factors[f.category]}` : ""}.{k ? " Size, type and price are fixed while the booth is held or sold." : ""}
          </p>
          {problems.length > 0 && <p className="mt-2 text-[13px] text-bad">{problems.join(". ")}.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary btn-sm" disabled={!changed || problems.length > 0} onClick={() => dispatch({ type: "expo/booth", booth: f })}>
              Save
            </button>
            <button className="btn-quiet text-bad" disabled={!!k} title={k ? "Cancel its booking first" : undefined} onClick={() => { dispatch({ type: "expo/boothRemove", boothId: booth.id }); onRemoved(); }}>
              Remove the booth
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}
