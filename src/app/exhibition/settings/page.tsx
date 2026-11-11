"use client";

import { useState } from "react";
import { PageHeader, Section, Tabs } from "@/components/ui";
import { boothStatus, DEFAULT_INCLUDES, doorAlong, doorOn, hallProblems, includesOf, kes, passLine, resizeHall, validateExpo, wallOf, WALLS, type Wall } from "@/lib/expo/logic";
import { reducer } from "@/lib/store";
import type { BoothCategory, BoothType, ExpoConfig, Exhibitor, Hall, HallFeature } from "@/lib/expo/types";
import type { AppState } from "@/lib/types";
import { fmtStamp } from "@/lib/time";
import { memberName } from "@/lib/expo/logic";
import { Field, useExpo } from "../bits";

const tabs = ["Prices and terms", "Halls", "Checks"] as const;

/** SET-1, SET-3 to SET-6: the price list, the terms and the halls, set by whoever manages the exhibition; changes are logged. */
export default function ExhibitionSettings() {
  const { cfg, can } = useExpo();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Prices and terms");
  if (!cfg) return null;
  return (
    <>
      <PageHeader title="Settings" kicker={can("expo.manage") ? "The price list, terms and halls. Every change is logged." : "Set by the exhibition team. You can read them here."} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "Prices and terms" && <Terms key={JSON.stringify(cfg).length} cfg={cfg} />}
      {tab === "Halls" && <Halls />}
      {tab === "Checks" && <Checks />}
    </>
  );
}

