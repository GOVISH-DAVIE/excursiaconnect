"use client";

import Link from "next/link";
import { EventPill, PageHeader, Section, fmtDate } from "@/components/ui";
import { money, useStore } from "@/lib/store";

export default function OrganiserEvents() {
  const { state, dispatch } = useStore();
  const org = state.organisers[0];
  const events = state.events.filter((e) => e.organiserId === org.id);

  return (
    <>
      <PageHeader
        title="Events"
        kicker={
          <>
            KYC <span className={org.kycStatus === "Verified" ? "text-ok font-medium" : "text-warn font-medium"}>{org.kycStatus}</span>, payouts to {org.payoutAccount}
          </>
        }
        actions={<button className="btn-primary">New event</button>}
      />

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
                    {e.state === "Draft" && (
                      <button className="btn-secondary" onClick={() => dispatch({ type: "setEventState", eventId: e.id, state: "Submitted" })}>
                        Submit for approval
                      </button>
                    )}
                    {e.state === "Approved" && (
                      <button className="btn-primary" onClick={() => dispatch({ type: "setEventState", eventId: e.id, state: "Live" })}>
                        Open registration
                      </button>
                    )}
                    {e.state === "Live" && (
                      <Link href={`/e/${e.slug}`} target="_blank" className="btn-quiet">
                        Public page
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <div className="mt-6 grid gap-4 md:grid-cols-5 text-sm">
        {["Build the event in Draft", "Submit; KYC must be verified", "Algotech fixes commission and staffing", "Approved", "You open registration"].map((s, i) => (
          <div key={s} className="surface p-4">
            <div className="text-[13px] text-slate">Step {i + 1} of 5</div>
            <div className="font-medium mt-1">{s}</div>
          </div>
        ))}
      </div>
    </>
  );
}
