"use client";

/**
 * The organiser's own page: KYC first (details, the three documents, the data processing agreement), sent to
 * Algotech in one go; then its events. Once sent, KYC is read-only until Algotech answers; a return says why.
 */
import Link from "next/link";
import { useState } from "react";
import type { KycInput, OrganiserView } from "@excursia/contracts/onboarding";
import { KYC_DOC_KINDS } from "@excursia/contracts/onboarding";
import { PageHeader, Section } from "@/components/ui";
import { onboardingApi } from "@/features/onboarding/api";
import { useMyOrganisers, useOpenKycDoc, useOrganiserChange } from "@/features/onboarding/hooks/use-onboarding";
import { Failed, FileButton, Gaps, History, KycTone, Loading, StateTone } from "../bits";

export function Organisation() {
  const mine = useMyOrganisers();
  if (mine.isPending) return <Loading />;
  if (mine.isError) return <Failed error={mine.error} />;
  const o = mine.data[0];
  if (!o) return <PageHeader title="No organiser yet" kicker="Your account doesn't own an organiser." />;
  return <Kyc key={o.id} initial={o} />;
}

const formOf = (o: OrganiserView) => ({
  name: o.name,
  registrationNo: o.registrationNo,
  kraPin: o.kraPin,
  address: o.address,
  payoutAccount: o.payoutAccount,
  signatoryName: o.signatory.name,
  signatoryTitle: o.signatory.title,
});

