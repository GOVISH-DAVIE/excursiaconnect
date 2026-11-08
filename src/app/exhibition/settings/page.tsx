"use client";

import { useState } from "react";
import { PageHeader, Section, Tabs } from "@/components/ui";
import { boothStatus, kes, validateExpo } from "@/lib/expo/logic";
import { expoReducer } from "@/lib/expo/reducer";
import type { BoothCategory, BoothType, ExpoConfig, Exhibitor, Hall } from "@/lib/expo/types";
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

function Halls() {
  const { expo, cfg, can, dispatch } = useExpo();
  const halls = expo.halls.filter((h) => h.eventId === cfg!.eventId);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {halls.map((h) => (
        <HallCard key={h.id + h.width + h.depth + h.name} h={h} edit={can("expo.manage")} onSave={(x) => dispatch({ type: "expo/hall", hall: x })} booths={expo.booths.filter((b) => b.hallId === h.id).length} />
      ))}
    </div>
  );
}

function HallCard({ h, edit, onSave, booths }: { h: Hall; edit: boolean; onSave: (h: Hall) => void; booths: number }) {
  const { expo } = useExpo();
  const [f, setF] = useState(h);
  const tooSmall = expo.booths.some((b) => b.hallId === h.id && (b.x + b.w > f.width || b.y + b.d > f.depth));
  return (
    <Section title={h.name} action={<span className="text-[13px] text-slate">{booths} booths</span>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <input className="input" disabled={!edit} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Width, m">
          <input className="input" type="number" disabled={!edit} value={f.width} onChange={(e) => setF({ ...f, width: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Depth, m">
          <input className="input" type="number" disabled={!edit} value={f.depth} onChange={(e) => setF({ ...f, depth: Number(e.target.value) || 0 })} />
        </Field>
      </div>
      <p className="mt-2 text-[13px] text-slate">Doors: the platform zone {h.zoneId === "z_exhib" ? "Exhibition" : h.zoneId}, so exhibitor passes work at the scanner. Features: {h.features.map((x) => x.kind.toLowerCase()).join(", ")}.</p>
      {tooSmall && <p className="mt-2 text-[13px] text-bad">Booths sit beyond that size; move them first.</p>}
      {edit && (
        <button className="btn-secondary btn-sm mt-3" disabled={tooSmall || JSON.stringify(f) === JSON.stringify(h) || !f.name.trim()} onClick={() => onSave(f)}>
          Save the hall
        </button>
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
      fake.forEach((e, i) => (s = expoReducer(s, { type: "expo/hold", id: `bk_test${i}`, exhibitorId: e.id, boothIds: [target(i)] })));
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
