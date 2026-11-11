"use client";

/**
 * Algotech checks an organiser's KYC: the details, each document opened through a short link (audited), and the
 * signed agreement; then verifies it, or returns it with what to fix.
 */
import Link from "next/link";
import { useState } from "react";
import type { KycDecision } from "@excursia/contracts/onboarding";
import { KV, PageHeader, Section } from "@/components/ui";
import { onboardingApi } from "@/features/onboarding/api";
import { useOpenKycDoc, useOrganiser, useOrganiserChange } from "@/features/onboarding/hooks/use-onboarding";
import { Failed, Gaps, History, KycTone, Loading, Signed, StateTone } from "../../../bits";

function KycReview({ id }: { id: string }) {
  const org = useOrganiser(id);
  const open = useOpenKycDoc(id);
  const decide = useOrganiserChange(id, (input: KycDecision) => onboardingApi.decideKyc(id, input));
  const [note, setNote] = useState("");
  if (org.isPending) return <Loading />;
  if (org.isError) return <Failed error={org.error} />;
  const o = org.data;
  return (
    <>
      <PageHeader title={o.name} badge={<KycTone status={o.kycStatus} />} crumbs={[{ href: "/team/admin", label: "Organisers and events" }, { label: o.name }]} kicker={`Owner ${o.owner?.name ?? "—"} (${o.owner?.email ?? "—"}) · ${o.country}`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {o.kycStatus === "Pending" && (
            <Section title="Your decision">
              <div className="space-y-3">
                <p className="text-[14px] text-slate">Open each document and check it against the details. A return tells the organiser what to fix.</p>
                <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs fixing (needed to return it)" aria-label="Note to the organiser" />
                <Failed error={decide.error} />
                <div className="flex flex-wrap justify-end gap-2">
                  <button className="btn-secondary text-bad" disabled={!note.trim() || decide.isPending} onClick={() => decide.mutate({ verdict: "Returned", note })}>
                    Return with this note
                  </button>
                  <button className="btn-primary" disabled={decide.isPending} onClick={() => decide.mutate({ verdict: "Verified", note: "" })}>
                    {decide.isPending ? "Saving…" : "Verify KYC"}
                  </button>
                </div>
              </div>
            </Section>
          )}
          {o.kycStatus !== "Pending" && o.gaps.length > 0 && <Gaps title="Not sent yet; still missing:" gaps={o.gaps} />}
          <Section title="Details">
            <KV
              rows={[
                ["Registered name", o.name],
                ["Registration number", o.registrationNo || "—"],
                [o.country === "Kenya" ? "KRA PIN" : "Tax PIN", o.kraPin || "—"],
                ["Physical address", o.address || "—"],
                ["Payout account", o.payoutAccount || "—"],
                ["Signatory", o.signatory.name ? `${o.signatory.name}, ${o.signatory.title}` : "—"],
                ["Data processing agreement", o.dpaSigned ? `Signed by ${o.dpaSigned.by}, ${o.dpaSigned.at}` : "Not signed"],
              ]}
            />
          </Section>
          <Section title="Documents" flush>
            <ul>
              {o.docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-[14px] last:border-0">
                  <span className="min-w-0">
                    <span className="block font-medium">{d.kind}</span>
                    <span className="block truncate text-[13px] text-slate">
                      {d.name} · {(d.size / 1024).toFixed(0)} KB · {d.at}
                    </span>
                  </span>
                  <button className="btn-secondary btn-sm" disabled={open.isPending} onClick={() => open.mutate(d.id)}>
                    Download
                  </button>
                </li>
              ))}
              {!o.docs.length && <li className="px-5 py-3 text-[14px] text-slate">None uploaded.</li>}
            </ul>
            <div className="px-5 pb-3">
              <Failed error={open.error} />
            </div>
          </Section>
        </div>
        <div className="space-y-4">
          <Section title="Events" flush>
            <ul>
              {o.events.map((e) => (
                <li key={e.id} className="border-b border-line px-5 py-3 last:border-0">
                  <Link href={`/team/events/${e.id}`} className="flex items-center justify-between gap-3 text-[14px] hover:text-coral">
                    <span className="truncate">{e.name}</span>
                    <StateTone state={e.state} />
                  </Link>
                </li>
              ))}
              {!o.events.length && <li className="px-5 py-3 text-[14px] text-slate">None yet.</li>}
            </ul>
          </Section>
          <Section title="History">
            <History items={o.history} />
          </Section>
        </div>
      </div>
    </>
  );
}

export function KycReviewGate({ id }: { id: string }) {
  return (
    <Signed>
      <KycReview id={id} />
    </Signed>
  );
}
