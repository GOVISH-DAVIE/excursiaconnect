"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { initials, readableOn } from "@/lib/brand";
import { SEEKER_DOCS, formGaps } from "@/lib/dealroom/logic";
import type { Currency, DrApplication, Instrument, ProviderKind, Stage } from "@/lib/dealroom/types";
import { fmtStamp } from "@/lib/time";
import { DocLine, UploadDoc } from "@/app/dealroom/bits";

const INSTRUMENTS: Instrument[] = ["Equity", "Debt", "Mezzanine", "Grant", "Trade finance", "Other"];
const STAGES: Stage[] = ["Bankable project", "Early revenue", "Growth", "Expansion"];
const REVENUE = ["Pre-revenue, contracted offtake", "Under USD 250k", "USD 250k to 1m", "USD 1m to 5m", "USD 5m to 20m", "Over USD 20m"];

function blank(eventId: string, type: "seeker" | "provider", email: string, phone: string, now: string): DrApplication {
  return {
    id: `dr_${type === "seeker" ? "cs" : "fp"}_${now.replace(/\D/g, "").slice(-6)}${Math.floor(Math.random() * 1e5).toString(36)}`,
    eventId,
    type,
    mission: "",
    source: "",
    owner: "st_lead",
    org: { name: "", regNo: "", country: "", sector: "" },
    contact: { name: "", email, phone },
    decisionMaker: { name: "", title: "", email: "", phone: "" },
    ask: type === "seeker" ? { amount: 0, currency: "USD", instrument: "Equity", useOfFunds: "", stage: "Growth" } : undefined,
    traction: type === "seeker" ? { revenueBand: "", customers: "", metrics: "" } : undefined,
    mandate: type === "provider" ? { sectors: [], countries: [], stages: [], ticketMin: 0, ticketMax: 0, currency: "USD", instruments: [], exclusions: [], timeline: "" } : undefined,
    documents: [],
    status: "Draft",
    statusAt: now,
    decisions: [],
    recommendations: [],
    assessments: [],
    readiness: "Not ready",
    rfis: [],
    history: [{ at: now, by: "applicant", what: "Started an application" }],
  };
}