function Kyc({ initial }: { initial: OrganiserView }) {
  // the cached view is kept current by every change's answer
  const mine = useMyOrganisers();
  const o = mine.data?.find((x) => x.id === initial.id) ?? initial;
  const save = useOrganiserChange(o.id, (input: KycInput) => onboardingApi.saveKyc(o.id, input));
  const upload = useOrganiserChange(o.id, (a: { kind: string; file: File }) => onboardingApi.uploadKycDoc(o.id, a.kind, a.file));
  const remove = useOrganiserChange(o.id, (fileId: string) => onboardingApi.removeKycDoc(o.id, fileId));
  const sign = useOrganiserChange(o.id, (by: string) => onboardingApi.signDpa(o.id, by));
  const submit = useOrganiserChange(o.id, () => onboardingApi.submitKyc(o.id));
  const open = useOpenKycDoc(o.id);
  const [form, setForm] = useState(() => formOf(o));
  const [signer, setSigner] = useState("");
  const edit = o.can.edit;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  /** Algotech's note on an item it returned, until the item has changed */
  const returned = (key: string) => {
    const i = o.kycItems.find((x) => x.key === key);
    return i?.returned && !i.fixed ? i.returned : null;
  };
  const ITEM: Partial<Record<keyof typeof form, string>> = { name: "name", registrationNo: "registrationNo", kraPin: "kraPin", address: "address", payoutAccount: "payoutAccount", signatoryName: "signatory", signatoryTitle: "signatory" };
  const field = (k: keyof typeof form, label: string, hint?: string) => {
    const note = ITEM[k] && k !== "signatoryTitle" ? returned(ITEM[k]!) : null;
    return (
      <div>
        <label className="label" htmlFor={`kyc-${k}`}>
          {label}
        </label>
        <input id={`kyc-${k}`} className={`input ${note ? "border-bad" : ""}`} value={form[k]} onChange={set(k)} disabled={!edit} />
        {note ? <p className="mt-1 text-[12px] text-bad">Algotech: {note}</p> : hint && <p className="mt-1 text-[12px] text-slate">{hint}</p>}
      </div>
    );
  };

  return (
    <>
      <PageHeader title={o.name} badge={<KycTone status={o.kycStatus} />} kicker={`Registered in ${o.country || "—"}. KYC is done once and reused for every event.`} />

      {o.kycStatus === "Returned" && (
        <div className="mb-4 rounded-lg border border-bad bg-bad-50 px-4 py-3 text-[14px]">
          <p className="font-medium text-bad">Algotech returned your KYC. Fix these, then send it again:</p>
          <ul className="mt-1 list-disc pl-5">
            {o.kycItems
              .filter((i) => i.returned)
              .map((i) => (
                <li key={i.key} className={i.fixed ? "text-slate line-through" : ""}>
                  <span className="font-medium">{i.label}:</span> {i.returned}
                </li>
              ))}
          </ul>
          {o.kycNote && <p className="mt-2">{o.kycNote}</p>}
        </div>
      )}
      {o.kycStatus === "Pending" && <p className="mb-4 rounded-lg bg-paper-200 px-4 py-3 text-[14px]">Your KYC is with Algotech. You can draft events meanwhile; they can be submitted once it is verified.</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Section title="Business details">
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(
                  {
                    name: form.name,
                    registrationNo: form.registrationNo,
                    kraPin: form.kraPin,
                    address: form.address,
                    payoutAccount: form.payoutAccount,
                    signatory: { name: form.signatoryName, title: form.signatoryTitle },
                  },
                  // the form shows what was kept (the PIN in capitals, say), not what was typed
                  { onSuccess: (view) => setForm(formOf(view)) },
                );
              }}
            >
              <div className="sm:col-span-2">{field("name", "Registered name", "As on the registration certificate")}</div>
              {field("registrationNo", "Registration number")}
              {field("kraPin", o.country === "Kenya" ? "KRA PIN" : "Tax PIN", o.country === "Kenya" ? "Like P051234567X" : undefined)}
              <div className="sm:col-span-2">{field("address", "Physical address", "Street and town. Not shown publicly.")}</div>
              <div className="sm:col-span-2">{field("payoutAccount", "Payout account", "Bank and account, or M-Pesa paybill, for ticket payouts")}</div>
              {field("signatoryName", "Signatory's full name", "The person who signs for the organisation")}
              {field("signatoryTitle", "Signatory's title")}
              {edit && (
                <div className="flex items-center gap-3 sm:col-span-2">
                  <button className="btn-primary" disabled={save.isPending}>
                    {save.isPending ? "Saving…" : "Save details"}
                  </button>
                  {save.isSuccess && !save.isPending && <span className="text-[13px] text-ok">Saved</span>}
                </div>
              )}
              <div className="sm:col-span-2">
                <Failed error={save.error} />
              </div>
            </form>
          </Section>

          <Section title="Documents" flush>
            <ul>
              {KYC_DOC_KINDS.map((kind) => {
                const docs = o.docs.filter((d) => d.kind === kind);
                const busy = upload.isPending && upload.variables?.kind === kind;
                return (
                  <li key={kind} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-0">
                    <div className="min-w-0 text-[14px]">
                      <div className="font-medium">{kind}</div>
                      {returned(`doc:${kind}`) && <div className="text-[13px] text-bad">Algotech: {returned(`doc:${kind}`)}. Upload a new one.</div>}
                      {docs.length ? (
                        docs.map((d) => (
                          <div key={d.id} className="flex items-center gap-3 text-[13px] text-slate">
                            <button type="button" className="truncate underline underline-offset-4 hover:text-ink" onClick={() => open.mutate(d.id)}>
                              {d.name}
                            </button>
                            {edit && (
                              <button type="button" className="text-bad hover:underline" disabled={remove.isPending} onClick={() => remove.mutate(d.id)}>
                                Remove
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-[13px] text-slate">Not uploaded</div>
                      )}
                    </div>
                    {edit && <FileButton label={docs.length ? "Replace or add" : "Upload"} busy={busy} disabled={upload.isPending} onFile={(file) => upload.mutate({ kind, file })} />}
                  </li>
                );
              })}
            </ul>
            <div className="px-5 pb-4">
              <Failed error={upload.error ?? remove.error ?? open.error} />
            </div>
          </Section>

          <Section title="Data processing agreement">
            {o.dpaSigned ? (
              <p className="text-[14px]">
                Signed by <span className="font-medium">{o.dpaSigned.by}</span>, {o.dpaSigned.at}.
              </p>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  sign.mutate(signer);
                }}
              >
                {returned("dpa") && <p className="text-[14px] text-bad">Algotech: {returned("dpa")}. Sign it again.</p>}
                <p className="text-[14px] text-slate">It sets how delegates&apos; and applicants&apos; data is held and deleted. The signatory signs by typing their full name; it is timestamped.</p>
                <div>
                  <label className="label" htmlFor="dpa-by">
                    Signatory&apos;s full name
                  </label>
                  <input id="dpa-by" className="input" value={signer} onChange={(e) => setSigner(e.target.value)} placeholder={o.signatory.name || "Save the signatory's name first"} disabled={!edit} />
                </div>
                <Failed error={sign.error} />
                <button className="btn-primary" disabled={!edit || sign.isPending || !signer.trim()}>
                  {sign.isPending ? "Signing…" : "Sign the agreement"}
                </button>
              </form>
            )}
          </Section>

          {edit && (
            <Section title="Send to Algotech">
              <div className="space-y-3">
                <Gaps title="Still needed before sending" gaps={o.gaps} />
                {!o.gaps.length && <p className="text-[14px] text-slate">Everything is here. Algotech checks it, usually within two working days, and tells you here.</p>}
                <Failed error={submit.error} />
                <button className="btn-primary" disabled={!o.can.submit || submit.isPending} onClick={() => submit.mutate(undefined)}>
                  {submit.isPending ? "Sending…" : "Send KYC for checking"}
                </button>
              </div>
            </Section>
          )}
        </div>

        <div className="space-y-4">
          <Section
            title="Events"
            action={
              <Link href="/team/events/new" className="btn-secondary btn-sm">
                New event
              </Link>
            }
            flush
          >
            {o.events.length ? (
              <ul>
                {o.events.map((e) => (
                  <li key={e.id} className="border-b border-line px-5 py-3 last:border-0">
                    <Link href={`/team/events/${e.id}`} className="flex items-center justify-between gap-3 hover:text-coral">
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium">{e.name}</span>
                        <span className="text-[13px] text-slate">
                          {e.startDate} · {e.city}
                        </span>
                      </span>
                      <StateTone state={e.state} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-4 text-[14px] text-slate">No events yet.</p>
            )}
          </Section>
          <Section title="History">
            <History items={o.history} />
          </Section>
        </div>
      </div>
    </>
  );
}
