"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Empty, PageHeader, Section, Tabs } from "@/components/ui";
import { brandingState, dismantleOpen, orderStepProblems, type BrandingState } from "@/lib/expo/onsite";
import type { Branding, StandOrder } from "@/lib/expo/types";
import { fmtStamp } from "@/lib/time";
import { Refusal } from "@/app/dealroom/bits";
import { InvoicePill, ScannerWork, StatePill, useExpo, useStands } from "../bits";

const allTabs = ["Branding", "Orders", "Requirements"] as const;
type Tab = (typeof allTabs)[number];
const B_STATES: BrandingState[] = ["Waiting for approval", "Returned", "Not sent", "Approved"];

export default function ServicesView() {
  // a link with other filters starts the view afresh
  const q = useSearchParams();
  return <Services key={q.toString()} />;
}

/** POR-3 to POR-6 and LOG-4 from the team's side: branding to approve, orders to deliver, needs to plan for. */
function Services() {
  const { expo, cfg, can } = useExpo();
  const q = useSearchParams();
  const stands = useStands();
  const asked = allTabs.find((t) => t === q.get("tab"));
  const [tab, setTab] = useState<Tab>(asked ?? "Branding");
  if (!cfg) return null;
  if (!can("expo.manage") && !can("expo.floor")) return <Refusal title="Stand services are for the exhibition team"><ScannerWork /></Refusal>;
  const waiting = stands.filter((s) => brandingState(expo.branding.find((b) => b.exhibitorId === s.e.id)) === "Waiting for approval").length;
  const toDeliver = expo.orders.filter((o) => o.eventId === cfg.eventId && o.state === "Ordered").length;
  const unseen = expo.requirements.filter((r) => r.eventId === cfg.eventId && !r.ack).length;
  return (
    <>
      <PageHeader title="Stand services" kicker="Branding to approve, equipment to deliver and collect, and what each stand needs from the floor team." />
      <Tabs tabs={allTabs} value={tab} onChange={setTab} counts={{ Branding: waiting, Orders: toDeliver, Requirements: unseen }} />
      {tab === "Branding" && <BrandingQueue />}
      {tab === "Orders" && <Fulfilment />}
      {tab === "Requirements" && <Requirements />}
    </>
  );
}

