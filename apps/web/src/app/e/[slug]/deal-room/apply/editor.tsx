"use client";

/**
 * The application form on the API (backend-plan.md, M1.1), in steps: each registration pathway has its own
 * sections, then a review of what is still missing. The form owns its fields while someone types; 800 ms after the
 * last keystroke it sends the fields that changed, and the server merges them into the draft on record, so a second
 * device keeps its own edits too. Documents upload straight to storage. "Submit" sends the last changes and the
 * submission as one command; the rules say what is still missing, if anything.
 */
import { useEffect, useRef, useState } from "react";
import type { ApplyForm, MyApplication } from "@excursia/contracts/apply";
import { kindsFor, type ApplyMode } from "@excursia/domain/dealroom/apply";
import type { DrApplication, OwnerKind, ProviderKind, Currency, Instrument, Stage } from "@excursia/domain/dealroom/types";
import { fmtStamp } from "@excursia/domain/time";
import { useMyApplication, useSaveDraft, useSubmitApplication, useUploadDocument } from "@/features/apply/hooks/use-apply";
import { changesSince, snapshot, toDraft, withSaved } from "./draft";
import { Card, ChallengeFields, F, INSTRUMENTS, MandateFields, REVENUE, STAGES } from "./fields";

/* ---------- the steps: each pathway's sections, then a review of what is still missing ---------- */
type StepKey = "org" | "ask" | "challenge" | "mandate" | "people" | "docs" | "review";
const STEPS: Record<ApplyMode, StepKey[]> = {
  seeker: ["org", "ask", "people", "docs", "review"],
  capital: ["org", "mandate", "people", "review"],
  partner: ["org", "mandate", "people", "review"],
  challenge: ["org", "challenge", "mandate", "people", "review"],
};
const stepLabel = (k: StepKey, mode: ApplyMode) =>
  ({
    org: "Organisation",
    ask: "Your ask",
    challenge: "The challenge",
    mandate: mode === "challenge" ? "Who could solve it" : mode === "partner" ? "What you are looking for" : "Your mandate",
    people: "Decision-maker and mission",
    docs: "Documents",
    review: "Review and submit",
  })[k];
/** Which step each item the rules name as missing is filled in on; anything else is listed on the review. */
const GAP_STEP: Record<string, StepKey> = {
  "Legal name": "org", "Registration number": "org", Country: "org", Sector: "org", Website: "org", Organisation: "org", "Organisation type": "org", Headquarters: "org",
  "Amount sought": "ask", "Transaction pathway": "ask", "Use of funds": "ask", Stage: "ask", "Revenue band": "ask", Customers: "ask",
  Sectors: "mandate", Countries: "mandate", Stages: "mandate", "Ticket or contract range": "mandate", "Transaction pathways": "mandate", Exclusions: "mandate", "Decision timeline": "mandate",
  "Challenge title": "challenge", "The problem": "challenge", "Who has it": "challenge", "What success looks like": "challenge", "Procurement route": "challenge", "How the decision is made": "challenge", Constraints: "challenge", "Budget range": "challenge", Timeline: "challenge",
  "Decision-maker": "people", Mission: "people", "How you heard of the Deal Room": "people",
};

