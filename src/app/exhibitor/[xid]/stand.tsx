"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { activeBookingOf, allowance, extraPassesBought, gross, invoiceStatus, kes, staffOf } from "@/lib/expo/logic";
import {
  FASCIA_MAX,
  ISSUE_CATEGORIES,
  ISSUE_PRIORITIES,
  REQUIREMENT_KINDS,
  brandingProblems,
  brandingState,
  contractorsOf,
  deliveryProblems,
  deliverySlots,
  deliveryStatus,
  dismantleOpen,
  dismantleState,
  extraNeeded,
  inSlot,
  issueProblems,
  issueStatus,
  orderLate,
  orderLines,
  orderProblems,
  passCap,
  peopleFromCsv,
  peopleProblems,
  rentalsOut,
  type NewPerson,
  type PersonKind,
} from "@/lib/expo/onsite";
import type { ExpoDoc, Exhibitor, IssueCategory, IssuePriority, RequirementKind } from "@/lib/expo/types";
import type { Delegate } from "@/lib/types";
import { fmtStamp } from "@/lib/time";
import { UploadDoc } from "@/app/dealroom/bits";
import { Card } from "./card";

/*
  The stand once the contract is signed: the people on it (POR-2, LOG-2), its branding, equipment and needs
  (POR-3 to POR-5), and the days around it (LOG-1, LOG-3, LOG-5, OPS-4). Every refusal is explained with the
  same function the reducer applies.
*/

const usePortal = (e: Exhibitor) => {
  const { state, dispatch } = useStore();
  const expo = state.expo;
  const cfg = expo.configs[e.eventId];
  const now = expo.clock;
  return { state, dispatch, expo, cfg, now, k: activeBookingOf(expo, e.id, cfg, now) };
};
const win = (w: { from: string; to: string }) => `${fmtStamp(w.from)} to ${fmtStamp(w.to)}`;
const Problems = ({ list }: { list: string[] }) => (list.length ? <p className="mt-2 text-[13px] text-bad">{list.join(". ")}.</p> : null);
const tone = (s: string) => (["Approved", "Arrived", "Delivered", "Collected", "Resolved", "Signed off", "Checked in", "Paid", "Badge ready", "Seen by the team"].includes(s) ? "bg-ok-50 text-ok" : ["Returned", "Missed", "Overdue"].includes(s) ? "bg-bad-50 text-bad" : ["Cancelled", "Not sent", "Not started"].includes(s) ? "bg-paper-200 text-slate" : "bg-warn-50 text-warn");
const Tag = ({ s }: { s: string }) => <span className={`pill whitespace-nowrap ${tone(s)}`}>{s}</span>;

/* ---------- People ---------- */

export function PeopleTab({ e }: { e: Exhibitor }) {
  const { state, expo, cfg, k } = usePortal(e);
  if (!k) return null;
  const staff = staffOf(state, e.id);
  const bought = extraPassesBought(expo, e.id);
  return (
    <>
      <Card title="Stand staff" aside={<span className="text-[13px] text-slate">{staff.length} of {passCap(state, cfg, e.id)} passes used</span>}>
        <p className="text-[14px] text-slate">
          {allowance(cfg, expo.booths.filter((b) => k.boothIds.includes(b.id)))} passes come with your stand{bought ? `, and you have bought ${bought} more` : ""}. Each person gets a badge for the accreditation desk. More passes are {kes(cfg.extraPass)} + VAT each, invoiced when you add them.
        </p>
        <PersonList e={e} people={staff} />
        <AddPeople e={e} kind="Staff" />
      </Card>
      <Card title="Contractors" aside={<span className="text-[13px] text-slate">{contractorsOf(state, e.id).length} registered</span>}>
        <p className="text-[14px] text-slate">
          Stand builders and suppliers. Their passes open the hall doors during build-up, {win(cfg.buildUp)}, and dismantling, {win(cfg.dismantle)}; not on show days.
        </p>
        <PersonList e={e} people={contractorsOf(state, e.id)} />
        <AddPeople e={e} kind="Contractor" />
      </Card>
    </>
  );
}