export function Apply({ slug }: { slug: string }) {
  const { state, dispatch, hydrated } = useStore();
  const search = useSearchParams();
  const router = useRouter();
  const event = state.events.find((e) => e.slug === slug);
  const dr = state.dealRoom;
  const cfg = event ? dr.configs[event.id] : undefined;
  const resumeId = search.get("resume");
  const inviteToken = search.get("invite");
  const linked = dr.apps.find((a) => (resumeId && a.id === resumeId) || (inviteToken && a.invite?.token === inviteToken));
  const [pickedType, setType] = useState<"seeker" | "provider">(search.get("type") === "provider" ? "provider" : "seeker");
  const [typed, setWho] = useState<string | null>(null);
  // a resume or invitation link fills these in once the saved state has loaded, so they are derived, not initial state
  const type = linked?.type ?? pickedType;
  const who = typed ?? (linked ? linked.contact.email || linked.contact.phone : "");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [app, setApp] = useState<DrApplication | null>(null);
  const [tried, setTried] = useState(false);
  const first = useRef(true);

  // autosave: the server copy (here, the store) follows the form, so a draft resumes anywhere (PRD Applications req. 5)
  useEffect(() => {
    if (!app) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => dispatch({ type: "dr/saveDraft", app }), 500);
    return () => clearTimeout(t);
  }, [app, dispatch]);

  if (!event || !cfg) return <div className="p-10">This event has no Deal Room.</div>;
  const accent = event.brand.primary;
  const accentInk = readableOn(accent);
  const mark = (event.brand.logoText || initials(event.name)).slice(0, 4).toUpperCase();
  const today = dr.clock.slice(0, 10);
  const closed = event.state !== "Live" || today < cfg.rules.appOpen || today > cfg.rules.appClose;
  const saved = app ? dr.apps.find((a) => a.id === app.id) : undefined;
  const submitted = saved && !["Lead", "Invited", "Draft"].includes(saved.status);

  const signIn = () => {
    const email = who.includes("@") ? who.trim() : "";
    const phone = email ? "" : who.trim();
    const existing =
      linked ?? dr.apps.find((a) => a.eventId === event.id && a.type === type && ["Lead", "Invited", "Draft"].includes(a.status) && (a.contact.email.toLowerCase() === email.toLowerCase() || (!!phone && a.contact.phone === phone)));
    if (existing) {
      first.current = false;
      setType(existing.type);
      setApp({ ...existing, contact: { ...existing.contact, email: existing.contact.email || email, phone: existing.contact.phone || phone } });
      return;
    }
    const a = blank(event.id, type, email, phone, dr.clock);
    if (a.type === "seeker") {
      const sector = search.get("sector");
      const country = search.get("country");
      const instrument = search.get("instrument") as Instrument | null;
      if (sector) a.org.sector = sector;
      if (country) a.org.country = country;
      if (instrument && a.ask) a.ask.instrument = instrument;
    }
    first.current = false;
    setApp(a);
    dispatch({ type: "dr/saveDraft", app: a });
  };

  const gaps = app ? formGaps(saved ?? app, cfg) : { missing: [], advisory: [] };
  const submit = () => {
    if (!app) return;
    setTried(true);
    dispatch({ type: "dr/saveDraft", app });
    if (formGaps(app, cfg).missing.length) return;
    dispatch({ type: "dr/submit", appId: app.id });
    router.push(`/dr/${app.id}`);
  };
  const up = (patch: Partial<DrApplication>) => setApp((a) => (a ? { ...a, ...patch } : a));

  return (
    <div className="min-h-screen bg-paper brand" style={{ "--accent": accent, "--accent-ink": accentInk } as React.CSSProperties}>
      <header className="nav nav--static">
        <div className="wrap nav__bar">
          <Link href={`/e/${slug}/deal-room`} className="nav__logo">
            <span className="mark" style={{ background: accent, color: accentInk, fontSize: mark.length > 2 ? 10 : 13 }} aria-hidden="true">
              {mark}
            </span>
            <span className="nav__name">{event.name} Deal Room</span>
          </Link>
          <Link href={`/e/${slug}/deal-room`} className="link">
            About the Deal Room
          </Link>
        </div>
      </header>

      <main className="wrap wrap--narrow py-10 space-y-5">
        <div>
          <h1 className="h1">{type === "seeker" ? "Apply to raise capital" : "Apply as a finance provider"}</h1>
          <p className="mt-1 text-slate text-[15px]">
            {closed ? "Applications are closed." : `Open until ${fmtStamp(cfg.rules.appClose, false)}. About 20 minutes; it saves as you type.`}
            {linked?.status === "Invited" && " You were invited by the Deal Room team; your details are filled in."}
          </p>
        </div>

        {!hydrated ? null : closed ? (
          <Card>Applications open on {fmtStamp(cfg.rules.appOpen, false)} and close on {fmtStamp(cfg.rules.appClose, false)}.</Card>
        ) : submitted ? (
          <Card>
            This application was submitted as {saved!.ref}.{" "}
            <Link className="link" href={`/dr/${saved!.id}`}>
              See its status
            </Link>
          </Card>
        ) : !app ? (
          <Card title="Sign in with a one-time code">
            {!linked && (
              <div className="dr-toggle mb-4" role="tablist">
                <button role="tab" aria-selected={type === "seeker"} onClick={() => setType("seeker")}>
                  Raising capital
                </button>
                <button role="tab" aria-selected={type === "provider"} onClick={() => setType("provider")}>
                  Providing finance
                </button>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
              <F label="Email or phone">
                <input className="input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="you@company.com or +254…" />
              </F>
              <button className="btn btn-secondary" disabled={!who.trim()} onClick={() => setCodeSent(true)}>
                Send a code
              </button>
            </div>
            {codeSent && (
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] items-end">
                <F label={`Code sent to ${who}`} help="Prototype: the code is 482913.">
                  <input className="input tracking-[0.3em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                </F>
                <button className="btn btn-primary" disabled={code !== "482913"} onClick={signIn}>
                  Continue
                </button>
              </div>
            )}
            <p className="mt-3 text-[13px] text-slate">No password needed. If you started an application before, signing in with the same email or phone brings it back.</p>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-slate">
              <span>{saved?.draftSavedAt ? `Draft saved ${fmtStamp(saved.draftSavedAt)}` : "Not saved yet"}</span>
              <span>
                Continue on another device:{" "}
                <Link className="link" href={`/e/${slug}/deal-room/apply?resume=${app.id}`}>
                  /deal-room/apply?resume={app.id}
                </Link>
              </span>
            </div>

            <Card title="Your organisation">
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="Legal name">
                  <input className="input" value={app.org.name} onChange={(e) => up({ org: { ...app.org, name: e.target.value } })} />
                </F>
                {type === "seeker" ? (
                  <F label="Registration number">
                    <input className="input" value={app.org.regNo} onChange={(e) => up({ org: { ...app.org, regNo: e.target.value } })} />
                  </F>
                ) : (
                  <F label="Type of provider">
                    <select className="input" value={app.providerKind ?? ""} onChange={(e) => up({ providerKind: (e.target.value || undefined) as ProviderKind | undefined })}>
                      <option value="">Choose</option>
                      {cfg.providerKinds.map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </F>
                )}
                <F label={type === "seeker" ? "Country" : "Headquarters"}>
                  <select className="input" value={app.org.country} onChange={(e) => up({ org: { ...app.org, country: e.target.value } })}>
                    <option value="">Choose</option>
                    {cfg.countries.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </F>
                {type === "seeker" && (
                  <F label="Sector">
                    <select className="input" value={app.org.sector} onChange={(e) => up({ org: { ...app.org, sector: e.target.value } })}>
                      <option value="">Choose</option>
                      {cfg.sectors.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </F>
                )}
                <F label="Website" help={cfg.fields["org.website"] === "advisory" ? "Optional" : undefined}>
                  <input className="input" type="url" placeholder="https://" value={app.org.website ?? ""} onChange={(e) => up({ org: { ...app.org, website: e.target.value } })} />
                </F>
                <F label="Your name">
                  <input className="input" value={app.contact.name} onChange={(e) => up({ contact: { ...app.contact, name: e.target.value } })} />
                </F>
                <F label={app.contact.email ? "Your phone" : "Your email"}>
                  {app.contact.email ? (
                    <input className="input" type="tel" value={app.contact.phone} onChange={(e) => up({ contact: { ...app.contact, phone: e.target.value } })} />
                  ) : (
                    <input className="input" type="email" value={app.contact.email} onChange={(e) => up({ contact: { ...app.contact, email: e.target.value } })} />
                  )}
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
                      <input className="input" type="number" min={0} value={app.ask.amount || ""} onChange={(e) => up({ ask: { ...app.ask!, amount: Number(e.target.value) } })} />
                    </div>
                  </F>
                  <F label="Instrument">
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

            {type === "provider" && app.mandate && <MandateFields app={app} sectors={cfg.sectors} countries={cfg.countries} onChange={(mandate) => up({ mandate })} />}

            <Card title="The decision-maker">
              <p className="-mt-1 mb-3 text-[13px] text-slate">The person who can commit {type === "seeker" ? "the company" : "your organisation"} and who will attend the meetings.</p>
              <label className="flex items-center gap-2 text-[14px] mb-3">
                <input type="checkbox" checked={!!app.contact.name && app.decisionMaker.name === app.contact.name} onChange={(e) => up({ decisionMaker: e.target.checked ? { ...app.contact, title: app.decisionMaker.title } : { name: "", title: "", email: "", phone: "" } })} />
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
                  <select className="input" value={app.mission} onChange={(e) => up({ mission: e.target.value })}>
                    <option value="">Choose</option>
                    {cfg.missions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} {m.name}
                      </option>
                    ))}
                  </select>
                </F>
                <F label="How you heard of the Deal Room">
                  <select className="input" value={app.source} onChange={(e) => up({ source: e.target.value })}>
                    <option value="">Choose</option>
                    {cfg.sources.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </F>
              </div>
            </Card>

            {type === "seeker" && (
              <Card title="Documents">
                <p className="-mt-1 mb-2 text-[13px] text-slate">Up to 25 MB each. Nothing is shared with an investor until you consent, per document and per investor.</p>
                {SEEKER_DOCS.map((d) => {
                  const have = app.documents.filter((x) => x.kind === d.kind);
                  return (
                    <div key={d.kind} className="py-2 border-b border-line last:border-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[14px] font-medium">
                          {d.kind}
                          {cfg.fields[d.key] !== "required" && <span className="ml-1 font-normal text-slate">optional</span>}
                        </span>
                        <UploadDoc kind={d.kind} at={dr.clock} label={have.length ? "Add another" : "Upload"} onDone={(doc) => up({ documents: [...app.documents, doc] })} />
                      </div>
                      {have.map((h) => (
                        <DocLine key={h.id} doc={h}>
                          <button className="btn-quiet text-bad" onClick={() => up({ documents: app.documents.filter((x) => x.id !== h.id) })}>
                            Remove
                          </button>
                        </DocLine>
                      ))}
                    </div>
                  );
                })}
              </Card>
            )}

            <div className="surface p-5">
              {tried && gaps.missing.length > 0 && (
                <div role="alert" className="mb-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
                  Still needed before you can submit: {gaps.missing.join(", ")}.
                </div>
              )}
              {gaps.advisory.length > 0 && <p className="mb-3 text-[13px] text-slate">Worth adding, not required: {gaps.advisory.join(", ")}.</p>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px] text-slate">{type === "provider" ? "After you submit, you upload KYC documents and sign the NDA from your status page." : "You get a reference number and a status page at once."}</span>
                <button className="btn btn-primary btn-cta" onClick={submit}>
                  Submit the application
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="surface p-5">
      {title && <h2 className="h2 mb-3">{title}</h2>}
      {children}
    </section>
  );
}

function F({ label, help, span, children }: { label: string; help?: string; span?: boolean; children: ReactNode }) {
  return (
    <label className={`block ${span ? "sm:col-span-2" : ""}`}>
      <span className="label">{label}</span>
      {children}
      {help && <span className="mt-1 block text-[12px] text-slate">{help}</span>}
    </label>
  );
}

function Chips<T extends string>({ all, value, onChange }: { all: readonly T[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((x) => (
        <button type="button" key={x} aria-pressed={value.includes(x)} className={`pill ${value.includes(x) ? "bg-ink text-white" : "bg-paper-200 text-slate"}`} onClick={() => onChange(value.includes(x) ? value.filter((y) => y !== x) : [...value, x])}>
          {x}
        </button>
      ))}
    </div>
  );
}

export function MandateFields({ app, sectors, countries, onChange }: { app: DrApplication; sectors: string[]; countries: string[]; onChange: (m: NonNullable<DrApplication["mandate"]>) => void }) {
  const m = app.mandate!;
  // typed as free text and split on leaving the field, so a comma can be typed
  const [excl, setExcl] = useState(m.exclusions.join(", "));
  return (
    <Card title="Your mandate">
      <div className="grid gap-4">
        <F label="Sectors">
          <Chips all={sectors} value={m.sectors} onChange={(sectors) => onChange({ ...m, sectors })} />
        </F>
        <F label="Countries">
          <Chips all={countries} value={m.countries} onChange={(countries) => onChange({ ...m, countries })} />
        </F>
        <F label="Stages">
          <Chips all={STAGES} value={m.stages} onChange={(stages) => onChange({ ...m, stages })} />
        </F>
        <F label="Instruments">
          <Chips all={INSTRUMENTS} value={m.instruments} onChange={(instruments) => onChange({ ...m, instruments })} />
        </F>
        <div className="grid gap-3 sm:grid-cols-3">
          <F label="Currency">
            <select className="input" value={m.currency} onChange={(e) => onChange({ ...m, currency: e.target.value as Currency })}>
              <option>USD</option>
              <option>KES</option>
            </select>
          </F>
          <F label="Smallest ticket">
            <input className="input" type="number" min={0} value={m.ticketMin || ""} onChange={(e) => onChange({ ...m, ticketMin: Number(e.target.value) })} />
          </F>
          <F label="Largest ticket">
            <input className="input" type="number" min={0} value={m.ticketMax || ""} onChange={(e) => onChange({ ...m, ticketMax: Number(e.target.value) })} />
          </F>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Exclusions" help="Comma-separated, for example coal, tobacco. Optional but checked in matching.">
            <input className="input" value={excl} onChange={(e) => setExcl(e.target.value)} onBlur={() => onChange({ ...m, exclusions: excl.split(",").map((x) => x.trim()).filter(Boolean) })} />
          </F>
          <F label="Typical decision timeline" help="Optional">
            <input className="input" value={m.timeline} placeholder="2 to 3 months" onChange={(e) => onChange({ ...m, timeline: e.target.value })} />
          </F>
        </div>
      </div>
    </Card>
  );
}