export function Editor({ slug, form, initial, onSubmitted }: { slug: string; form: ApplyForm; initial: MyApplication; onSubmitted: () => void }) {
  const [app, setApp] = useState<DrApplication>(() => toDraft(initial, form.eventId));
  const saved = useRef(snapshot(app));
  const meta = useMyApplication(slug, initial.id).data ?? initial;
  const save = useSaveDraft(slug, initial.id);
  const submit = useSubmitApplication(slug, initial.id);
  const [tried, setTried] = useState(false);
  const up = (patch: Partial<DrApplication>) => setApp((a) => ({ ...a, ...patch }));
  const mode = meta.mode;
  const seeker = mode === "seeker";
  const steps = STEPS[mode];
  const docStep = (gap: string) => form.seekerDocs.some((d) => d.kind === gap);
  const stepOf = (gap: string): StepKey => GAP_STEP[gap] ?? (docStep(gap) ? "docs" : "review");
  const missingIn = (k: StepKey) => meta.gaps.missing.filter((g) => stepOf(g) === k);

  // a draft picks up where it stands: the first step with something missing, the steps before it ticked
  const [step, setStep] = useState(() => {
    if (!initial.form.org.name && !initial.form.contact.name) return 0;
    const i = steps.findIndex((k) => k !== "review" && initial.gaps.missing.some((g) => stepOf(g) === k));
    return i < 0 ? steps.length - 1 : i;
  });
  const [reached, setReached] = useState(() => (initial.form.org.name || initial.form.contact.name ? steps.length - 1 : 0));
  const at = Math.min(step, steps.length - 1);
  const cur = steps[at];
  const go = (i: number) => {
    setStep(i);
    setReached((r) => Math.max(r, i));
    window.scrollTo({ top: 0 });
  };

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
    submit.mutate(changes, { onSuccess: onSubmitted, onError: () => (saved.current = before) });
  };

  const savedNote = save.isPending ? "Saving…" : save.isError ? `Not saved: ${save.error.message}` : meta.draftSavedAt ? `Draft saved ${fmtStamp(meta.draftSavedAt)}` : "Not saved yet";
  const anotherDevice = `To continue on another device, sign in there with ${meta.form.contact.email}.`;
  // the organisation types this pathway offers, as this Deal Room has them; a challenge's two are fixed
  const kinds = mode === "challenge" ? form.challengeKinds : kindsFor(mode).filter((k) => form.providerKinds.includes(k));

  return (
    <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12 xl:gap-16">
      {/* the steps: a list down the side on a wide screen, with where each stands; a row of numbers on a small one */}
      <aside className="hidden lg:block">
        <div className="sticky top-8 space-y-6">
          <nav aria-label="Application steps">
            <ol className="space-y-1">
              {steps.map((k, i) => {
                const miss = k === "review" ? meta.gaps.missing.length : missingIn(k).length;
                const done = k !== "review" && i <= reached && i !== at && miss === 0;
                const status = k === "review" ? (miss ? `${miss} item${miss > 1 ? "s" : ""} still to fill in` : "Ready to submit") : miss ? `${miss} to fill in` : "Complete";
                return (
                  <li key={k} className="relative">
                    {i < steps.length - 1 && <span aria-hidden="true" className="absolute left-[23.5px] top-[40px] h-[calc(100%-26px)] w-px bg-line-strong" />}
                    <button type="button" onClick={() => go(i)} aria-current={i === at ? "step" : undefined} aria-label={`Step ${i + 1}: ${stepLabel(k, mode)}, ${status.toLowerCase()}`} className="group relative flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left">
                      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] ${i === at ? "bg-ink text-white" : done ? "bg-ok text-white" : "bg-line-strong text-ink"}`}>{done ? "✓" : i + 1}</span>
                      <span className="min-w-0">
                        <span className={`block text-[15px] leading-snug ${i === at ? "font-medium text-ink" : "text-ink decoration-line-strong underline-offset-4 group-hover:underline"}`}>{stepLabel(k, mode)}</span>
                        <span className={`mt-0.5 block text-[13px] ${miss && i < at ? "text-bad" : "text-slate"}`}>{status}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="space-y-2 border-t border-line pt-4 text-[13px] text-slate">
            <p role="status" className={save.isError ? "text-bad" : ""}>
              {savedNote}
            </p>
            <p>{anotherDevice}</p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 space-y-5">
        <div className="space-y-4 lg:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-slate">
            <span role="status" className={save.isError ? "text-bad" : ""}>
              {savedNote}
            </span>
            <span>{anotherDevice}</span>
          </div>
          <nav aria-label="Application steps">
            <ol className="flex flex-wrap items-center gap-1.5 text-[14px] sm:gap-2">
              {steps.map((k, i) => {
                const done = k !== "review" && i <= reached && i !== at && missingIn(k).length === 0;
                return (
                  <li key={k} className="flex items-center gap-1.5 sm:gap-2">
                    <button type="button" onClick={() => go(i)} aria-current={i === at ? "step" : undefined} aria-label={`Step ${i + 1}: ${stepLabel(k, mode)}${done ? ", complete" : ""}`} className={`flex items-center gap-2 ${i === at ? "font-medium text-ink" : "text-slate hover:text-ink"}`}>
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] ${i === at ? "bg-ink text-white" : done ? "bg-ok text-white" : "bg-line-strong text-ink"}`}>{done ? "✓" : i + 1}</span>
                      <span className={i === at ? "hidden sm:inline" : "sr-only"}>{stepLabel(k, mode)}</span>
                    </button>
                    {i < steps.length - 1 && <span className="h-px w-3 bg-line-strong sm:w-5" aria-hidden="true" />}
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 text-[14px] sm:hidden">
              <span className="text-slate">
                Step {at + 1} of {steps.length}:
              </span>{" "}
              <span className="font-medium">{stepLabel(cur, mode)}</span>
            </p>
          </nav>
        </div>

        {cur === "org" && (
          <Card title="Your organisation">
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Legal name">
                <input className="input" value={app.org.name} onChange={(e) => up({ org: { ...app.org, name: e.target.value } })} />
              </F>
              {seeker ? (
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
                <F label={mode === "capital" ? "Type of investor" : "Type of organisation"}>
                  <select className="input" value={app.providerKind ?? ""} onChange={(e) => up({ providerKind: (e.target.value || undefined) as ProviderKind | undefined })}>
                    <option value="">Choose</option>
                    {kinds.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </F>
              )}
              <F label={seeker ? "Country" : "Headquarters"}>
                <select className="input" value={app.org.country} onChange={(e) => up({ org: { ...app.org, country: e.target.value } })}>
                  <option value="">Choose</option>
                  {form.countries.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </F>
              {seeker && (
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
        )}

        {cur === "ask" && app.ask && app.traction && (
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

        {cur === "challenge" && app.challenge && <ChallengeFields c={app.challenge} onChange={(challenge) => up({ challenge })} />}

        {cur === "mandate" && app.mandate && <MandateFields app={app} partner={mode === "partner"} sectors={form.sectors} countries={form.countries} onChange={(mandate) => up({ mandate })} />}

        {cur === "people" && (
          <>
            <Card title="The decision-maker">
              <p className="-mt-1 mb-3 text-[13px] text-slate">The person who can commit {seeker ? "the company" : "your organisation"} and who will attend the meetings.</p>
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
                {seeker && (
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
          </>
        )}

        {cur === "docs" && seeker && <Documents slug={slug} form={form} app={meta} />}

        {cur === "review" ? (
          <Card title="Review and submit">
            <ul className="divide-y divide-line">
              {steps
                .filter((k) => k !== "review")
                .map((k) => {
                  const miss = missingIn(k);
                  return (
                    <li key={k} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="text-[15px] font-medium">{stepLabel(k, mode)}</div>
                        <div className={`text-[13px] ${miss.length ? "text-bad" : "text-slate"}`}>{miss.length ? `Missing: ${miss.join(", ")}` : "Complete"}</div>
                      </div>
                      <button type="button" className="link shrink-0 text-[14px]" onClick={() => go(steps.indexOf(k))}>
                        {miss.length ? "Complete it" : "Edit"}
                      </button>
                    </li>
                  );
                })}
            </ul>
            {missingIn("review").length > 0 && <p className="mt-2 text-[13px] text-bad">Also missing: {missingIn("review").join(", ")}.</p>}
            {(tried || submit.isError) && (submit.error || meta.gaps.missing.length > 0) && (
              <div role="alert" className="mt-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
                {submit.error ? submit.error.message : `Still needed before you can submit: ${meta.gaps.missing.join(", ")}.`}
              </div>
            )}
            {meta.gaps.advisory.length > 0 && <p className="mt-3 text-[13px] text-slate">Worth adding, not required: {meta.gaps.advisory.join(", ")}.</p>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] text-slate">
                {mode === "challenge"
                  ? "After you submit, the team verifies your organisation, then matches your challenge with businesses that can solve it."
                  : seeker
                    ? "You get a reference number at once, and the team starts the review."
                    : "After you submit, the team verifies your organisation before matching."}
              </span>
              <button className="btn btn-primary btn-cta" disabled={submit.isPending} onClick={send}>
                {submit.isPending ? "Submitting…" : mode === "challenge" ? "Submit the challenge" : "Submit the application"}
              </button>
            </div>
          </Card>
        ) : (
          missingIn(cur).length > 0 && reached > at && <p className="text-[13px] text-slate">Still to fill in on this step: {missingIn(cur).join(", ")}.</p>
        )}

        <div className="flex items-center justify-between gap-3">
          {at > 0 ? (
            <button type="button" className="btn btn-secondary" onClick={() => go(at - 1)}>
              Back
            </button>
          ) : (
            <span />
          )}
          {cur !== "review" && (
            <button type="button" className="btn btn-primary" onClick={() => go(at + 1)}>
              {steps[at + 1] === "review" ? "Review" : "Next"}
            </button>
          )}
        </div>
      </div>
    </div>
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