function Terms({ cfg }: { cfg: ExpoConfig }) {
  const { state, can, dispatch } = useExpo();
  const [f, setF] = useState(cfg);
  const [noteText, setNote] = useState("");
  const edit = can("expo.manage");
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const changed = JSON.stringify(f) !== JSON.stringify(cfg);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Prices">
        <div className="grid gap-3 sm:grid-cols-2">
          {(["Shell scheme", "Space only"] as BoothType[]).map((t) => (
            <Field key={t} label={`${t}, KES per m², net`}>
              <input className="input" type="number" disabled={!edit} value={f.rates[t]} onChange={(e) => setF({ ...f, rates: { ...f.rates, [t]: num(e.target.value) } })} />
            </Field>
          ))}
          {(["Standard", "Corner", "Island", "Premium location"] as BoothCategory[]).map((c) => (
            <Field key={c} label={`${c}, price factor`}>
              <input className="input" type="number" step="0.05" disabled={!edit} value={f.factors[c]} onChange={(e) => setF({ ...f, factors: { ...f.factors, [c]: num(e.target.value) } })} />
            </Field>
          ))}
          <Field label="VAT, %">
            <input className="input" type="number" disabled={!edit} value={f.vatPct} onChange={(e) => setF({ ...f, vatPct: num(e.target.value) })} />
          </Field>
          <Field label="Extra exhibitor pass, KES" help={`${f.passPer9} passes come with every 9 m²`}>
            <input className="input" type="number" disabled={!edit} value={f.extraPass} onChange={(e) => setF({ ...f, extraPass: num(e.target.value) })} />
          </Field>
        </div>
        <p className="mt-3 text-[13px] text-slate">A 3 × 3 m shell-scheme booth, standard: {kes(Math.round((9 * f.rates["Shell scheme"] * f.factors.Standard) / 100) * 100)} + VAT. A booth with an agreed price keeps it.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(["Shell scheme", "Space only"] as BoothType[]).map((t) => (
            <Field key={t} label={`${t} includes, one per line`} help={`Shown on the exhibit page, with “${passLine(f)}” added from the terms`}>
              <textarea
                className="input min-h-28 text-[13px]"
                disabled={!edit}
                value={includesOf(f, t).join("\n")}
                onChange={(e) => setF({ ...f, includes: { ...DEFAULT_INCLUDES, ...f.includes, [t]: e.target.value.split("\n") } })}
                onBlur={() => setF({ ...f, includes: { ...DEFAULT_INCLUDES, ...f.includes, [t]: includesOf(f, t).map((l) => l.trim()).filter(Boolean) } })}
              />
            </Field>
          ))}
        </div>
      </Section>
      <Section title="Terms and deadlines">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Hold, hours" help="A held booth comes back on sale after this unless the contract is signed">
            <input className="input" type="number" disabled={!edit} value={f.holdHours} onChange={(e) => setF({ ...f, holdHours: num(e.target.value) })} />
          </Field>
          <Field label="Deposit, %">
            <input className="input" type="number" disabled={!edit} value={f.depositPct} onChange={(e) => setF({ ...f, depositPct: num(e.target.value) })} />
          </Field>
          <Field label="Deposit due, days after signing">
            <input className="input" type="number" disabled={!edit} value={f.depositDays} onChange={(e) => setF({ ...f, depositDays: num(e.target.value) })} />
          </Field>
          <Field label="Balance due">
            <input className="input" type="date" disabled={!edit} value={f.balanceDue} onChange={(e) => setF({ ...f, balanceDue: e.target.value })} />
          </Field>
          <Field label="One invoice in full inside, days of the show">
            <input className="input" type="number" disabled={!edit} value={f.fullInvoiceDays} onChange={(e) => setF({ ...f, fullInvoiceDays: num(e.target.value) })} />
          </Field>
          <Field label="Contract version">
            <input className="input" disabled={!edit} value={f.contractVersion} onChange={(e) => setF({ ...f, contractVersion: e.target.value })} />
          </Field>
          <Field label="Orders due">
            <input className="input" type="date" disabled={!edit} value={f.orderDeadline} onChange={(e) => setF({ ...f, orderDeadline: e.target.value })} />
          </Field>
          <Field label="Branding due">
            <input className="input" type="date" disabled={!edit} value={f.brandingDeadline} onChange={(e) => setF({ ...f, brandingDeadline: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Cancellation terms">
            <textarea className="input min-h-16" disabled={!edit} value={f.cancellation} onChange={(e) => setF({ ...f, cancellation: e.target.value })} />
          </Field>
        </div>
      </Section>
      {edit && (
        <div className="lg:col-span-2 flex flex-wrap items-center gap-2">
          <input className="input h-10 flex-1 min-w-56" placeholder="What changed and why (logged)" value={noteText} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary" disabled={!changed || !noteText.trim()} onClick={() => { const { log: _log, ...patch } = f; void _log; dispatch({ type: "expo/config", eventId: cfg.eventId, patch, note: noteText }); setNote(""); }}>
            Save the changes
          </button>
        </div>
      )}
      <Section title="Changes" flush className="lg:col-span-2">
        <ul>
          {[...cfg.log].reverse().map((l, i) => (
            <li key={i} className="px-5 py-2 border-b border-line last:border-0 text-[13px]">
              <span className="text-slate">
                {fmtStamp(l.at)} · {memberName(state, l.by)}:
              </span>{" "}
              {l.what}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/** SET-1: the halls, their size and the doors and pillars the plan works around. A booth never sits over a pillar. */
function Halls() {
  const { expo, cfg, can, dispatch } = useExpo();
  const halls = expo.halls.filter((h) => h.eventId === cfg!.eventId);
  const edit = can("expo.manage");
  const add = () => {
    const n = expo.halls.length + 1;
    const blank: Hall = { id: `h_${n}_${cfg!.eventId.slice(-4)}`, eventId: cfg!.eventId, name: `Hall ${n}`, zoneId: halls[0]?.zoneId ?? "z_exhib", width: 24, depth: 18, features: [] };
    dispatch({ type: "expo/hall", hall: { ...blank, features: [{ id: `f_${blank.id}_1`, kind: "Entrance", ...doorOn(blank, "South", 10, 4) }] } });
  };
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {halls.map((h) => (
          <HallCard key={JSON.stringify(h)} h={h} edit={edit} onSave={(x) => dispatch({ type: "expo/hall", hall: x })} onRemove={halls.length > 1 ? () => dispatch({ type: "expo/hallRemove", hallId: h.id }) : undefined} booths={expo.booths.filter((b) => b.hallId === h.id).length} />
        ))}
      </div>
      {edit && (
        <button className="btn-secondary mt-4" onClick={add}>
          Add a hall
        </button>
      )}
    </>
  );
}

const DOORS: HallFeature["kind"][] = ["Entrance", "Loading door", "Fire exit"];

function HallCard({ h, edit, onSave, onRemove, booths }: { h: Hall; edit: boolean; onSave: (h: Hall) => void; onRemove?: () => void; booths: number }) {
  const { expo } = useExpo();
  const [f, setF] = useState(h);
  const problems = hallProblems(expo, f);
  const changed = JSON.stringify(f) !== JSON.stringify(h);
  const size = (width: number, depth: number) => setF(resizeHall(f, width, depth));
  const put = (id: string, patch: Partial<HallFeature>) => setF({ ...f, features: f.features.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const door = (x: HallFeature, wall: Wall, at: number, len: number) => put(x.id, doorOn(f, wall, Math.max(0, at), Math.max(1, len)));
  const nextId = () => `f_${h.id}_${Math.max(0, ...f.features.map((x) => Number(x.id.split("_").pop()) || 0)) + 1}`;
  const num = (v: string) => Math.max(0, Number(v) || 0);
  return (
    <Section title={h.name} action={<span className="text-[13px] text-slate">{booths} booths</span>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <input className="input" disabled={!edit} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Width, m">
          <input className="input" type="number" disabled={!edit} value={f.width} onChange={(e) => size(num(e.target.value), f.depth)} />
        </Field>
        <Field label="Depth, m">
          <input className="input" type="number" disabled={!edit} value={f.depth} onChange={(e) => size(f.width, num(e.target.value))} />
        </Field>
      </div>
      <p className="mt-2 text-[13px] text-slate">Its doors are the platform zone {h.zoneId === "z_exhib" ? "Exhibition" : h.zoneId}, so exhibitor and contractor passes work at the scanner.</p>
      <h3 className="mt-4 text-[13px] font-medium">Doors and pillars</h3>
      <p className="text-[12px] text-slate">Doors are placed along a wall, measured from its left or top end; pillars by their distance from the top-left corner. Booths cannot sit over a pillar.</p>
      <ul className="mt-2 grid gap-2">
        {f.features.map((x) => {
          const wall = wallOf(f, x);
          const along = doorAlong(f, x);
          return (
            <li key={x.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <select className="input h-9 w-32 px-2 text-[13px]" aria-label="Kind" disabled={!edit} value={x.kind} onChange={(e) => {
                  const kind = e.target.value as HallFeature["kind"];
                  if (kind === "Pillar") put(x.id, { kind, x: Math.min(x.x, f.width - 1), y: Math.min(Math.max(x.y, 1), f.depth - 2), w: 1, d: 1 });
                  else if (x.kind === "Pillar") put(x.id, { kind, ...doorOn(f, "South", Math.min(x.x, f.width - 2), 2) });
                  else put(x.id, { kind });
                }}>
                  {[...DOORS, "Pillar" as const].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                {wall ? (
                  <>
                    <select className="input h-9 w-28 px-2 text-[13px]" aria-label="Wall" disabled={!edit} value={wall} onChange={(e) => door(x, e.target.value as Wall, along.at, along.len)}>
                      {WALLS.map((w) => (
                        <option key={w} value={w}>
                          {w} wall
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1">
                      at <input className="input h-9 w-14 px-2 text-[13px]" type="number" disabled={!edit} value={along.at} onChange={(e) => door(x, wall, num(e.target.value), along.len)} /> m,
                    </label>
                    <label className="flex items-center gap-1">
                      <input className="input h-9 w-14 px-2 text-[13px]" type="number" disabled={!edit} value={along.len} onChange={(e) => door(x, wall, along.at, num(e.target.value))} /> m wide
                    </label>
                  </>
                ) : (
                  <>
                    <label className="flex items-center gap-1">
                      <input className="input h-9 w-14 px-2 text-[13px]" type="number" disabled={!edit} value={x.x} onChange={(e) => put(x.id, { x: num(e.target.value) })} /> m across,
                    </label>
                    <label className="flex items-center gap-1">
                      <input className="input h-9 w-14 px-2 text-[13px]" type="number" disabled={!edit} value={x.y} onChange={(e) => put(x.id, { y: num(e.target.value) })} /> m down
                    </label>
                  </>
                )}
              </div>
              {edit && (
                <button className="h-9 w-9 rounded-md text-[18px] leading-none text-slate hover:bg-paper hover:text-ink" aria-label={`Remove the ${x.kind.toLowerCase()}`} title="Remove" onClick={() => setF({ ...f, features: f.features.filter((y) => y.id !== x.id) })}>
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {edit && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setF({ ...f, features: [...f.features, { id: nextId(), kind: "Entrance", ...doorOn(f, "South", 0, 3) }] })}>
            Add a door
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setF({ ...f, features: [...f.features, { id: nextId(), kind: "Pillar", x: Math.floor(f.width / 2), y: Math.floor(f.depth / 2), w: 1, d: 1 }] })}>
            Add a pillar
          </button>
        </div>
      )}
      {changed && problems.length > 0 && <p className="mt-3 text-[13px] text-bad">{problems.join(". ")}.</p>}
      {edit && (
        <div className="mt-3 flex gap-2">
          <button className="btn-primary btn-sm" disabled={!changed || problems.length > 0} onClick={() => onSave(f)}>
            Save the hall
          </button>
          {changed && (
            <button className="btn-secondary btn-sm" onClick={() => setF(h)}>
              Undo
            </button>
          )}
          {/* a hall goes only once it has no booths; the reducer holds the same rule */}
          {onRemove && !changed && booths === 0 && (
            <button className="ml-auto text-[13px] underline underline-offset-4 text-slate hover:text-ink" onClick={onRemove}>
              Remove the hall
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

/** The invariants, and the proof that a booth is never sold twice: 50 requests at once, through the real reducer. */
function Checks() {
  const { state, expo, cfg, now } = useExpo();
  const problems = validateExpo(state);
  const [result, setResult] = useState<{ one: number; spread: number; free: number; problems: string[] } | null>(null);
  const run = () => {
    const free = expo.booths.filter((b) => b.eventId === cfg!.eventId && boothStatus(expo, b, cfg!, now) === "Available");
    // fifty approved companies with no booth, made up for the test only
    const fake: Exhibitor[] = Array.from({ length: 50 }, (_, i) => ({ ...expo.exhibitors[0], id: `ex_test${i}`, ref: `TEST-${i}`, name: `Test company ${i + 1}`, status: "Approved", sponsorId: undefined, history: [] }));
    const base: AppState = { ...state, expo: { ...expo, actingMemberId: "u_staff2", exhibitors: [...expo.exhibitors, ...fake] } };
    const burst = (target: (i: number) => string) => {
      let s = base;
      fake.forEach((e, i) => (s = reducer(s, { type: "expo/hold", id: `bk_test${i}`, exhibitorId: e.id, boothIds: [target(i)] })));
      return s;
    };
    const one = burst(() => free[0].id);
    const spread = burst((i) => free[i % Math.min(10, free.length)].id);
    setResult({ one: one.expo.bookings.length - expo.bookings.length, spread: spread.expo.bookings.length - expo.bookings.length, free: Math.min(10, free.length), problems: validateExpo(spread) });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Never sold twice">
        <p className="text-[14px]">Sends 50 hold requests through the real reducer: first all for one available booth, then spread over ten. Nothing is saved.</p>
        <button className="btn-primary mt-3" onClick={run}>
          Run the 50-request test
        </button>
        {result && (
          <ul className="mt-3 text-[14px] space-y-1">
            <li>50 requests for one booth: {result.one} held.</li>
            <li>
              50 requests over {result.free} booths: {result.spread} held.
            </li>
            <li className={result.problems.length ? "text-bad" : "text-ok"}>{result.problems.length ? result.problems.join("; ") : "Invariants hold afterwards."}</li>
          </ul>
        )}
      </Section>
      <Section title={problems.length ? `${problems.length} problems` : "Invariants"}>
        {problems.length ? (
          <ul className="text-[14px] text-bad space-y-1">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-ok">No booth overlaps another or leaves its hall; none is sold twice; no payment exceeds its invoice; every company is within its pass allowance; every badge code is unique.</p>
        )}
      </Section>
    </div>
  );
}
