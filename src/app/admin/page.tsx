"use client";

import { useState } from "react";
import Link from "next/link";
import { Empty, EventPill, PageHeader, Section, Stat } from "@/components/ui";
import { money, useStore } from "@/lib/store";
import type { EventRecord } from "@/lib/types";

export default function AdminQueue() {
  const { state, dispatch } = useStore();
  const [openId, setOpenId] = useState<string | null>(state.events.find((e) => e.state === "Submitted")?.id ?? null);
  const open = state.events.find((e) => e.id === openId) ?? null;
  const org = open ? state.organisers.find((o) => o.id === open.organiserId) : null;
  const [form, setForm] = useState<Partial<EventRecord>>({});
  const [note, setNote] = useState("");

  const queue = state.events.filter((e) => ["Submitted", "Under review", "Changes requested"].includes(e.state));
  const live = state.events.filter((e) => e.state === "Live");
  const gross = state.orders.filter((o) => o.status === "paid").reduce((a, o) => a + o.gross, 0);
  const commission = state.orders.filter((o) => o.status === "paid").reduce((a, o) => a + o.commission, 0);

  const f = <K extends keyof EventRecord>(k: K) => (form[k] ?? open?.[k]) as EventRecord[K];
  const setF = (k: keyof EventRecord, v: unknown) => setForm({ ...form, [k]: v });

  return (
    <>
      <PageHeader title="Approval queue" kicker="Nothing goes live, and no money moves, without an approval record." />
      <div className="grid gap-4 sm:grid-cols-4 mb-5">
        <Stat label="Awaiting review" value={queue.length} tone={queue.length ? "warn" : undefined} />
        <Stat label="Live events" value={live.length} tone="ok" />
        <Stat label="Gross processed" value={money(gross)} href="/admin/finance" />
        <Stat label="Commission earned" value={money(commission)} tone="coral" href="/admin/finance" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Section title="Events" flush>
          <ul>
            {[...queue, ...state.events.filter((e) => !queue.includes(e))].map((e) => {
              const o = state.organisers.find((x) => x.id === e.organiserId);
              return (
                <li key={e.id}>
                  <button onClick={() => { setOpenId(e.id); setForm({}); setNote(""); }} className={`w-full text-left px-5 py-3 border-b border-line border-l-[3px] hover:bg-paper ${openId === e.id ? "border-l-coral bg-paper" : "border-l-transparent"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm leading-tight">{e.name}</span>
                      <EventPill state={e.state} />
                    </div>
                    <div className="mt-1 text-[13px] text-slate">
                      {o?.name}, KYC <span className={o?.kycStatus === "Verified" ? "text-ok" : "text-warn"}>{o?.kycStatus}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>

        {open && org ? (
          <div className="space-y-4">
            <Section title={`Review: ${open.name}`} action={<EventPill state={open.state} />}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="h2 mb-2">Event</div>
                  <dl className="text-sm space-y-1">
                    {[
                      ["Organiser", org.name],
                      ["Dates", `${open.startDate} → ${open.endDate} (${open.days} days)`],
                      ["Venue", `${open.venue}, ${open.city}`],
                      ["Expected attendance", String(open.expectedAttendance)],
                      ["Paid tiers", state.tiers.filter((t) => t.eventId === open.id && t.price > 0).map((t) => `${t.name} ${money(t.price, t.currency)}`).join(", ") || "Not set yet"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3 py-1 border-b border-line last:border-0">
                        <dt className="text-slate">{k}</dt>
                        <dd className="text-right">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div>
                  <div className="h2 mb-2 flex items-center justify-between">
                    <span>KYC pack</span>
                    <Link href={`/admin/organisers/${org.id}`} className="text-[13px] font-medium text-coral">
                      Open organiser
                    </Link>
                  </div>
                  <ul className="text-sm space-y-1">
                    {[
                      ["Registration no.", org.registrationNo],
                      ["KRA PIN", org.kraPin],
                      ["Payout account", org.payoutAccount],
                      ["Signatory ID scan", "View"],
                      ["Platform agreement", "Signed"],
                    ].map(([k, v]) => (
                      <li key={k} className="flex justify-between py-1 border-b border-line last:border-0">
                        <span className="text-slate">{k}</span>
                        <span>{v}</span>
                      </li>
                    ))}
                  </ul>
                  <div className={`mt-3 rounded-md p-2.5 text-[13px] flex items-center justify-between gap-2 ${org.kycStatus === "Verified" ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn"}`}>
                    <span>
                      KYC {org.kycStatus}
                      {org.kycStatus !== "Verified" && " — verify before approving"}
                    </span>
                    {org.kycStatus !== "Verified" && (
                      <button className="btn-secondary py-1 px-2.5 text-[13px]" onClick={() => dispatch({ type: "verifyKyc", organiserId: org.id })}>
                        Mark KYC verified
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Pricing and staffing for this event">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label">Commission %</label>
                  <input type="number" className="input" value={f("commissionPct")} onChange={(e) => setF("commissionPct", Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">One-off fee (KES)</label>
                  <input type="number" className="input" value={f("oneOffFee")} onChange={(e) => setF("oneOffFee", Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">Licence fee (KES)</label>
                  <input type="number" className="input" value={f("licenceFee")} onChange={(e) => setF("licenceFee", Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">Gateway fees borne by</label>
                  <select className="input" value={f("gatewayFeesBorneBy")} onChange={(e) => setF("gatewayFeesBorneBy", e.target.value)}>
                    <option>Algotech</option>
                    <option>Organiser</option>
                  </select>
                </div>
                <div>
                  <label className="label">On-site staff (per day)</label>
                  <input type="number" className="input" value={f("staffCount")} onChange={(e) => setF("staffCount", Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">Accreditation stations</label>
                  <input type="number" className="input" value={f("stations")} onChange={(e) => setF("stations", Number(e.target.value))} />
                </div>
                <div className="sm:col-span-3">
                  <label className="label">Note to organiser</label>
                  <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown to the organiser on Changes requested or Rejected" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 justify-end">
                {open.state !== "Live" && open.state !== "Closed" && (
                  <>
                    <button className="btn-secondary text-bad" onClick={() => dispatch({ type: "setEventState", eventId: open.id, state: "Rejected", note })}>
                      Reject
                    </button>
                    <button className="btn-secondary" onClick={() => dispatch({ type: "setEventState", eventId: open.id, state: "Changes requested", note })}>
                      Request changes
                    </button>
                    <button className="btn-secondary" onClick={() => dispatch({ type: "setEventState", eventId: open.id, state: "Under review" })}>
                      Mark under review
                    </button>
                    <button className="btn-primary" disabled={org.kycStatus !== "Verified"} onClick={() => dispatch({ type: "setEventState", eventId: open.id, state: "Approved", pricing: form })}>
                      Approve with these terms
                    </button>
                  </>
                )}
                {open.state === "Live" && (
                  <button className="btn-secondary text-bad" onClick={() => dispatch({ type: "setEventState", eventId: open.id, state: "Rejected", note: "Suspended by Algotech" })}>
                    Suspend event
                  </button>
                )}
              </div>
              <p className="mt-2 text-right text-[13px] text-slate">Approval is logged with your name and time; the terms become the event's pricing and staffing record.</p>
            </Section>
          </div>
        ) : (
          <Empty>Select an event to review.</Empty>
        )}
      </div>
    </>
  );
}
