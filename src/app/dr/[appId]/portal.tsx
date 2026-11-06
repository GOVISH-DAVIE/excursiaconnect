"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { initials, readableOn } from "@/lib/brand";
import { askBand, compact, decisionOf, matchStage, missionName, openConditions, openRfi, profileDeadline, publicStatus, qualified, rfiDue } from "@/lib/dealroom/logic";
import type { DrApplication, DrDocument, Instrument, KycItem } from "@/lib/dealroom/types";
import { fmtStamp } from "@/lib/time";
import { ApplicantStatus, DocLine, UploadDoc } from "@/app/dealroom/bits";
import { MandateFields } from "@/app/e/[slug]/deal-room/apply/apply";
import { AccessLog, Directory, Introductions, Meetings } from "./deals";

/*
  The participant's own page: what they applied with, where it stands, what is asked of them.
  An applicant sees only their own record here (PRD Confidentiality req. 1); the directory and
  introductions open from this page once the participant is verified or Deal Room Ready.
*/

type Tab = "Status" | "Profile" | "Directory" | "Introductions" | "Meetings" | "Documents" | "Access log" | "Verification" | "Mandate" | "Messages";
const INSTRUMENTS: Instrument[] = ["Equity", "Debt", "Mezzanine", "Grant", "Trade finance", "Other"];

