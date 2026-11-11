"use client";

import { useState } from "react";
import { PageHeader, Section, Tone } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function OrganiserKyc() {
  const { state, dispatch } = useStore();
  const org = state.organisers[0];
  const [signing, setSigning] = useState(false);
  const [signer, setSigner] = useState("");
  const signed = org.dpaSigned;
  const items = [
    ["Registered business name", org.name, true],
    ["Registration number", org.registrationNo, true],
    ["KRA PIN", org.kraPin, true],
    ["Physical address", "Westlands, Nairobi", true],
    ["Signatory name and ID scan", "2 files uploaded", true],
    ["Payout account", org.payoutAccount, true],
    ["Signed platform agreement", "Signed 12 Oct 2026", true],
    ["Data processing agreement", signed ? `Signed by ${signed.by}, ${signed.at}` : "Awaiting your signature", !!signed],
  ] as const;

  return (
    <div className="max-w-3xl">
      <PageHeader title="KYC" badge={<Tone tone={org.kycStatus === "Verified" ? "ok" : "warn"}>{org.kycStatus}</Tone>} kicker="Completed once and reused for every event. Algotech may ask for a refresh." />
      <Section title="Documents" flush>
        <ul>
          {items.map(([k, v, done]) => (
            <li key={k} className="px-5 py-3 border-b border-line last:border-0 text-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">{k}</div>
                  <div className="text-[13px] text-slate">{v}</div>
                </div>
                {done ? <Tone tone="ok">Verified</Tone> : !signing ? <button className="btn-primary" onClick={() => setSigning(true)}>Sign now</button> : null}
              </div>
              {!done && signing && (
                <form
                  className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end rounded-md bg-paper p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!signer.trim()) return;
                    dispatch({ type: "signDpa", organiserId: org.id, by: signer.trim() });
                    setSigning(false);
                  }}
                >
                  <div>
                    <label className="label" htmlFor="dpa-name">Type your full name to sign</label>
                    <input id="dpa-name" className="input" required value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="As on your ID" />
                    <p className="mt-1 text-[12px] text-slate">The agreement sets how delegate data is held and deleted. Signing is timestamped and the signed copy is emailed to you.</p>
                  </div>
                  <button className="btn-primary" type="submit">Sign the agreement</button>
                  <button className="btn-quiet" type="button" onClick={() => setSigning(false)}>Cancel</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