function PersonList({ e, people }: { e: Exhibitor; people: Delegate[] }) {
  const { dispatch } = usePortal(e);
  const [asking, setAsking] = useState<string | null>(null);
  if (!people.length) return <p className="mt-3 text-[14px] text-slate">Nobody yet.</p>;
  return (
    <ul className="mt-3 border-t border-line">
      {people.map((d) => (
        <li key={d.id} className="py-2.5 border-b border-line flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[14px] font-medium">{d.name}</div>
            <div className="text-[12px] text-slate">
              {d.jobTitle} · {d.badgeCode}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tag s={d.status === "Checked in" ? "Checked in" : "Badge ready"} />
            <Link href={`/badge/${d.id}`} className="text-[13px] underline underline-offset-4">
              Badge
            </Link>
            {d.status !== "Checked in" &&
              (asking === d.id ? (
                <>
                  <button className="text-[13px] text-bad underline underline-offset-4" onClick={() => { dispatch({ type: "expo/personRemove", delegateId: d.id, as: "exhibitor" }); setAsking(null); }}>
                    Cancel the pass
                  </button>
                  <button className="text-[13px] text-slate underline underline-offset-4" onClick={() => setAsking(null)}>
                    Keep
                  </button>
                </>
              ) : (
                <button className="text-[13px] text-slate underline underline-offset-4" onClick={() => setAsking(d.id)}>
                  Remove
                </button>
              ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

const blank: NewPerson = { name: "", email: "", phone: "", title: "" };

function AddPeople({ e, kind }: { e: Exhibitor; kind: PersonKind }) {
  const { state, dispatch, cfg, now } = usePortal(e);
  const [mode, setMode] = useState<"one" | "list" | null>(null);
  const [p, setP] = useState(blank);
  const [csv, setCsv] = useState("");
  const [tried, setTried] = useState(false);
  const people = mode === "one" ? [p] : peopleFromCsv(csv);
  const problems = peopleProblems(state, cfg, e.id, people, now);
  const extra = kind === "Staff" ? extraNeeded(state, cfg, e.id, people.length) : 0;
  const send = () => {
    setTried(true);
    if (problems.length) return;
    dispatch({ type: "expo/people", exhibitorId: e.id, kind, people, idBase: `d_${kind === "Staff" ? "ex" : "ct"}_${Date.now().toString(36)}`, as: "exhibitor" });
    setP(blank);
    setCsv("");
    setTried(false);
    setMode(null);
  };
  if (!mode)
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-secondary btn-sm" onClick={() => setMode("one")}>
          Add {kind === "Staff" ? "a person" : "a contractor"}
        </button>
        <button className="btn-secondary btn-sm" onClick={() => setMode("list")}>
          Add a list
        </button>
      </div>
    );
  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      {mode === "one" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {(["name", "email", "phone", "title"] as const).map((f) => (
            <label key={f} className="block">
              <span className="label">{f === "title" ? (kind === "Staff" ? "Role on the stand" : "Company and role") : f[0].toUpperCase() + f.slice(1)}</span>
              <input className="input" type={f === "email" ? "email" : f === "phone" ? "tel" : "text"} value={p[f]} onChange={(x) => setP({ ...p, [f]: x.target.value })} />
            </label>
          ))}
        </div>
      ) : (
        <>
          <label className="block">
            <span className="label">Paste a list: name, email, phone, role; one person a line, a header row is fine</span>
            <textarea className="input min-h-28 font-mono text-[13px]" value={csv} onChange={(x) => setCsv(x.target.value)} placeholder={"name,email,phone,title\nAmina Otieno,amina@yourco.example,+254700000001,Sales lead"} />
          </label>
          <label className="mt-2 inline-block btn-secondary btn-sm cursor-pointer">
            Or choose a CSV file
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (x) => { const f = x.target.files?.[0]; x.target.value = ""; if (f) setCsv(await f.text()); }} />
          </label>
          {people.length > 0 && <p className="mt-2 text-[13px] text-slate">{people.length} {people.length === 1 ? "person" : "people"} read from the list.</p>}
        </>
      )}
      {extra > 0 && (
        <p className="mt-2 text-[13px] text-warn">
          {extra} {extra === 1 ? "of these goes" : "of these go"} beyond your passes: {kes(gross(extra * cfg.extraPass, cfg.vatPct))} with VAT goes on an invoice.
        </p>
      )}
      {tried && <Problems list={problems} />}
      <div className="mt-3 flex gap-2">
        <button className="btn-primary btn-sm" onClick={send} disabled={!people.length}>
          {mode === "one" ? "Register" : `Register ${people.length || ""}`.trim()}
        </button>
        <button className="btn-secondary btn-sm" onClick={() => { setMode(null); setTried(false); }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------- Stand: branding, equipment, needs ---------- */

export function StandTab({ e, toInvoices }: { e: Exhibitor; toInvoices: () => void }) {
  return (
    <>
      <BrandingCard e={e} />
      <OrdersCard e={e} toInvoices={toInvoices} />
      <RequirementsCard e={e} />
    </>
  );
}

function BrandingCard({ e }: { e: Exhibitor }) {
  const { expo, cfg, now, dispatch } = usePortal(e);
  const b = expo.branding.find((x) => x.exhibitorId === e.id);
  const st = brandingState(b);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<{ fascia: string; logo?: ExpoDoc; artwork: ExpoDoc[] }>({ fascia: b?.fascia ?? e.name.toUpperCase().slice(0, FASCIA_MAX), logo: b?.logo, artwork: b?.artwork ?? [] });
  const [tried, setTried] = useState(false);
  const problems = brandingProblems(expo, cfg, e.id, f, now);
  const pastDeadline = now.slice(0, 10) > cfg.brandingDeadline;
  const form = !b || editing || st === "Returned";
  return (
    <Card title="Branding" aside={<Tag s={st} />}>
      <p className="text-[14px] text-slate">
        The name on your fascia board, your logo and any stand graphics. Due {fmtStamp(cfg.brandingDeadline, false)}
        {pastDeadline ? "; sent now, it is printed if there is still time" : ""}. The team approves it before printing.
      </p>
      {st === "Returned" && b?.decision?.note && <p className="mt-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">Returned: {b.decision.note}</p>}
      {b && !form && (
        <div className="mt-3">
          <div className="rounded-md bg-ink px-4 py-3 text-center font-medium tracking-[0.12em] text-white">{b.fascia}</div>
          <ul className="mt-2 text-[13px] text-slate">
            <li>Logo: {b.logo?.name ?? "none"}</li>
            <li>Artwork: {b.artwork.map((a) => a.name).join(", ") || "none"}</li>
            <li>
              Sent {fmtStamp(b.submittedAt)}
              {b.late ? ", after the deadline" : ""}
              {b.decision ? `; ${b.decision.state.toLowerCase()} ${fmtStamp(b.decision.at)}` : "; waiting for the team"}
            </li>
          </ul>
          <button className="btn-secondary btn-sm mt-3" onClick={() => setEditing(true)}>
            Send a new version
          </button>
        </div>
      )}
      {form && (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="label">
              Fascia name, {f.fascia.trim().length} of {FASCIA_MAX}
            </span>
            <input className="input uppercase tracking-wide" maxLength={40} value={f.fascia} onChange={(x) => setF({ ...f, fascia: x.target.value })} />
          </label>
          <div className="text-[14px]">
            <div className="label">Logo</div>
            {f.logo ? (
              <span className="flex flex-wrap items-center gap-2">
                {f.logo.name}
                <button className="text-[13px] text-slate underline underline-offset-4" onClick={() => setF({ ...f, logo: undefined })}>
                  Remove
                </button>
              </span>
            ) : (
              <UploadDoc kind="Logo" at={now} accept=".svg,.pdf,.png,.jpg,.eps" label="Choose the logo" onDone={(d) => setF({ ...f, logo: d })} />
            )}
          </div>
          <div className="text-[14px]">
            <div className="label">Stand graphics (optional)</div>
            {f.artwork.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2">
                {a.name}
                <button className="text-[13px] text-slate underline underline-offset-4" onClick={() => setF({ ...f, artwork: f.artwork.filter((x) => x.id !== a.id) })}>
                  Remove
                </button>
              </div>
            ))}
            <UploadDoc kind="Artwork" at={now} accept=".pdf,.svg,.png,.jpg,.eps" label="Add a file" onDone={(d) => setF({ ...f, artwork: [...f.artwork, d] })} />
          </div>
          {tried && <Problems list={problems} />}
          <div className="flex gap-2">
            <button
              className="btn-primary btn-sm"
              onClick={() => {
                setTried(true);
                if (problems.length) return;
                dispatch({ type: "expo/branding", exhibitorId: e.id, fascia: f.fascia, logo: f.logo, artwork: f.artwork, as: "exhibitor" });
                setEditing(false);
                setTried(false);
              }}
            >
              Send for approval
            </button>
            {b && editing && (
              <button className="btn-secondary btn-sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function OrdersCard({ e, toInvoices }: { e: Exhibitor; toInvoices: () => void }) {
  const { expo, cfg, now, dispatch } = usePortal(e);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [tried, setTried] = useState(false);
  const lines = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([itemId, q]) => ({ itemId, qty: q }));
  const late = orderLate(cfg, now);
  const preview = orderLines(cfg, lines, late);
  const net = preview.reduce((n, l) => n + l.qty * l.unit, 0);
  const problems = orderProblems(expo, cfg, e.id, lines, now);
  const mine = expo.orders.filter((o) => o.exhibitorId === e.id);
  const groups = [...new Set(cfg.catalogue.map((c) => c.group))];
  return (
    <Card title="Equipment and services">
      <p className="text-[14px] text-slate">
        Furniture, power, water, internet and AV, delivered to your stand before the show. Order by {fmtStamp(cfg.orderDeadline, false)}; after that a {cfg.lateSurchargePct}% surcharge applies{late ? ", as it does now" : ""}. Each order gets its own invoice.
      </p>
      {mine.length > 0 && (
        <ul className="mt-3 border-t border-line">
          {mine.map((o) => {
            const inv = expo.invoices.find((i) => i.id === o.invoiceId);
            return (
              <li key={o.id} className="py-2.5 border-b border-line flex flex-wrap items-start justify-between gap-2 text-[14px]">
                <div className="min-w-0">
                  <div>{o.lines.map((l) => `${l.qty} × ${cfg.catalogue.find((c) => c.id === l.itemId)?.name}`).join(", ")}</div>
                  <div className="text-[12px] text-slate">
                    Ordered {fmtStamp(o.at)}
                    {o.late ? ", with the late surcharge" : ""}
                    {inv && (
                      <>
                        {" · "}
                        <button className="underline underline-offset-4" onClick={toInvoices}>
                          {inv.number}, {invoiceStatus(expo, inv, now).toLowerCase()}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <Tag s={o.state} />
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 space-y-3">
        {groups.map((g) => (
          <div key={g}>
            <div className="label">{g}</div>
            {cfg.catalogue
              .filter((c) => c.group === g)
              .map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 py-1 text-[14px]">
                  <span className="min-w-0">
                    {c.name}
                    <span className="text-slate">
                      {" "}
                      · {kes(c.price)} {c.unit}
                    </span>
                  </span>
                  <input className="input h-9 w-20 text-right" type="number" min={0} max={50} aria-label={`How many: ${c.name}`} value={qty[c.id] ?? 0} onChange={(x) => setQty({ ...qty, [c.id]: Math.max(0, Math.min(50, Math.floor(Number(x.target.value) || 0))) })} />
                </div>
              ))}
          </div>
        ))}
      </div>
      {net > 0 && (
        <p className="mt-3 text-[14px]">
          {kes(net)} + VAT, {kes(gross(net, cfg.vatPct))} in all{late ? `, with the ${cfg.lateSurchargePct}% late surcharge` : ""}.
        </p>
      )}
      {tried && <Problems list={problems} />}
      <button
        className="btn-primary btn-sm mt-3"
        disabled={!lines.length}
        onClick={() => {
          setTried(true);
          if (problems.length) return;
          dispatch({ type: "expo/order", id: `ord_${Date.now().toString(36)}`, exhibitorId: e.id, lines, as: "exhibitor" });
          setQty({});
          setTried(false);
        }}
      >
        Place the order
      </button>
    </Card>
  );
}

function RequirementsCard({ e }: { e: Exhibitor }) {
  const { expo, dispatch } = usePortal(e);
  const [f, setF] = useState<{ kind: RequirementKind; text: string }>({ kind: "Access", text: "" });
  const mine = expo.requirements.filter((r) => r.exhibitorId === e.id);
  return (
    <Card title="Special requirements">
      <p className="text-[14px] text-slate">Access, storage, rigging or anything else the floor team should plan for.</p>
      {mine.length > 0 && (
        <ul className="mt-3 border-t border-line">
          {mine.map((r) => (
            <li key={r.id} className="py-2.5 border-b border-line flex flex-wrap items-start justify-between gap-2 text-[14px]">
              <div className="min-w-0">
                <div>
                  <span className="text-slate">{r.kind}: </span>
                  {r.text}
                </div>
                <div className="text-[12px] text-slate">Sent {fmtStamp(r.at)}</div>
              </div>
              <Tag s={r.ack ? "Seen by the team" : "Sent"} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr]">
        <select className="input" aria-label="Kind of requirement" value={f.kind} onChange={(x) => setF({ ...f, kind: x.target.value as RequirementKind })}>
          {REQUIREMENT_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <textarea className="input min-h-16" aria-label="What you need" maxLength={500} value={f.text} placeholder="What you need, and where" onChange={(x) => setF({ ...f, text: x.target.value })} />
      </div>
      <button
        className="btn-secondary btn-sm mt-2"
        disabled={!f.text.trim()}
        onClick={() => {
          dispatch({ type: "expo/requirement", id: `rq_${Date.now().toString(36)}`, exhibitorId: e.id, kind: f.kind, text: f.text, as: "exhibitor" });
          setF({ ...f, text: "" });
        }}
      >
        Send to the floor team
      </button>
    </Card>
  );
}

/* ---------- On site: move-in, deliveries, problems, dismantling ---------- */

export function OnSiteTab({ e }: { e: Exhibitor }) {
  const { expo, cfg, now } = usePortal(e);
  const m = expo.moveIns.find((x) => x.exhibitorId === e.id);
  const over = now >= cfg.buildUp.to;
  return (
    <>
      <Card title="Move-in">
        <p className="text-[14px]">
          {m
            ? m.at <= now
              ? `Your move-in was ${fmtStamp(m.at)}.`
              : `Your stand build starts ${fmtStamp(m.at)}. Arrive with your contractors' passes; vehicles need a delivery slot below.`
            : over
              ? "Build-up is over."
              : "The exhibition team gives you a move-in time during build-up."}
        </p>
        <p className="mt-1 text-[13px] text-slate">Build-up runs {win(cfg.buildUp)}; dismantling {win(cfg.dismantle)}.</p>
      </Card>
      <Deliveries e={e} />
      <ReportIssue e={e} />
      <DismantleCard e={e} />
    </>
  );
}

function Deliveries({ e }: { e: Exhibitor }) {
  const { expo, cfg, now, dispatch } = usePortal(e);
  const slots = deliverySlots(cfg).filter((s) => s > now);
  const [f, setF] = useState({ bayId: cfg.bays[0].id, slot: "", vehicle: "", what: "" });
  const [tried, setTried] = useState(false);
  const problems = deliveryProblems(expo, cfg, { ...f, exhibitorId: e.id }, now);
  const mine = expo.deliveries.filter((d) => d.exhibitorId === e.id).sort((a, b) => a.slot.localeCompare(b.slot));
  return (
    <Card title="Deliveries and collections">
      <p className="text-[14px] text-slate">
        Every vehicle needs a {cfg.slotMin}-minute slot at a loading bay; {cfg.vehiclesPerSlot} vehicles fit a slot.
      </p>
      {mine.length > 0 && (
        <ul className="mt-3 border-t border-line">
          {mine.map((d) => {
            const st = deliveryStatus(cfg, d, now);
            return (
              <li key={d.id} className="py-2.5 border-b border-line flex flex-wrap items-start justify-between gap-2 text-[14px]">
                <div className="min-w-0">
                  <div>
                    {fmtStamp(d.slot)} · {cfg.bays.find((b) => b.id === d.bayId)?.name}
                  </div>
                  <div className="text-[12px] text-slate">
                    {d.vehicle} · {d.what}
                  </div>
                </div>
                <span className="flex items-center gap-2">
                  {st === "Booked" && d.slot > now && (
                    <button className="text-[13px] text-slate underline underline-offset-4" onClick={() => dispatch({ type: "expo/deliveryState", id: d.id, state: "Cancelled", as: "exhibitor" })}>
                      Cancel
                    </button>
                  )}
                  <Tag s={st} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {slots.length === 0 ? (
        <p className="mt-3 text-[14px] text-slate">No slots are left.</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="label">Loading bay</span>
            <select className="input" value={f.bayId} onChange={(x) => setF({ ...f, bayId: x.target.value })}>
              {cfg.bays.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Slot</span>
            <select className="input" value={f.slot} onChange={(x) => setF({ ...f, slot: x.target.value })}>
              <option value="">Choose…</option>
              {slots.map((s) => {
                const taken = inSlot(expo, f.bayId, s).length;
                return (
                  <option key={s} value={s} disabled={taken >= cfg.vehiclesPerSlot}>
                    {fmtStamp(s)}
                    {taken >= cfg.vehiclesPerSlot ? ", full" : taken ? `, ${cfg.vehiclesPerSlot - taken} place left` : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="block">
            <span className="label">Vehicle registration</span>
            <input className="input uppercase" value={f.vehicle} placeholder="KDA 123A" onChange={(x) => setF({ ...f, vehicle: x.target.value })} />
          </label>
          <label className="block">
            <span className="label">What it carries</span>
            <input className="input" value={f.what} placeholder="Stand collection" onChange={(x) => setF({ ...f, what: x.target.value })} />
          </label>
        </div>
      )}
      {tried && <Problems list={problems} />}
      {slots.length > 0 && (
        <button
          className="btn-secondary btn-sm mt-3"
          onClick={() => {
            setTried(true);
            if (problems.length) return;
            dispatch({ type: "expo/delivery", id: `dl_${Date.now().toString(36)}`, exhibitorId: e.id, ...f, as: "exhibitor" });
            setF({ ...f, slot: "", vehicle: "", what: "" });
            setTried(false);
          }}
        >
          Book the slot
        </button>
      )}
    </Card>
  );
}

function ReportIssue({ e }: { e: Exhibitor }) {
  const { expo, cfg, now, dispatch } = usePortal(e);
  const [f, setF] = useState<{ category: IssueCategory; priority: IssuePriority; text: string }>({ category: "Power", priority: "Normal", text: "" });
  const [tried, setTried] = useState(false);
  const problems = issueProblems(expo, cfg, { exhibitorId: e.id, text: f.text }, now, true);
  const mine = expo.issues.filter((i) => i.exhibitorId === e.id).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card title="Report a problem">
      <p className="text-[14px] text-slate">Power, internet, furniture, cleaning or security at your stand. The floor team sees it at once.</p>
      {mine.length > 0 && (
        <ul className="mt-3 border-t border-line">
          {mine.map((i) => {
            const st = issueStatus(cfg, i, now);
            return (
              <li key={i.id} className="py-2.5 border-b border-line flex flex-wrap items-start justify-between gap-2 text-[14px]">
                <div className="min-w-0">
                  <div>
                    <span className="text-slate">{i.category}: </span>
                    {i.text}
                  </div>
                  <div className="text-[12px] text-slate">
                    {fmtStamp(i.at)}
                    {i.resolved ? ` · resolved ${fmtStamp(i.resolved.at)}: ${i.resolved.note}` : ""}
                  </div>
                </div>
                {/* the exhibitor sees whether someone is on it, not the team's service clock */}
                <Tag s={st === "Resolved" ? "Resolved" : i.assignee ? "Someone is on it" : "Reported"} />
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select className="input" aria-label="What kind of problem" value={f.category} onChange={(x) => setF({ ...f, category: x.target.value as IssueCategory })}>
          {ISSUE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className="input" aria-label="How urgent" value={f.priority} onChange={(x) => setF({ ...f, priority: x.target.value as IssuePriority })}>
          {ISSUE_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p === "Urgent" ? "Urgent: we cannot work" : p === "Normal" ? "Normal" : "Low: when you can"}
            </option>
          ))}
        </select>
        <textarea className="input min-h-16 sm:col-span-2" aria-label="What is wrong" value={f.text} placeholder="What is wrong, and where on the stand" onChange={(x) => setF({ ...f, text: x.target.value })} />
      </div>
      {tried && <Problems list={problems} />}
      <button
        className="btn-secondary btn-sm mt-2"
        onClick={() => {
          setTried(true);
          if (problems.length) return;
          dispatch({ type: "expo/issue", id: `is_${Date.now().toString(36)}`, exhibitorId: e.id, category: f.category, priority: f.priority, text: f.text, as: "exhibitor" });
          setF({ ...f, text: "" });
          setTried(false);
        }}
      >
        Report it
      </button>
    </Card>
  );
}

function DismantleCard({ e }: { e: Exhibitor }) {
  const { expo, cfg, now, dispatch } = usePortal(e);
  const d = expo.dismantles.find((x) => x.exhibitorId === e.id);
  const open = dismantleOpen(cfg, now);
  const out = rentalsOut(expo, e.id);
  return (
    <Card title="Dismantling" aside={<Tag s={dismantleState(d)} />}>
      {!open ? (
        <p className="text-[14px] text-slate">
          Dismantling runs {win(cfg.dismantle)}. Book a collection slot above; rented items are collected from your stand. Nothing leaves the hall before then.
        </p>
      ) : (
        <>
          <ul className="text-[14px] space-y-2">
            {(
              [
                ["cleared", "Our stand is cleared and the space is empty"],
                ["returned", out.length ? `Rentals are ready for collection (${out.length} ${out.length === 1 ? "order" : "orders"} out)` : "Nothing rented is left on the stand"],
              ] as const
            ).map(([step, label]) => (
              <li key={step} className="flex items-center justify-between gap-3">
                <span>{label}</span>
                {d?.[step] ? (
                  <span className="text-[13px] text-ok">Done {fmtStamp(d[step]!.at)}</span>
                ) : d?.signedOff ? null : (
                  <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "expo/dismantleTick", exhibitorId: e.id, step, as: "exhibitor" })}>
                    Mark done
                  </button>
                )}
              </li>
            ))}
          </ul>
          {d?.signedOff && (
            <p className="mt-3 text-[14px]">
              Signed off by the floor team {fmtStamp(d.signedOff.at)}
              {d.signedOff.damage ? `, with damage noted: ${d.signedOff.damage}` : ", with no damage"}.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