export function Portal({ id }: { id: string }) {
  const { state, hydrated } = useStore();
  const dr = state.dealRoom;
  const app = dr.apps.find((a) => a.id === id);
  const [tab, setTab] = useState<Tab>("Status");
  if (!app) return <div className="p-10 text-slate">{hydrated ? "No application here. Check the link in your email." : "Loading…"}</div>;
  const event = state.events.find((e) => e.id === app.eventId)!;
  const accent = event.brand.primary;
  const accentInk = readableOn(accent);
  const mark = (event.brand.logoText || initials(event.name)).slice(0, 4).toUpperCase();
  const mine = dr.matches.filter((m) => m.intro && (m.seekerId === app.id || m.providerId === app.id));
  const verified = app.verification?.state === "Verified";
  const tabs: Tab[] =
    app.type === "seeker"
      ? ["Status", ...(qualified(app) ? (["Profile", "Introductions", "Meetings"] as Tab[]) : []), "Documents", ...(qualified(app) ? (["Access log"] as Tab[]) : []), "Messages"]
      : ["Status", ...(verified ? (["Directory", "Introductions", "Meetings"] as Tab[]) : []), "Verification", "Mandate", "Messages"];
  const waiting = mine.filter((m) => !m.intro![app.type] && matchStage(m, dr.configs[app.eventId], dr.clock) === "Introduced").length;
  const messages = dr.outbox.filter((m) => m.to === app.id).length;

  return (
    <div className="min-h-screen bg-paper brand" style={{ "--accent": accent, "--accent-ink": accentInk } as React.CSSProperties}>
      <header style={{ background: accent, color: accentInk }}>
        <div className="mx-auto max-w-3xl px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="mark shrink-0" style={{ background: accentInk, color: accent, fontSize: mark.length > 2 ? 10 : 13 }} aria-hidden="true">
              {mark}
            </span>
            <div className="min-w-0">
              <div className="text-[13px] opacity-80 truncate">{event.name} Deal Room</div>
              <div className="font-medium truncate">{app.org.name || "Your application"}</div>
            </div>
          </div>
          <ApplicantStatus app={app} />
        </div>
        <nav className="mx-auto max-w-3xl px-3 flex gap-1 overflow-x-auto" aria-label="Sections">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-2.5 text-[14px] whitespace-nowrap border-b-2 ${tab === t ? "border-current font-medium" : "border-transparent opacity-75"}`}>
              {t}
              {t === "Messages" && messages > 0 && <span className="ml-1 opacity-70">{messages}</span>}
              {t === "Introductions" && waiting > 0 && <span className="ml-1 opacity-70">{waiting}</span>}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-6 space-y-4">
        {tab === "Status" && <Status app={app} />}
        {tab === "Profile" && <Profile app={app} />}
        {tab === "Directory" && <Directory app={app} />}
        {tab === "Introductions" && <Introductions app={app} />}
        {tab === "Meetings" && <Meetings app={app} />}
        {tab === "Documents" && <Documents app={app} />}
        {tab === "Access log" && <AccessLog app={app} />}
        {tab === "Verification" && <Verification app={app} />}
        {tab === "Mandate" && <Mandate app={app} />}
        {tab === "Messages" && <Messages app={app} />}
      </main>
    </div>
  );
}

function Card({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="surface p-5">
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          {title && <h2 className="h2">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------- status, requests, decision (CS-4, CS-5, CS-6) ---------- */

function Status({ app }: { app: DrApplication }) {
  const { state } = useStore();
  const dr = state.dealRoom;
  const cfg = dr.configs[app.eventId];
  const event = state.events.find((e) => e.id === app.eventId)!;
  const d = decisionOf(app);
  const rfi = openRfi(app);
  const dl = app.type === "seeker" && qualified(app) && !app.profileCompletedAt ? profileDeadline(app, cfg) : undefined;
  const steps =
    app.type === "seeker"
      ? [
          ["Submitted", !!app.ref],
          ["In review", !!app.firstReviewAt],
          ["Decided", app.status === "Decided"],
          ["Profile completed", !!app.profileCompletedAt],
          ["Deal Room Ready", app.readiness === "Deal Room Ready" && qualified(app)],
        ]
      : [
          ["Submitted", !!app.ref],
          ["KYC and NDA", !!app.verification?.nda && Object.keys(app.verification.kyc).length === 3],
          ["Verified", app.verification?.state === "Verified"],
        ];
  const badge = app.delegateId && state.delegates.find((x) => x.id === app.delegateId);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-[13px] text-slate">{app.ref ? `Reference ${app.ref}` : "Not submitted yet"}</div>
            <div className="mt-1 text-[22px] font-medium tracking-[-0.02em]">{publicStatus(app)}</div>
          </div>
          <div className="text-[13px] text-slate text-right">
            Last change {fmtStamp(app.statusAt)}
            <div>
              {app.type === "seeker" ? "Capital seeker" : app.providerKind} · {missionName(cfg, app.mission) || "no mission yet"}
            </div>
          </div>
        </div>
        {/* a row of steps from 640px; a short list on a phone, where five labels cannot sit side by side */}
        <ol className="dr-track mt-4 grid gap-2" style={{ "--n": steps.length } as React.CSSProperties}>
          {steps.map(([label, done]) => (
            <li key={label as string} className="flex items-center gap-2 text-[13px] sm:block sm:text-[12px]">
              <span className={`block h-1.5 w-6 shrink-0 rounded-full sm:w-auto ${done ? "bg-ok" : "bg-paper-200"}`} />
              <span className={`block sm:mt-1.5 ${done ? "text-ink" : "text-slate"}`}>{label}</span>
            </li>
          ))}
        </ol>
      </Card>

      {["Lead", "Invited", "Draft"].includes(app.status) && (
        <Card title="Finish your application">
          <p className="text-[14px] text-slate">Nothing is reviewed until you submit. Applications close {fmtStamp(cfg.rules.appClose, false)}.</p>
          <Link className="btn-primary mt-3 inline-flex" href={`/e/${event.slug}/deal-room/apply?${app.invite ? `invite=${app.invite.token}` : `resume=${app.id}`}`}>
            Continue the application
          </Link>
        </Card>
      )}

      {rfi && <RfiResponse app={app} due={rfiDue(rfi, cfg)} />}

      {app.reReview && <Card title="Your change is being reviewed">You changed {app.reReview.fields.map((f) => f.split(".")[1]).join(", ")} on {fmtStamp(app.reReview.at)}. Your {app.type === "seeker" ? "approval" : "verification"} stands meanwhile; no introductions are made until the review is done.</Card>}

      {app.type === "seeker" && d && (
        <Card title="The decision">
          <p className="text-[15px]">
            <b className="font-medium">{d.decision}.</b> {d.reason}
          </p>
          {d.decision === "Waitlisted" && <p className="mt-2 text-[14px] text-slate">The Deal Room team can reopen your application if a place is released. You will hear by email and SMS.</p>}
          {d.conditions.length > 0 && (
            <ul className="mt-3 space-y-2">
              {d.conditions.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-md bg-paper px-3 py-2 text-[14px]">
                  <span>
                    {c.text} <span className="text-slate">· by {fmtStamp(c.due, false)}</span>
                  </span>
                  <span className={`pill ${c.met ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn"}`}>{c.met ? "Met" : "Open"}</span>
                </li>
              ))}
            </ul>
          )}
          {openConditions(app).length > 0 && <p className="mt-2 text-[13px] text-slate">Send what is needed from the Documents tab; the reviewer marks each condition met.</p>}
        </Card>
      )}

      {dl && (
        <Card title="Complete your matching profile">
          <p className="text-[14px]">
            Due {fmtStamp(dl, false)}
            {dl < dr.clock.slice(0, 10) ? ", now overdue" : ""}. Investors see a short teaser first; write it on the Profile tab.
          </p>
        </Card>
      )}

      {badge && (
        <Card title="Your summit badge">
          <p className="text-[14px] text-slate">Issued with your {app.type === "seeker" ? "approval" : "verification"}. Show it at the Deal Room desk to check in for your meetings.</p>
          <Link className="btn-secondary mt-3 inline-flex" href={`/badge/${badge.id}`}>
            Open my badge, {badge.badgeCode}
          </Link>
        </Card>
      )}
    </>
  );
}

