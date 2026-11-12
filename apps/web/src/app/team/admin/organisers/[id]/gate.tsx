"use client";

/**
 * Algotech checks an organiser's KYC: the details, each document opened through a short link (audited), and the
 * signed agreement; then verifies it, or returns it with what to fix.
 */
import Link from "next/link";
import { useState } from "react";
import type { KycDecision, OrganiserView, RateCard } from "@excursia/contracts/onboarding";
import { KV, PageHeader, Section, Tone } from "@/components/ui";
import { useSession } from "@/features/auth/hooks/use-session";
import { rolesOf } from "@/features/auth/roles";
import { onboardingApi } from "@/features/onboarding/api";
import { useOpenKycDoc, useOrganiser, useOrganiserChange } from "@/features/onboarding/hooks/use-onboarding";
import { AlgotechOnly, Failed, Gaps, History, KycTone, Loading, Signed, StateTone } from "../../../bits";

/** A document's size as people read it: never "0 KB" for a small file. */
const fileSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function KycReview({ id }: { id: string }) {
  const org = useOrganiser(id);
  const open = useOpenKycDoc(id);
  const decide = useOrganiserChange(id, (input: KycDecision) => onboardingApi.decideKyc(id, input));
  const [note, setNote] = useState("");
  /** the items marked to return, each with its note */
  const [marks, setMarks] = useState<Record<string, string>>({});
  if (org.isPending) return <Loading />;
  if (org.isError) return <Failed error={org.error} />;
  const o = org.data;
  const marking = Object.keys(marks).length;
  const valueOf = (key: string) =>
    ({
      name: o.name,
      registrationNo: o.registrationNo,
      kraPin: o.kraPin,
      address: o.address,
      payoutAccount: o.payoutAccount,
      signatory: o.signatory.name ? `${o.signatory.name}, ${o.signatory.title}` : "",
      dpa: o.dpaSigned ? `Signed by ${o.dpaSigned.by}, ${o.dpaSigned.at}` : "Not signed",
    })[key] ?? "";
  return (
    <>
      <PageHeader title={o.name} badge={<KycTone status={o.kycStatus} />} crumbs={[{ href: "/team/admin", label: "Organisers and events" }, { label: o.name }]} kicker={`Owner ${o.owner?.name ?? "—"} (${o.owner?.email ?? "—"}) · ${o.country}`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {o.kycStatus === "Pending" ? (
            <Section title="Check each item" flush>
              {o.kycItems.some((i) => i.lastReturned) && (
                <p className="mx-5 mb-2 rounded-md bg-warn-50 px-3 py-2 text-[14px]">Sent again after a return: the items returned last time are marked. Check those first.</p>
              )}
              <p className="px-5 pb-2 text-[14px] text-slate">Open each document and check it against the details. Mark anything to fix, with a note: the organiser sees each note on its item, and sends KYC again once each one has changed.</p>
              <ul>
                {o.kycItems.map((item) => {
                  const marked = item.key in marks;
                  const docs = item.key.startsWith("doc:") ? o.docs.filter((d) => d.kind === item.key.slice(4)) : [];
                  return (
                    <li key={item.key} className={`border-b border-line px-5 py-3 last:border-0 ${marked ? "bg-bad-50" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 text-[14px]">
                          <div className="font-medium">
                            {item.label}
                            {item.lastReturned && <span className="ml-2 text-[12px] font-normal text-warn">Returned last time, changed since</span>}
                          </div>
                          {item.lastReturned && <div className="text-[13px] text-slate">Last time: {item.lastReturned}</div>}
                          {item.key.startsWith("doc:") ? (
                            docs.length ? (
                              docs.map((d) => (
                                <button key={d.id} type="button" className="block truncate text-[13px] text-slate underline underline-offset-4 hover:text-ink" disabled={open.isPending} onClick={() => open.mutate(d.id)}>
                                  {d.name} · {fileSize(d.size)} · download
                                </button>
                              ))
                            ) : (
                              <div className="text-[13px] text-slate">None uploaded</div>
                            )
                          ) : (
                            <div className="text-[13px] text-slate">{valueOf(item.key) || "—"}</div>
                          )}
                        </div>
                        <label className="flex items-center gap-2 text-[13px]">
                          <input
                            type="checkbox"
                            checked={marked}
                            onChange={(e) =>
                              setMarks((m) => {
                                const next = { ...m };
                                if (e.target.checked) next[item.key] = "";
                                else delete next[item.key];
                                return next;
                              })
                            }
                          />
                          Return
                        </label>
                      </div>
                      {marked && (
                        <input className="input mt-2" autoFocus placeholder={`What to fix in ${item.label.toLowerCase()}`} aria-label={`What to fix in ${item.label}`} value={marks[item.key]} onChange={(e) => setMarks((m) => ({ ...m, [item.key]: e.target.value }))} />
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="space-y-3 border-t border-line p-5">
                <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A general note to the organiser (optional)" aria-label="General note to the organiser" />
                <Failed error={decide.error ?? open.error} />
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    className="btn-secondary text-bad"
                    disabled={!marking || Object.values(marks).some((v) => !v.trim()) || decide.isPending}
                    onClick={() => decide.mutate({ verdict: "Returned", note, items: marks }, { onSuccess: () => setMarks({}) })}
                  >
                    {marking ? `Return ${marking} item${marking === 1 ? "" : "s"}` : "Mark items to return"}
                  </button>
                  <button className="btn-primary" disabled={!!marking || decide.isPending} title={marking ? "Unmark the items to return first" : undefined} onClick={() => decide.mutate({ verdict: "Verified", note: "" })}>
                    {decide.isPending ? "Saving…" : "Verify KYC"}
                  </button>
                </div>
              </div>
            </Section>
          ) : (
            <>
              {o.gaps.length > 0 && <Gaps title={o.kycStatus === "Returned" ? "With the organiser to fix:" : "Not sent yet; still missing:"} gaps={o.gaps} />}
              <Section title="KYC" flush>
                <ul>
                  {o.kycItems.map((item) => {
                    const docs = item.key.startsWith("doc:") ? o.docs.filter((d) => d.kind === item.key.slice(4)) : [];
                    return (
                      <li key={item.key} className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3 text-[14px] last:border-0">
                        <span className="min-w-0">
                          <span className="block font-medium">{item.label}</span>
                          {item.key.startsWith("doc:") ? (
                            docs.map((d) => (
                              <button key={d.id} type="button" className="block truncate text-[13px] text-slate underline underline-offset-4 hover:text-ink" disabled={open.isPending} onClick={() => open.mutate(d.id)}>
                                {d.name} · download
                              </button>
                            ))
                          ) : (
                            <span className="block text-[13px] text-slate">{valueOf(item.key) || "—"}</span>
                          )}
                          {item.returned && <span className="mt-1 block text-[13px] text-bad">Returned: {item.returned}</span>}
                        </span>
                        {item.returned && (item.fixed ? <Tone tone="ok">Changed</Tone> : <Tone tone="bad">To fix</Tone>)}
                      </li>
                    );
                  })}
                </ul>
                <div className="px-5 pb-3">
                  <Failed error={open.error} />
                </div>
              </Section>
            </>
          )}
        </div>
        <div className="space-y-4">
          <RateCardPanel o={o} />
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

const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

/** PA-4: what Algotech charges this organiser; every approval starts from it. Super admins change it. */
function RateCardPanel({ o }: { o: OrganiserView }) {
  const superAdmin = rolesOf(useSession().data).superAdmin;
  const save = useOrganiserChange(o.id, (card: RateCard) => onboardingApi.setRateCard(o.id, card));
  const [editing, setEditing] = useState(false);
  const { custom, ...card } = o.rateCard;
  const [f, setF] = useState<Record<keyof RateCard, string>>(() => Object.fromEntries(Object.entries(card).map(([k, v]) => [k, String(v)])) as Record<keyof RateCard, string>);
  const rows: [keyof RateCard, string][] = [
    ["commissionPct", "Commission %"],
    ["licenceFee", "Licence fee, per event (KES)"],
    ["oneOffFee", "One-off fee (KES)"],
    ["dealRoomAddOn", "Deal Room with a summit (KES)"],
    ["dealRoomOnly", "Deal Room on its own (KES)"],
    ["deskStaff", "Deal Room desk staff a day"],
  ];
  return (
    <Section
      title="Rate card"
      action={
        superAdmin && !editing ? (
          <button className="btn-secondary btn-sm" onClick={() => setEditing(true)}>
            Change
          </button>
        ) : undefined
      }
    >
      {!custom && <p className="mb-3 text-[13px] text-slate">The platform&apos;s starting card: no rate card set for {o.name} yet.</p>}
      {editing ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const next = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, k === "gatewayFeesBorneBy" ? v : Number(v)])) as unknown as RateCard;
            save.mutate(next, { onSuccess: () => setEditing(false) });
          }}
        >
          {rows.map(([k, label]) => (
            <div key={k}>
              <label className="label" htmlFor={`rc-${k}`}>
                {label}
              </label>
              <input id={`rc-${k}`} className="input" type="number" min={0} step={k === "commissionPct" ? 0.5 : 1} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
          ))}
          <div>
            <label className="label" htmlFor="rc-gw">
              Gateway fees borne by
            </label>
            <select id="rc-gw" className="input" value={f.gatewayFeesBorneBy} onChange={(e) => setF({ ...f, gatewayFeesBorneBy: e.target.value })}>
              <option>Algotech</option>
              <option>Organiser</option>
            </select>
          </div>
          <Failed error={save.error} />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save the rate card"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <KV
          rows={[
            ["Commission", `${card.commissionPct}%`],
            ["Licence fee", kes(card.licenceFee)],
            ["One-off fee", kes(card.oneOffFee)],
            ["Gateway fees", `Borne by ${card.gatewayFeesBorneBy}`],
            ["Deal Room with a summit", kes(card.dealRoomAddOn)],
            ["Deal Room on its own", kes(card.dealRoomOnly)],
            ["Desk staff", `${card.deskStaff} a day`],
          ]}
        />
      )}
    </Section>
  );
}

export function KycReviewGate({ id }: { id: string }) {
  return (
    <Signed>
      <AlgotechOnly>
        <KycReview id={id} />
      </AlgotechOnly>
    </Signed>
  );
}