function BrandingQueue() {
  const { expo, cfg, can } = useExpo();
  const q = useSearchParams();
  const stands = useStands();
  const rows = stands.map((s) => ({ ...s, b: expo.branding.find((x) => x.exhibitorId === s.e.id) }));
  const asked = (q.get("state") ?? "").split(",").filter((x): x is BrandingState => B_STATES.includes(x as BrandingState));
  const [pick, setPick] = useState<BrandingState[]>(asked.length ? asked : ["Waiting for approval", "Returned", "Not sent"]);
  const shown = rows.filter((r) => pick.includes(brandingState(r.b))).sort((a, b) => B_STATES.indexOf(brandingState(a.b)) - B_STATES.indexOf(brandingState(b.b)));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        {B_STATES.map((s) => {
          const n = rows.filter((r) => brandingState(r.b) === s).length;
          const on = pick.includes(s);
          return (
            <button key={s} aria-pressed={on} onClick={() => setPick(on ? pick.filter((x) => x !== s) : [...pick, s])} className={`pill ${on ? "bg-ink text-white" : "bg-paper-200 text-slate"}`}>
              {s} {n}
            </button>
          );
        })}
        <span className="text-slate">Due {fmtStamp(cfg!.brandingDeadline, false)}</span>
      </div>
      <Section title={`${shown.length} ${shown.length === 1 ? "stand" : "stands"}`} flush>
        {shown.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>Nothing here with these filters.</Empty>
          </div>
        ) : (
          <ul>
            {shown.map((r) => (
              <li key={r.e.id} className="px-5 py-3 border-t border-line">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/exhibition/exhibitors/${r.e.id}`} className="font-medium hover:underline">
                      {r.e.name}
                    </Link>
                    <span className="text-[13px] text-slate"> · {r.booths.map((b) => b.code).join(", ")}</span>
                  </div>
                  <StatePill s={brandingState(r.b)} />
                </div>
                {r.b ? <BrandingRow b={r.b} decide={can("expo.manage")} /> : <p className="mt-1 text-[13px] text-slate">Nothing sent yet.</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function BrandingRow({ b, decide }: { b: Branding; decide: boolean }) {
  const { dispatch } = useExpo();
  const [noteText, setNote] = useState("");
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,260px)_1fr] sm:items-start">
      <div className="rounded-md bg-ink px-3 py-2 text-center text-[13px] font-medium tracking-[0.12em] text-white">{b.fascia}</div>
      <div className="text-[13px] text-slate">
        Logo {b.logo?.name ?? "missing"}; {b.artwork.length} artwork {b.artwork.length === 1 ? "file" : "files"}
        {b.artwork.length ? ` (${b.artwork.map((a) => a.name).join(", ")})` : ""}. Sent {fmtStamp(b.submittedAt)}
        {b.late ? ", after the deadline" : ""}.
        {b.decision && (
          <>
            {" "}
            {b.decision.state} {fmtStamp(b.decision.at)}
            {b.decision.note ? `: ${b.decision.note}` : ""}.
          </>
        )}
      </div>
      {decide && !b.decision && (
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <input className="input h-9 flex-1 min-w-48 text-[13px]" placeholder="What to change, needed to return it" value={noteText} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary btn-sm" onClick={() => dispatch({ type: "expo/brandingDecide", exhibitorId: b.exhibitorId, decision: "Approved", note: noteText })}>
            Approve for print
          </button>
          <button className="btn-secondary btn-sm" disabled={!noteText.trim()} onClick={() => dispatch({ type: "expo/brandingDecide", exhibitorId: b.exhibitorId, decision: "Returned", note: noteText })}>
            Return it
          </button>
        </div>
      )}
    </div>
  );
}

const COLUMNS: StandOrder["state"][] = ["Ordered", "Delivered", "Collected"];

/** LOG-4: each order moves from ordered to delivered to collected; the reducer refuses a step out of turn. */
function Fulfilment() {
  const { expo, cfg, now, can, dispatch } = useExpo();
  const orders = expo.orders.filter((o) => o.eventId === cfg!.eventId);
  const item = (id: string) => cfg!.catalogue.find((c) => c.id === id)!;
  // what is still to go out to the stands, item by item
  const pending = new Map<string, number>();
  for (const o of orders.filter((x) => x.state === "Ordered")) for (const l of o.lines) pending.set(l.itemId, (pending.get(l.itemId) ?? 0) + l.qty);
  return (
    <>
      {pending.size > 0 && (
        <p className="mb-3 text-[14px]">
          <span className="text-slate">Still to deliver: </span>
          {[...pending].map(([id, n]) => `${n} × ${item(id).name}`).join(", ")}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.state === col).sort((a, b) => a.at.localeCompare(b.at));
          // rentals wait for dismantling: one note for the column instead of a refused button on every card
          const waiting = col === "Delivered" && !dismantleOpen(cfg!, now);
          const next = col === "Ordered" ? "Delivered" : col === "Delivered" && !waiting ? "Collected" : undefined;
          return (
            <Section key={col} title={`${col}, ${list.length}`} flush>
              {waiting && list.length > 0 && <p className="px-5 pb-3 text-[13px] text-slate">Collected from {fmtStamp(cfg!.dismantle.from)}, when dismantling starts.</p>}
              {list.length === 0 ? (
                <p className="px-5 pb-4 text-[13px] text-slate">None.</p>
              ) : (
                <ul>
                  {list.map((o) => {
                    const e = expo.exhibitors.find((x) => x.id === o.exhibitorId)!;
                    const inv = expo.invoices.find((i) => i.id === o.invoiceId);
                    const booth = expo.booths.find((b) => expo.bookings.some((k) => k.exhibitorId === e.id && k.contract && !k.cancelled && k.boothIds.includes(b.id)));
                    const blocked = next ? orderStepProblems(cfg!, o, next, now) : [];
                    return (
                      <li key={o.id} className="px-5 py-3 border-t border-line text-[13px]">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/exhibition/exhibitors/${e.id}`} className="font-medium text-[14px] hover:underline">
                            {e.name}
                          </Link>
                          <span className="text-slate">{booth?.code}</span>
                        </div>
                        <div className="mt-0.5">{o.lines.map((l) => `${l.qty} × ${item(l.itemId).name}`).join(", ")}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-slate">
                          {fmtStamp(o.at)}
                          {o.late && <StatePill s="Late" />}
                          {inv && <InvoicePill inv={inv} />}
                        </div>
                        {next && can("expo.floor") && (
                          <div className="mt-2">
                            <button className="btn-secondary btn-sm" disabled={blocked.length > 0} onClick={() => dispatch({ type: "expo/orderState", orderId: o.id, state: next })}>
                              Mark {next.toLowerCase()}
                            </button>
                            {blocked.length > 0 && <div className="mt-1 text-[12px] text-slate">{blocked[0]}.</div>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          );
        })}
      </div>
    </>
  );
}

function Requirements() {
  const { expo, cfg, can, dispatch, state } = useExpo();
  const list = expo.requirements.filter((r) => r.eventId === cfg!.eventId).sort((a, b) => Number(!!a.ack) - Number(!!b.ack) || b.at.localeCompare(a.at));
  return (
    <Section title={`${list.length} requirements`} flush>
      {list.length === 0 ? (
        <div className="px-5 pb-5">
          <Empty>No special requirements yet.</Empty>
        </div>
      ) : (
        <ul>
          {list.map((r) => {
            const e = expo.exhibitors.find((x) => x.id === r.exhibitorId)!;
            return (
              <li key={r.id} className="px-5 py-3 border-t border-line flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 text-[14px]">
                  <Link href={`/exhibition/exhibitors/${e.id}`} className="font-medium hover:underline">
                    {e.name}
                  </Link>
                  <span className="text-slate"> · {r.kind}</span>
                  <div>{r.text}</div>
                  <div className="text-[12px] text-slate">
                    Sent {fmtStamp(r.at)}
                    {r.ack ? `; seen by ${state.team.find((m) => m.id === r.ack!.by)?.name ?? "the team"} ${fmtStamp(r.ack.at)}` : ""}
                  </div>
                </div>
                {r.ack ? (
                  <StatePill s="Seen" />
                ) : can("expo.floor") ? (
                  <button className="btn-secondary btn-sm" onClick={() => dispatch({ type: "expo/requirementAck", id: r.id })}>
                    Mark seen
                  </button>
                ) : (
                  <StatePill s="New" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