function RfiResponse({ app, due }: { app: DrApplication; due: string }) {
  const { state, dispatch } = useStore();
  const rfi = openRfi(app)!;
  const [text, setText] = useState("");
  const [docs, setDocs] = useState<DrDocument[]>([]);
  const now = state.dealRoom.clock;
  return (
    <Card title="The Deal Room team asked for information" aside={<span className={`pill ${due < now ? "bg-bad-50 text-bad" : "bg-warn-50 text-warn"}`}>Reply by {fmtStamp(due, false)}</span>}>
      <ol className="list-decimal pl-5 space-y-1 text-[15px]">
        {rfi.questions.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ol>
      {rfi.docs.length > 0 && (
        <div className="mt-3 space-y-2">
          {rfi.docs.map((k) => (
            <div key={k} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
              <span>{k}</span>
              <UploadDoc kind={k} at={now} onDone={(d) => setDocs([...docs, d])} />
            </div>
          ))}
          {docs.map((d) => (
            <DocLine key={d.id} doc={d} />
          ))}
        </div>
      )}
      <textarea className="input mt-3 min-h-24" placeholder="Your answer" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn-primary mt-3" disabled={!text.trim()} onClick={() => dispatch({ type: "dr/respondRfi", appId: app.id, text, docs })}>
        Send the answer
      </button>
    </Card>
  );
}

/* ---------- the matching profile and teaser (CS-7) ---------- */

function Profile({ app }: { app: DrApplication }) {
  const { state, dispatch } = useStore();
  const cfg = state.dealRoom.configs[app.eventId];
  const [ask, setAsk] = useState(app.ask!);
  const [traction, setTraction] = useState(app.traction ?? { revenueBand: "", customers: "", metrics: "" });
  const [teaser, setTeaser] = useState(app.teaser ?? { title: `${app.org.sector}, ${app.org.country}`, summary: "", anonymous: true });
  const [saved, setSaved] = useState(false);
  const askChanged = ask.amount !== app.ask!.amount || ask.currency !== app.ask!.currency || ask.instrument !== app.ask!.instrument;
  const dl = profileDeadline(app, cfg);
  const save = () => {
    dispatch({ type: "dr/updateProfile", appId: app.id, patch: { ask, traction, teaser } });
    setSaved(true);
  };
  return (
    <>
      <Card title="Your teaser" aside={app.teaser?.approved ? <span className="pill bg-ok-50 text-ok">Approved</span> : app.teaser ? <span className="pill bg-warn-50 text-warn">Waiting for the team</span> : null}>
        <p className="-mt-1 mb-3 text-[13px] text-slate">The only thing verified investors see before an introduction: a title, one paragraph, your sector, country, the size of the ask and the instrument.</p>
        <label className="block">
          <span className="label">Title</span>
          <input className="input" value={teaser.title} onChange={(e) => setTeaser({ ...teaser, title: e.target.value })} />
        </label>
        <label className="block mt-3">
          <span className="label">Summary, one paragraph</span>
          <textarea className="input min-h-24" value={teaser.summary} onChange={(e) => setTeaser({ ...teaser, summary: e.target.value })} />
        </label>
        <label className="mt-3 flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={teaser.anonymous} onChange={(e) => setTeaser({ ...teaser, anonymous: e.target.checked })} />
          Keep my organisation&apos;s name hidden until an introduction
        </label>
        <div className="mt-3 rounded-lg border border-line p-3 text-[14px]">
          <div className="text-[12px] text-slate">
            {app.org.sector} · {app.org.country} · {askBand(ask.amount)} · {ask.instrument}
          </div>
          <div className="mt-1 font-medium">{teaser.anonymous ? teaser.title : app.org.name}</div>
          <p className="mt-1">{teaser.summary || <span className="text-slate">Your summary</span>}</p>
        </div>
      </Card>
      <Card title="The ask and traction">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">Amount</span>
            <input className="input" type="number" value={ask.amount} onChange={(e) => setAsk({ ...ask, amount: Number(e.target.value) })} />
          </label>
          <label className="block">
            <span className="label">Currency</span>
            <select className="input" value={ask.currency} onChange={(e) => setAsk({ ...ask, currency: e.target.value as "USD" | "KES" })}>
              <option>USD</option>
              <option>KES</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Instrument</span>
            <select className="input" value={ask.instrument} onChange={(e) => setAsk({ ...ask, instrument: e.target.value as Instrument })}>
              {INSTRUMENTS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-3">
            <span className="label">Key metrics</span>
            <input className="input" value={traction.metrics} onChange={(e) => setTraction({ ...traction, metrics: e.target.value })} />
          </label>
        </div>
        {askChanged && <p className="mt-2 text-[13px] text-warn">Changing the amount, currency or instrument sends your application back for review. Your approval stands while it is reviewed, but no introductions are made.</p>}
        <p className="mt-2 text-[13px] text-slate">Approved for {compact(app.ask!.amount, app.ask!.currency)} {app.ask!.instrument.toLowerCase()}.</p>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={save}>
          Save the profile
        </button>
        {!app.profileCompletedAt ? (
          <button className="btn-secondary" disabled={!app.teaser?.title || !app.teaser.summary} onClick={() => dispatch({ type: "dr/completeProfile", appId: app.id })}>
            Mark my profile complete
          </button>
        ) : (
          <span className="text-[14px] text-ok">Completed {fmtStamp(app.profileCompletedAt)}</span>
        )}
        {saved && <span className="text-[13px] text-slate">Saved.</span>}
        {!app.profileCompletedAt && dl && <span className="text-[13px] text-slate">Due {fmtStamp(dl, false)}</span>}
      </div>
    </>
  );
}

function Documents({ app }: { app: DrApplication }) {
  const { state, dispatch } = useStore();
  const now = state.dealRoom.clock;
  return (
    <Card title={`Your documents, ${app.documents.length}`} aside={<UploadDoc kind="Other" at={now} label="Add a document" onDone={(doc) => dispatch({ type: "dr/addDoc", appId: app.id, doc })} />}>
      {app.documents.map((d) => (
        <DocLine key={d.id} doc={d} />
      ))}
      <p className="mt-3 text-[13px] text-slate">No investor sees any of these until you consent, per document and per investor, when you are introduced. You will see who opened what.</p>
    </Card>
  );
}

/* ---------- finance provider: KYC, NDA, mandate (FP-2, FP-3, FP-4) ---------- */

function Verification({ app }: { app: DrApplication }) {
  const { state, dispatch } = useStore();
  const now = state.dealRoom.clock;
  const v = app.verification;
  const [name, setName] = useState(app.decisionMaker.name);
  const [title, setTitle] = useState(app.decisionMaker.title);
  const [agree, setAgree] = useState(false);
  const items: { k: KycItem; doc: DrDocument["kind"] }[] = [
    { k: "Registration", doc: "Registration certificate" },
    { k: "Beneficial owners", doc: "Beneficial owners" },
    { k: "Signatory ID", doc: "Signatory ID" },
  ];
  if (!app.ref) return <Card>Submit your application first; verification follows.</Card>;
  return (
    <>
      <Card title="Know-your-customer documents" aside={<span className={`pill ${v?.state === "Verified" ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn"}`}>{v?.state ?? "Not started"}</span>}>
        {items.map(({ k, doc }) => {
          const item = v?.kyc[k];
          const d = item && app.documents.find((x) => x.id === item.docId);
          return (
            <div key={k} className="py-2.5 border-b border-line last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                <span className="font-medium">{k}</span>
                {item?.checked ? <span className="pill bg-ok-50 text-ok">Checked</span> : <UploadDoc kind={doc} at={now} label={item ? "Replace" : "Upload"} onDone={(dd) => dispatch({ type: "dr/kyc", appId: app.id, item: k, doc: dd })} />}
              </div>
              {d && <div className="text-[12px] text-slate mt-1">{d.name}, {fmtStamp(d.at)}{item?.checked ? "" : ", waiting for the reviewer"}</div>}
            </div>
          );
        })}
        <p className="mt-3 text-[13px] text-slate">The reviewer also runs a sanctions screening. Once everything is checked and the NDA is signed, you are verified and the teaser directory opens.</p>
      </Card>
      <Card title="Non-disclosure agreement" aside={v?.nda ? <span className="pill bg-ok-50 text-ok">Signed</span> : null}>
        {v?.nda ? (
          <p className="text-[14px]">
            {v.nda.version}, signed by {v.nda.name}, {v.nda.title}, {fmtStamp(v.nda.at)}. One NDA covers every opportunity in this Deal Room.
          </p>
        ) : (
          <>
            <p className="text-[14px] text-slate">One agreement covering every opportunity you see in the {state.events.find((e) => e.id === app.eventId)?.name} Deal Room. Version CA3-NDA v1.2.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Full name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">Title</span>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              I sign for {app.org.name} and accept the agreement
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button className="btn-primary" disabled={!agree || !name.trim() || !title.trim()} onClick={() => dispatch({ type: "dr/signNda", appId: app.id, name, title })}>
                Sign the NDA
              </button>
              <span className="text-[13px] text-slate">or</span>
              <UploadDoc kind="Signed NDA" at={now} label="Upload a signed PDF" onDone={(d) => name.trim() && title.trim() && dispatch({ type: "dr/signNda", appId: app.id, name, title, uploaded: d })} />
            </div>
          </>
        )}
      </Card>
    </>
  );
}

function Mandate({ app }: { app: DrApplication }) {
  const { state, dispatch } = useStore();
  const cfg = state.dealRoom.configs[app.eventId];
  const [draft, setDraft] = useState<DrApplication>(app);
  const [saved, setSaved] = useState(false);
  if (!app.mandate) return <Card>Your mandate is filled in with the application.</Card>;
  const material = JSON.stringify([draft.mandate!.ticketMin, draft.mandate!.ticketMax, draft.mandate!.sectors, draft.mandate!.exclusions, draft.mandate!.instruments]) !== JSON.stringify([app.mandate.ticketMin, app.mandate.ticketMax, app.mandate.sectors, app.mandate.exclusions, app.mandate.instruments]);
  return (
    <>
      <MandateFields app={draft} sectors={cfg.sectors} countries={cfg.countries} onChange={(mandate) => setDraft({ ...draft, mandate })} />
      {app.caps && <p className="text-[13px] text-slate">Your meeting caps, set at onboarding: {app.caps.perDay} a day, {app.caps.perEvent} in all.</p>}
      {material && app.status === "Decided" && <p className="text-[13px] text-warn">A change to ticket size, sectors, instruments or exclusions goes back to the reviewer. You stay verified meanwhile.</p>}
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={() => { dispatch({ type: "dr/updateProfile", appId: app.id, patch: { mandate: draft.mandate } }); setSaved(true); }}>
          Save the mandate
        </button>
        {saved && <span className="text-[13px] text-slate">Saved.</span>}
      </div>
    </>
  );
}

function Messages({ app }: { app: DrApplication }) {
  const { state } = useStore();
  const msgs = state.dealRoom.outbox.filter((m) => m.to === app.id);
  return (
    <Card title="Emails and texts sent to you">
      {msgs.length === 0 ? (
        <p className="text-[14px] text-slate">None yet.</p>
      ) : (
        <ul>
          {msgs.map((m) => (
            <li key={m.id} className="py-2.5 border-b border-line last:border-0 text-[14px]">
              <div className="flex justify-between gap-3 text-[12px] text-slate">
                <span>{m.channel}</span>
                <span>{fmtStamp(m.at)}</span>
              </div>
              <div>{m.subject}</div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[13px] text-slate">Messages say what changed and link here; they never carry your details or documents.</p>
    </Card>
  );
}

