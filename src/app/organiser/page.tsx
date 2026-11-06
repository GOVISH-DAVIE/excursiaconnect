"use client";

import Link from "next/link";
import { useState } from "react";
import { EventPill, PageHeader, Section, fmtDate } from "@/components/ui";
import { money, useStore } from "@/lib/store";

export default function OrganiserEvents() {
  const { state, dispatch } = useStore();
  const org = state.organisers[0];
  const events = state.events.filter((e) => e.organiserId === org.id);
  const verified = org.kycStatus === "Verified";
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", venue: "", city: "Nairobi", startDate: "", endDate: "", expected: 300, currency: "KES" });

  // OR-2: a draft, visible only to the organiser
  function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.startDate) return;
    const start = new Date(form.startDate);
    const end = new Date(form.endDate || form.startDate);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const id = `ev_${Date.now().toString(36)}`;
    dispatch({
      type: "addEvent",
      event: {
        id,
        slug: form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        organiserId: org.id,
        name: form.name,
        tagline: "",
        venue: form.venue,
        city: form.city,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        days,
        state: "Draft",
        commissionPct: org.commissionPct,
        oneOffFee: 0,
        licenceFee: org.licenceFee,
        gatewayFeesBorneBy: "Algotech",
        staffCount: 0,
        stations: 0,
        expectedAttendance: form.expected,
        brand: { primary: "#0F4C81", logoText: form.name.slice(0, 4).toUpperCase() },
        registrationsByDay: [],
        history: [{ at: new Date().toISOString().slice(0, 16).replace("T", " "), what: "Draft created" }],
      },
    });
    setCreating(false);
    setForm({ name: "", venue: "", city: "Nairobi", startDate: "", endDate: "", expected: 300, currency: "KES" });
  }

  return (
    <>
      <PageHeader
        title="Events"
        kicker={
          <>
            KYC <span className={verified ? "text-ok font-medium" : "text-warn font-medium"}>{org.kycStatus}</span>, payouts to {org.payoutAccount}
          </>
        }
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(!creating)}>
            New event
          </button>
        }
      />

      {creating && (
        <Section title="New event" className="mb-5" action={<span className="text-[13px] text-slate">Visible only to you until Algotech approves it.</span>}>
          <form className="grid gap-4 sm:grid-cols-6" onSubmit={create}>
            <div className="sm:col-span-3">
              <label className="label" htmlFor="ev-name">Name</label>
              <input id="ev-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ev-venue">Venue</label>
              <input id="ev-venue" className="input" required value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="ev-city">City</label>
              <input id="ev-city" className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ev-start">First day</label>
              <input id="ev-start" type="date" className="input" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ev-end">Last day</label>
              <input id="ev-end" type="date" className="input" value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="ev-exp">Expected attendance</label>
              <input id="ev-exp" type="number" min={1} className="input" value={form.expected} onChange={(e) => setForm({ ...form, expected: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label" htmlFor="ev-cur">Currency</label>
              <select id="ev-cur" className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option>KES</option>
                <option>USD</option>
              </select>
            </div>
            <div className="sm:col-span-6 flex items-center justify-between gap-3">
              <span className="text-[13px] text-slate">Time zone Africa/Nairobi. Tiers, the form, categories and branding come next, inside the event.</span>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create draft</button>
              </div>
            </div>
          </form>
        </Section>
      )}

      {!verified && (
        <div className="mb-5 rounded-lg bg-warn-50 px-4 py-3 text-[14px] text-warn">
          Submission is blocked until your KYC is verified. <Link href="/organiser/kyc" className="font-medium underline underline-offset-4">Complete KYC</Link>
        </div>
      )}

      <Section title="All events" flush>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Event</th>
              <th className="th">Dates</th>
              <th className="th">Status</th>
              <th className="th-r">Confirmed</th>
              <th className="th-r">Checked in</th>
              <th className="th-r">Gross</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const ds = state.delegates.filter((d) => d.eventId === e.id);
              const confirmed = ds.filter((d) => d.status === "Confirmed" || d.status === "Checked in").length;
              const checked = ds.filter((d) => d.checkIns.length > 0).length;
              const gross = state.orders.filter((o) => o.eventId === e.id && o.status === "paid").reduce((a, o) => a + o.gross, 0);
              const canSubmit = e.state === "Draft" || e.state === "Changes requested";
              return (
                <tr key={e.id} className="hover:bg-paper">
                  <td className="td">
                    <Link href={`/organiser/events/${e.id}`} className="flex items-center gap-3 group">
                      <span className="h-9 w-9 rounded-md text-white grid place-items-center font-medium text-[13px] shrink-0" style={{ background: e.brand.primary }}>
                        {e.brand.logoText.slice(0, 2)}
                      </span>
                      <span>
                        <span className="font-medium group-hover:underline">{e.name}</span>
                        <span className="block text-[13px] text-slate">
                          {e.venue}, {e.city}
                        </span>
                      </span>
                    </Link>
                    {e.reviewNote && e.state === "Changes requested" && <p className="mt-2 ml-12 rounded bg-coral-50 px-2 py-1 text-[13px] text-coral-600">Algotech: {e.reviewNote}</p>}
                    {e.reviewNote && e.state === "Rejected" && <p className="mt-2 ml-12 rounded bg-bad-50 px-2 py-1 text-[13px] text-bad">Rejected: {e.reviewNote}</p>}
                    {e.reviewNote && e.state === "Suspended" && <p className="mt-2 ml-12 rounded bg-bad-50 px-2 py-1 text-[13px] text-bad">Suspended by Algotech: {e.reviewNote}. Registration and scanning are paused; payouts held.</p>}
                    {e.reviewNote && e.state === "Under review" && e.stateBefore === "Live" && <p className="mt-2 ml-12 rounded bg-warn-50 px-2 py-1 text-[13px] text-warn">Back with Algotech: {e.reviewNote}</p>}
                  </td>
                  <td className="td text-slate whitespace-nowrap">
                    {fmtDate(e.startDate, { day: "numeric", month: "short" })} to {fmtDate(e.endDate)}
                  </td>
                  <td className="td">
                    <EventPill state={e.state} />
                  </td>
                  <td className="td-r">{confirmed || "–"}</td>
                  <td className="td-r">{checked || "–"}</td>
                  <td className="td-r">{gross ? money(gross) : "–"}</td>
                  <td className="td text-right whitespace-nowrap">
                    {canSubmit && (
                      <button className="btn-secondary btn-sm" disabled={!verified} title={verified ? undefined : "KYC must be verified first"} onClick={() => dispatch({ type: "setEventState", eventId: e.id, state: "Submitted" })}>
                        {e.state === "Draft" ? "Submit for approval" : "Resubmit"}
                      </button>
                    )}
                    {(e.state === "Submitted" || e.state === "Under review") && <span className="text-[13px] text-slate">With Algotech, 2 working days</span>}
                    {e.state === "Approved" && (
                      <button className="btn btn-primary btn-sm" onClick={() => dispatch({ type: "setEventState", eventId: e.id, state: "Live" })}>
                        Open registration
                      </button>
                    )}
                    {e.state === "Live" && (
                      <Link href={`/e/${e.slug}`} target="_blank" className="btn-quiet">
                        Public page
                      </Link>
                    )}
                    {e.state === "Closed" && (
                      <Link href={`/organiser/events/${e.id}`} className="btn-quiet">
                        Report
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <div className="mt-6 grid gap-4 md:grid-cols-5 text-[14px]">
        {["Build the event in Draft", "Submit; KYC must be verified", "Algotech fixes commission and staffing", "Approved", "You open registration"].map((s, i) => (
          <div key={s} className="border-t border-line-strong pt-3">
            <div className="text-[13px] text-slate">Step {i + 1} of 5</div>
            <div className="font-medium mt-1">{s}</div>
          </div>
        ))}
      </div>
    </>
  );
}
