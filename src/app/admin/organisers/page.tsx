"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader, Section, Tone } from "@/components/ui";
import { money, payoutsFor, useStore } from "@/lib/store";

export default function AdminOrganisers() {
  const { state, dispatch } = useStore();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", registrationNo: "", kraPin: "", licenceFee: 60000, commissionPct: 5 });

  function onboard(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    dispatch({
      type: "addOrganiser",
      organiser: { id: `org_${Date.now().toString(36)}`, name: form.name, kycStatus: "Pending", kraPin: form.kraPin, registrationNo: form.registrationNo, payoutAccount: "Not set", licenceFee: form.licenceFee, commissionPct: form.commissionPct },
    });
    setAdding(false);
    setForm({ name: "", email: "", registrationNo: "", kraPin: "", licenceFee: 60000, commissionPct: 5 });
  }

  return (
    <>
      <PageHeader title="Organisers" kicker="Rate cards are agreed per client and applied when each event is approved." actions={<button className="btn btn-primary" onClick={() => setAdding(!adding)}>Onboard organiser</button>} />
      {adding && (
        <Section title="Onboard an organiser" className="mb-5" action={<span className="text-[13px] text-slate">After a signed client agreement (PA-1). The owner gets a login and a KYC pack request.</span>}>
          <form className="grid gap-4 sm:grid-cols-6" onSubmit={onboard}>
            <div className="sm:col-span-3">
              <label className="label" htmlFor="o-name">Registered business name</label>
              <input id="o-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="sm:col-span-3">
              <label className="label" htmlFor="o-email">Owner&apos;s email</label>
              <input id="o-email" type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="o-reg">Registration number</label>
              <input id="o-reg" className="input" value={form.registrationNo} onChange={(e) => setForm({ ...form, registrationNo: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="o-pin">KRA PIN</label>
              <input id="o-pin" className="input" value={form.kraPin} onChange={(e) => setForm({ ...form, kraPin: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="o-lic">Licence per event (KES)</label>
              <input id="o-lic" type="number" className="input" value={form.licenceFee} onChange={(e) => setForm({ ...form, licenceFee: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label" htmlFor="o-com">Commission %</label>
              <input id="o-com" type="number" step="0.5" className="input" value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: Number(e.target.value) })} />
            </div>
            <div className="sm:col-span-6 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create account and request KYC</button>
            </div>
          </form>
        </Section>
      )}
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
                    <div className="text-[13px] text-slate font-mono">{o.registrationNo || "Registration number pending"}</div>
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
