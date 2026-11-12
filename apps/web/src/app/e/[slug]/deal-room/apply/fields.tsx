"use client";

/**
 * The application form's parts, shared by the form on the API (apply.tsx, editor.tsx) and the prototype's applicant
 * portal (dr/[appId]/portal.tsx), so both show the same fields the same way.
 */
import { useState, type ReactNode } from "react";
import { CHALLENGE_ROUTES, PATHWAYS, roleOf } from "@excursia/domain/dealroom/logic";
import type { ChallengeRoute, Currency, DrApplication, DrChallenge, Instrument, Stage } from "@excursia/domain/dealroom/types";

export const INSTRUMENTS: Instrument[] = PATHWAYS;
export const STAGES: Stage[] = ["Bankable project", "Early revenue", "Growth", "Expansion"];
export const REVENUE = ["Pre-revenue, contracted offtake", "Under USD 250k", "USD 250k to 1m", "USD 1m to 5m", "USD 5m to 20m", "Over USD 20m"];

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="surface p-5">
      {title && <h2 className="h2 mb-3">{title}</h2>}
      {children}
    </section>
  );
}

export function F({ label, help, span, children }: { label: string; help?: string; span?: boolean; children: ReactNode }) {
  return (
    <label className={`block ${span ? "sm:col-span-2" : ""}`}>
      <span className="label">{label}</span>
      {children}
      {help && <span className="mt-1 block text-[12px] text-slate">{help}</span>}
    </label>
  );
}

export function Chips<T extends string>({ all, value, onChange }: { all: readonly T[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((x) => (
        <button type="button" key={x} aria-pressed={value.includes(x)} className={`pill ${value.includes(x) ? "bg-ink text-white" : "bg-paper-200 text-slate"}`} onClick={() => onChange(value.includes(x) ? value.filter((y) => y !== x) : [...value, x])}>
          {x}
        </button>
      ))}
    </div>
  );
}

/** The problem a public institution or corporate buyer brings, in the paper's challenge-intake terms. */
export function ChallengeFields({ c, onChange }: { c: DrChallenge; onChange: (c: DrChallenge) => void }) {
  const set = (k: keyof DrChallenge) => (e: { target: { value: string } }) => onChange({ ...c, [k]: e.target.value });
  return (
    <Card title="Your challenge">
      <p className="-mt-1 mb-3 text-[13px] text-slate">Describe the problem, not a solution. Businesses see the title and problem once you are verified; the rest is shared with those you agree to meet.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="Challenge title" span>
          <input className="input" value={c.title} placeholder="Faster, cheaper identity checks at county service centres" onChange={set("title")} />
        </F>
        <F label="The problem" span>
          <textarea className="input min-h-20" value={c.problem} onChange={set("problem")} />
        </F>
        <F label="Who has it" help="The users or citizens affected, and how many">
          <input className="input" value={c.users} onChange={set("users")} />
        </F>
        <F label="What success looks like" help="A measurable outcome">
          <input className="input" value={c.outcome} onChange={set("outcome")} />
        </F>
        <F label="Constraints" help="Optional: data rules, systems to integrate, languages, regulation" span>
          <input className="input" value={c.constraints} onChange={set("constraints")} />
        </F>
        <F label="Procurement route">
          <select className="input" value={c.route} onChange={(e) => onChange({ ...c, route: e.target.value as ChallengeRoute | "" })}>
            <option value="">Choose</option>
            {CHALLENGE_ROUTES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </F>
        <F label="Budget range" help="Optional, for example USD 200k to 500k">
          <input className="input" value={c.budget} onChange={set("budget")} />
        </F>
        <F label="Timeline" help="Optional, for example pilot from June 2027">
          <input className="input" value={c.timeline} onChange={set("timeline")} />
        </F>
        <F label="How the decision is made" help="Who signs off, and the steps to a contract">
          <input className="input" value={c.decisionProcess} onChange={set("decisionProcess")} />
        </F>
      </div>
    </Card>
  );
}

export function MandateFields({ app, partner: asPartner, sectors, countries, onChange }: { app: DrApplication; partner?: boolean; sectors: string[]; countries: string[]; onChange: (m: NonNullable<DrApplication["mandate"]>) => void }) {
  const m = app.mandate!;
  const ch = !!app.challenge;
  // a partner buys, distributes or partners: its range is a contract size, not a ticket
  const partner = !ch && (asPartner ?? roleOf(app) === "partner");
  // typed as free text and split on leaving the field, so a comma can be typed
  const [excl, setExcl] = useState(m.exclusions.join(", "));
  return (
    <Card title={ch ? "Who could solve it" : partner ? "What you are looking for" : "Your mandate"}>
      {partner && <p className="-mt-1 mb-3 text-[13px] text-slate">Matching uses these: the sectors, countries and stages of the businesses you want to work with, the pathways you offer and the contract size.</p>}
      {ch && <p className="-mt-1 mb-3 text-[13px] text-slate">Matching uses these: the sectors, countries and stages of the businesses you want to meet, the pathways open to them and the contract size.</p>}
      <div className="grid gap-4">
        <F label="Sectors">
          <Chips all={sectors} value={m.sectors} onChange={(sectors) => onChange({ ...m, sectors })} />
        </F>
        <F label="Countries">
          <Chips all={countries} value={m.countries} onChange={(countries) => onChange({ ...m, countries })} />
        </F>
        <F label="Stages">
          <Chips all={STAGES} value={m.stages} onChange={(stages) => onChange({ ...m, stages })} />
        </F>
        <F label="Transaction pathways">
          <Chips all={INSTRUMENTS} value={m.instruments} onChange={(instruments) => onChange({ ...m, instruments })} />
        </F>
        <div className="grid gap-3 sm:grid-cols-3">
          <F label="Currency">
            <select className="input" value={m.currency} onChange={(e) => onChange({ ...m, currency: e.target.value as Currency })}>
              <option>USD</option>
              <option>KES</option>
            </select>
          </F>
          <F label={ch ? "Smallest contract or pilot" : partner ? "Smallest contract" : "Smallest ticket"}>
            <input className="input" type="number" min={0} value={m.ticketMin || ""} onChange={(e) => onChange({ ...m, ticketMin: Number(e.target.value) })} />
          </F>
          <F label={ch || partner ? "Largest contract" : "Largest ticket"}>
            <input className="input" type="number" min={0} value={m.ticketMax || ""} onChange={(e) => onChange({ ...m, ticketMax: Number(e.target.value) })} />
          </F>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Exclusions" help="Comma-separated, for example coal, tobacco. Optional but checked in matching.">
            <input className="input" value={excl} onChange={(e) => setExcl(e.target.value)} onBlur={() => onChange({ ...m, exclusions: excl.split(",").map((x) => x.trim()).filter(Boolean) })} />
          </F>
          {!ch && (
            <F label="Typical decision timeline" help="Optional">
              <input className="input" value={m.timeline} placeholder="2 to 3 months" onChange={(e) => onChange({ ...m, timeline: e.target.value })} />
            </F>
          )}
        </div>
      </div>
    </Card>
  );
}
