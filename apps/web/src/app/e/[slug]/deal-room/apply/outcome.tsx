"use client";

/**
 * What happens after submitting, on the applicant's status page (backend-plan.md, M1.6): a seeker sees the decision
 * in force, its reason and conditions, and the fee it asks for; a provider (capital, partner, challenge) uploads its
 * KYC documents and signs the NDA, and sees each checked. A decision waiting for a second decider isn't shown: it
 * isn't one yet.
 */
import { useState } from "react";
import type { KycItem, MyApplication } from "@excursia/contracts/apply";
import { fmtStamp } from "@excursia/domain/time";
import { useSignNda, useUploadKyc } from "@/features/apply/hooks/use-apply";
import { Card } from "./fields";

const TYPES = "application/pdf,image/png,image/jpeg";

/** The decision as the applicant reads it. */
const HEADLINE = {
  Qualified: "Approved for the Deal Room",
  Conditional: "Approved, on conditions",
  Referred: "Referred to another programme",
  Declined: "Not taken forward this time",
} as const;

const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString("en")}`;

export function Outcome({ slug, app, maxBytes }: { slug: string; app: MyApplication; maxBytes: number }) {
  if (app.decision) return <Decision app={app} />;
  if (app.verification) return <Verification slug={slug} app={app} maxBytes={maxBytes} />;
  return null;
}

function Decision({ app }: { app: MyApplication }) {
  const d = app.decision!;
  const approved = d.decision === "Qualified" || d.decision === "Conditional";
  const owed = app.fee && !app.fee.paid && !app.fee.waived;
  return (
    <Card title={HEADLINE[d.decision]}>
      <p className="text-[13px] text-slate">Decided {fmtStamp(d.at)}</p>
      <p className="mt-2 text-[15px]">{d.reason}</p>
      {d.conditions.length > 0 && (
        <div className="mt-4">
          <span className="label">What must be met</span>
          <ul className="space-y-2">
            {d.conditions.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-paper px-3 py-2 text-[14px]">
                <span>{c.text}</span>
                <span className={`pill ${c.met ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn"}`}>{c.met ? "Met" : `Due ${fmtStamp(c.due, false)}`}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-slate">Send what each condition asks for to the review team by its date; they mark it met.</p>
        </div>
      )}
      {approved && app.fee && (
        <p className="mt-4 text-[14px]">
          {owed ? (
            <>
              The participation fee, <strong className="font-medium">{money(app.fee.amount, app.fee.currency)}</strong>, is due before you are matched and get your Deal Room badge. Paying it online
              opens on this page shortly; we will email you when it does.
            </>
          ) : app.fee.waived ? (
            "Your participation fee is waived."
          ) : (
            "Your participation fee is paid."
          )}
        </p>
      )}
      {approved && app.readiness === "Deal Room Ready" && <p className="mt-3 text-[14px] text-ok">You are Deal Room Ready: matching starts when the Deal Room opens.</p>}
    </Card>
  );
}

function Verification({ slug, app, maxBytes }: { slug: string; app: MyApplication; maxBytes: number }) {
  const v = app.verification!;
  const upload = useUploadKyc(slug, app.id);
  const sign = useSignNda(slug, app.id);
  const [name, setName] = useState(app.form.decisionMaker.name);
  const [title, setTitle] = useState(app.form.decisionMaker.title ?? "");
  const [agree, setAgree] = useState(false);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const tone = v.state === "Verified" ? "bg-ok-50 text-ok" : v.state === "Declined" ? "bg-bad-50 text-bad" : "bg-warn-50 text-warn";
  const error = tooBig ?? upload.error?.message ?? sign.error?.message;

  return (
    <>
      <Card title="Verification">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`pill ${tone}`}>
            {v.state === "Verified" || v.state === "Declined" ? v.state : v.nda && v.kyc.every((k) => k.doc && k.doc.scan !== "failed") ? "With the review team" : "Waiting for your documents"}
          </span>
        </div>
        <p className="mt-3 text-[14px] text-slate">
          {v.state === "Verified"
            ? "Your organisation is verified: the Deal Room is open to you, and your badge comes by email."
            : v.state === "Declined"
              ? "Your organisation wasn't verified. The review team has written to you."
              : "Before the Deal Room opens to you, the review team checks who you are: your registration, who owns and controls the organisation, and the ID of the person signing. They also screen the organisation against the sanctions lists."}
        </p>

        <div className="mt-4">
          {v.kyc.map((k) => {
            const busy = upload.isPending && upload.variables?.item === k.item;
            return (
              <div key={k.item} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 last:border-0">
                <span className="min-w-0 text-[14px]">
                  <span className="font-medium">{LABEL[k.item]}</span>
                  {k.doc && (
                    <span className="block truncate text-[13px] text-slate">
                      {k.doc.name}, {fmtStamp(k.doc.at)}
                      {k.doc.scan === "checking" ? ", being checked for viruses" : k.doc.scan === "failed" ? ": failed the virus check, upload a clean copy" : k.checked ? "" : ", waiting for the review team"}
                    </span>
                  )}
                </span>
                {k.checked ? (
                  <span className="pill bg-ok-50 text-ok">Checked</span>
                ) : v.decided ? null : (
                  <label className={`btn-secondary btn-sm ${upload.isPending ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
                    {busy ? "Uploading…" : k.doc ? "Replace" : "Upload"}
                    <input
                      type="file"
                      className="sr-only"
                      accept={TYPES}
                      aria-label={`Upload ${LABEL[k.item].toLowerCase()}`}
                      disabled={upload.isPending}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        if (file.size > maxBytes) return setTooBig(`${file.name} is over ${Math.round(maxBytes / 1_048_576)} MB.`);
                        setTooBig(null);
                        upload.mutate({ item: k.item, file });
                      }}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
            {error}
          </p>
        )}
      </Card>

      <Card title="Non-disclosure agreement">
        {v.nda ? (
          <p className="text-[14px]">
            {v.nda.version}, signed by {v.nda.name}, {v.nda.title}, {fmtStamp(v.nda.at)}. One agreement covers every opportunity you see in this Deal Room.
          </p>
        ) : v.decided ? (
          <p className="text-[14px] text-slate">Not signed.</p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (agree && name.trim() && title.trim()) sign.mutate({ name, title });
            }}
          >
            <p className="text-[14px] text-slate">One agreement, covering every opportunity you see in this Deal Room: what you learn about a business there stays confidential. Sign it for {app.form.org.name || "your organisation"}.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Full name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </label>
              <label className="block">
                <span className="label">Title</span>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="organization-title" />
              </label>
            </div>
            <label className="flex items-start gap-2 text-[14px]">
              <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I sign for {app.form.org.name || "the organisation"} and accept the agreement.</span>
            </label>
            <button className="btn btn-primary w-full sm:w-auto" disabled={!agree || !name.trim() || !title.trim() || sign.isPending}>
              {sign.isPending ? "Signing…" : "Sign the NDA"}
            </button>
          </form>
        )}
      </Card>
    </>
  );
}

const LABEL: Record<KycItem, string> = { Registration: "Certificate of registration", "Beneficial owners": "Beneficial owners", "Signatory ID": "ID of the person signing" };
