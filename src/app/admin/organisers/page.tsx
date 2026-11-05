"use client";

import Link from "next/link";
import { PageHeader, Section, Tone } from "@/components/ui";
import { money, payoutsFor, useStore } from "@/lib/store";

export default function AdminOrganisers() {
  const { state } = useStore();
  return (
    <>
      <PageHeader title="Organisers" kicker="Rate cards are agreed per client and applied when each event is approved." actions={<button className="btn-primary">Onboard organiser</button>} />
      <Section title={`${state.organisers.length} organisers`} flush>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Organiser</th>
              <th className="th">KYC</th>
              <th className="th">Payout account</th>
              <th className="th-r">Licence</th>
              <th className="th-r">Commission</th>
              <th className="th-r">Events</th>
              <th className="th-r">Gross to date</th>
            </tr>
          </thead>
          <tbody>
            {state.organisers.map((o) => {
              const gross = payoutsFor(state, o.id).reduce((a, p) => a + p.gross, 0);
              return (
                <tr key={o.id} className="hover:bg-paper">
                  <td className="td">
                    <Link href={`/admin/organisers/${o.id}`} className="font-medium hover:underline">
                      {o.name}
                    </Link>
                    <div className="text-[13px] text-slate font-mono">{o.registrationNo}</div>
                  </td>
                  <td className="td">
                    <Tone tone={o.kycStatus === "Verified" ? "ok" : "warn"}>{o.kycStatus}</Tone>
                  </td>
                  <td className="td text-slate">{o.payoutAccount}</td>
                  <td className="td-r">{money(o.licenceFee)}</td>
                  <td className="td-r">{o.commissionPct}%</td>
                  <td className="td-r">{state.events.filter((e) => e.organiserId === o.id).length}</td>
                  <td className="td-r">{gross ? money(gross) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </>
  );
}
