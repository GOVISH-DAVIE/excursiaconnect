"use client";

/**
 * The application form on the API (backend-plan.md, M1.1). The form owns its fields while someone types; 800 ms
 * after the last keystroke it sends the fields that changed, and the server merges them into the draft on record,
 * so a second device keeps its own edits too. Documents upload straight to storage. "Submit" sends the last changes
 * and the submission as one command; the rules say what is still missing, if anything.
 */
import { useEffect, useRef, useState } from "react";
import type { ApplyForm, MyApplication } from "@excursia/contracts/apply";
import type { DrApplication, OwnerKind, ProviderKind, Currency, Instrument, Stage } from "@excursia/domain/dealroom/types";
import { fmtStamp } from "@excursia/domain/time";
import { useMyApplication, useSaveDraft, useSubmitApplication, useUploadDocument } from "@/features/apply/hooks/use-apply";
import { changesSince, snapshot, toDraft, withSaved } from "./draft";
import { Card, ChallengeFields, F, INSTRUMENTS, MandateFields, REVENUE, STAGES } from "./fields";

export function Editor({ slug, form, initial }: { slug: string; form: ApplyForm; initial: MyApplication }) {
  const [app, setApp] = useState<DrApplication>(() => toDraft(initial, form.eventId));
  const saved = useRef(snapshot(app));
  const meta = useMyApplication(slug, initial.id).data ?? initial;
  const save = useSaveDraft(slug, initial.id);
  const submit = useSubmitApplication(slug, initial.id);
  const [tried, setTried] = useState(false);
  const up = (patch: Partial<DrApplication>) => setApp((a) => ({ ...a, ...patch }));
  const mode = meta.mode;
  const type = mode === "seeker" ? "seeker" : "provider";

  // autosave: 800 ms after the last change, the changed fields only
  const { mutate: saveChanges } = save;
  useEffect(() => {
    const changes = changesSince(saved.current, app);
    if (!Object.keys(changes).length) return;
    const t = setTimeout(() => {
      const before = saved.current;
      saved.current = withSaved(before, changes);
      // a failed save puts them back as unsaved, so the next change retries them
      saveChanges(changes, { onError: () => (saved.current = before) });
    }, 800);
    return () => clearTimeout(t);
  }, [app, saveChanges]);

  const send = () => {
    setTried(true);
    const changes = changesSince(saved.current, app);
    const before = saved.current;
    saved.current = withSaved(before, changes);
    submit.mutate(changes, { onError: () => (saved.current = before) });
  };

  const savedNote = save.isPending ? "Saving…" : save.isError ? `Not saved: ${save.error.message}` : meta.draftSavedAt ? `Draft saved ${fmtStamp(meta.draftSavedAt)}` : "Not saved yet";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-slate">
        <span role="status" className={save.isError ? "text-bad" : ""}>
          {savedNote}
        </span>
        <span>To continue on another device, sign in there with {meta.form.contact.email}.</span>
      </div>

      <Card title="Your organisation">
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Legal name">
            <input className="input" value={app.org.name} onChange={(e) => up({ org: { ...app.org, name: e.target.value } })} />
          </F>
          {type === "seeker" ? (
            <>
              <F label="Registration number">
                <input className="input" value={app.org.regNo} onChange={(e) => up({ org: { ...app.org, regNo: e.target.value } })} />
              </F>
              <F label="Kind of organisation">
                <select className="input" value={app.ownerKind ?? ""} onChange={(e) => up({ ownerKind: (e.target.value || undefined) as OwnerKind | undefined })}>
                  <option value="">Choose</option>
                  {form.ownerKinds.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </F>
            </>
          ) : (
            <F label={mode === "challenge" ? "Kind of organisation" : "Type of provider"}>
              <select className="input" value={app.providerKind ?? ""} onChange={(e) => up({ providerKind: (e.target.value || undefined) as ProviderKind | undefined })}>
                <option value="">Choose</option>
                {(mode === "challenge" ? form.challengeKinds : form.providerKinds).map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </F>
          )}
          <F label={type === "seeker" ? "Country" : "Headquarters"}>
            <select className="input" value={app.org.country} onChange={(e) => up({ org: { ...app.org, country: e.target.value } })}>
              <option value="">Choose</option>
              {form.countries.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </F>
          {type === "seeker" && (
            <F label="Sector">
              <select className="input" value={app.org.sector} onChange={(e) => up({ org: { ...app.org, sector: e.target.value } })}>
                <option value="">Choose</option>
                {form.sectors.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </F>
          )}
          <F label="Website" help={form.fields["org.website"] === "advisory" ? "Optional" : undefined}>
            <input className="input" type="url" placeholder="https://" value={app.org.website ?? ""} onChange={(e) => up({ org: { ...app.org, website: e.target.value } })} />
          </F>
          <F label="Your name">
            <input className="input" value={app.contact.name} onChange={(e) => up({ contact: { ...app.contact, name: e.target.value } })} />
          </F>
          <F label="Your phone">
            <input className="input" type="tel" value={app.contact.phone} onChange={(e) => up({ contact: { ...app.contact, phone: e.target.value } })} />
          </F>
        </div>
      </Card>

      {type === "seeker" && app.ask && app.traction && (
        <Card title="What you are raising">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Amount">
              <div className="flex gap-2">
                <select className="input w-24" aria-label="Currency" value={app.ask.currency} onChange={(e) => up({ ask: { ...app.ask!, currency: e.target.value as Currency } })}>
                  <option>USD</option>
                  <option>KES</option>
                </select>
                <input className="input" type="number" min={0} inputMode="numeric" value={app.ask.amount || ""} onChange={(e) => up({ ask: { ...app.ask!, amount: Number(e.target.value) } })} />
              </div>
            </F>
            <F label="Transaction pathway">
              <select className="input" value={app.ask.instrument} onChange={(e) => up({ ask: { ...app.ask!, instrument: e.target.value as Instrument } })}>
                {INSTRUMENTS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </F>
            <F label="Stage">
              <select className="input" value={app.ask.stage} onChange={(e) => up({ ask: { ...app.ask!, stage: e.target.value as Stage } })}>
                {STAGES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </F>
            <F label="Revenue last year">
              <select className="input" value={app.traction.revenueBand} onChange={(e) => up({ traction: { ...app.traction!, revenueBand: e.target.value } })}>
                <option value="">Choose</option>
                {REVENUE.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </F>
            <F label="Use of funds" span>
              <textarea className="input min-h-20" value={app.ask.useOfFunds} onChange={(e) => up({ ask: { ...app.ask!, useOfFunds: e.target.value } })} />
            </F>
            <F label="Customers" help="Optional, for example 1,200 retail customers">
              <input className="input" value={app.traction.customers} onChange={(e) => up({ traction: { ...app.traction!, customers: e.target.value } })} />
            </F>
            <F label="Key metrics" help="Optional">
              <input className="input" value={app.traction.metrics} onChange={(e) => up({ traction: { ...app.traction!, metrics: e.target.value } })} />
            </F>
          </div>
        </Card>
      )}

      {app.challenge && <ChallengeFields c={app.challenge} onChange={(challenge) => up({ challenge })} />}
      {type === "provider" && app.mandate && <MandateFields app={app} sectors={form.sectors} countries={form.countries} onChange={(mandate) => up({ mandate })} />}

      <Card title="The decision-maker">
        <p className="-mt-1 mb-3 text-[13px] text-slate">The person who can commit {type === "seeker" ? "the company" : "your organisation"} and who will attend the meetings.</p>
        <label className="mb-3 flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={!!app.contact.name && app.decisionMaker.name === app.contact.name}
            onChange={(e) => up({ decisionMaker: e.target.checked ? { ...app.contact, title: app.decisionMaker.title } : { name: "", title: "", email: "", phone: "" } })}
          />
          That is me
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Name">
            <input className="input" value={app.decisionMaker.name} onChange={(e) => up({ decisionMaker: { ...app.decisionMaker, name: e.target.value } })} />
          </F>
          <F label="Title">
            <input className="input" value={app.decisionMaker.title} onChange={(e) => up({ decisionMaker: { ...app.decisionMaker, title: e.target.value } })} />
          </F>
          <F label="Email">
            <input className="input" type="email" value={app.decisionMaker.email} onChange={(e) => up({ decisionMaker: { ...app.decisionMaker, email: e.target.value } })} />
          </F>
          <F label="Phone">
            <input className="input" type="tel" value={app.decisionMaker.phone} onChange={(e) => up({ decisionMaker: { ...app.decisionMaker, phone: e.target.value } })} />
          </F>
        </div>
      </Card>

      <Card title="Mission and how you heard of us">
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Mission">
            <select className="input" value={app.mission} onChange={(e) => up({ mission: e.target.value, track: undefined })}>
              <option value="">Choose</option>
              {form.missions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} {m.name}
                </option>
              ))}
            </select>
          </F>
          {type === "seeker" && (
            <F label="Strategic track">
              <select className="input" value={app.track ?? ""} disabled={!app.mission} onChange={(e) => up({ track: e.target.value || undefined })}>
                <option value="">{app.mission ? "Choose" : "Choose a mission first"}</option>
                {form.tracks
                  .filter((t) => t.missionId === app.mission)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} {t.name}
                    </option>
                  ))}
              </select>
            </F>
          )}
          <F label="How you heard of the Deal Room">
            <select className="input" value={app.source} onChange={(e) => up({ source: e.target.value })}>
              <option value="">Choose</option>
              {form.sources.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </F>
        </div>
      </Card>

      {type === "seeker" && <Documents slug={slug} form={form} app={meta} />}

      <div className="surface p-5">
        {(tried || submit.isError) && (submit.error || meta.gaps.missing.length > 0) && (
          <div role="alert" className="mb-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
            {submit.error ? submit.error.message : `Still needed before you can submit: ${meta.gaps.missing.join(", ")}.`}
          </div>
        )}
        {meta.gaps.advisory.length > 0 && <p className="mb-3 text-[13px] text-slate">Worth adding, not required: {meta.gaps.advisory.join(", ")}.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-slate">
            {mode === "challenge"
              ? "After you submit, the team verifies your organisation, then matches your challenge with businesses that can solve it."
              : type === "provider"
                ? "After you submit, the team verifies your organisation before matching."
                : "You get a reference number at once, and the team starts the review."}
          </span>
          <button className="btn btn-primary btn-cta" disabled={submit.isPending} onClick={send}>
            {submit.isPending ? "Submitting…" : mode === "challenge" ? "Submit the challenge" : "Submit the application"}
          </button>
        </div>
      </div>
    </>
  );
}

/** The seeker's documents: each uploads straight to storage, then attaches to the application. */
function Documents({ slug, form, app }: { slug: string; form: ApplyForm; app: MyApplication }) {
  const upload = useUploadDocument(slug, app.id);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const mb = Math.round(form.upload.maxBytes / 1_048_576);
  return (
    <Card title="Documents">
      <p className="-mt-1 mb-2 text-[13px] text-slate">
        PDF, Word, Excel, PowerPoint or an image, up to {mb} MB each. Nothing is shared with an investor until you consent, per document and per investor.
      </p>
      {form.seekerDocs.map((d) => {
        const have = app.documents.filter((x) => x.kind === d.kind);
        const busy = upload.isPending && upload.variables?.kind === d.kind;
        return (
          <div key={d.kind} className="border-b border-line py-2 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[14px] font-medium">
                {d.kind}
                {!d.required && <span className="ml-1 font-normal text-slate">optional</span>}
              </span>
              <label className={`btn-secondary btn-sm ${upload.isPending ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
                {busy ? "Uploading…" : have.length ? "Add another" : "Upload"}
                <input
                  type="file"
                  className="sr-only"
                  accept={form.upload.types.join(",")}
                  disabled={upload.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (file.size > form.upload.maxBytes) return setTooBig(`${file.name} is over ${mb} MB.`);
                    setTooBig(null);
                    upload.mutate({ kind: d.kind, file });
                  }}
                />
              </label>
            </div>
            {have.map((h) => (
              <div key={h.id} className="mt-1 flex items-center gap-2 text-[13px] text-slate">
                <span aria-hidden="true">📄</span>
                <span className="truncate">{h.name}</span>
                <span className="shrink-0">{Math.max(1, Math.round(h.size / 1024))} KB</span>
              </div>
            ))}
          </div>
        );
      })}
      {(tooBig || upload.error) && (
        <p role="alert" className="mt-2 text-[14px] text-bad">
          {tooBig ?? upload.error?.message}
        </p>
      )}
    </Card>
  );
}
