"use client";

import { PageHeader, Section, Tone } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function OrganiserKyc() {
  const { state } = useStore();
  const org = state.organisers[0];
  const items = [
    ["Registered business name", org.name, true],
    ["Registration number", org.registrationNo, true],
    ["KRA PIN", org.kraPin, true],
    ["Physical address", "Westlands, Nairobi", true],
    ["Signatory name and ID scan", "2 files uploaded", true],
    ["Payout account", org.payoutAccount, true],
    ["Signed platform agreement", "Signed 12 Oct 2026", true],
    ["Data processing agreement", "Awaiting your signature", false],
  ] as const;

  return (
    <div className="max-w-3xl">
      <PageHeader title="KYC" badge={<Tone tone={org.kycStatus === "Verified" ? "ok" : "warn"}>{org.kycStatus}</Tone>} kicker="Completed once and reused for every event. Algotech may ask for a refresh." />
      <Section title="Documents" flush>
        <ul>
          {items.map(([k, v, done]) => (
            <li key={k} className="flex items-center justify-between px-5 py-3 border-b border-line last:border-0 text-sm">
              <div>
                <div className="font-medium">{k}</div>
                <div className="text-[13px] text-slate">{v}</div>
              </div>
              {done ? <Tone tone="ok">Verified</Tone> : <button className="btn-primary">Sign now</button>}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
