"use client";

/**
 * The business's teaser (M3.1, CS-7): tier 1 of its file, what verified investors and partners see in the directory.
 * Written once the application is approved, with the organisation's name shown or kept back until an introduction;
 * seen only after a reviewer approves it, and again after any change. The same page sets, document by document,
 * whether a counterparty may download it or only view a copy stamped with its name.
 */
import { useState } from "react";
import type { MyProfile } from "@excursia/contracts/matching";
import { fmtStamp } from "@excursia/domain/time";
import { useMyProfile, useTeaserActions } from "@/features/matching/hooks/use-teaser";
import { Panel, ParticipantPage, Teaser } from "../participant";

export function MyTeaserPage({ slug }: { slug: string }) {
  return (
    <ParticipantPage slug={slug} page="teaser" title="My teaser" signIn="Sign in to write your teaser">
      <Body slug={slug} />
    </ParticipantPage>
  );
}

function Body({ slug }: { slug: string }) {
  const q = useMyProfile(slug, true);
  if (q.isPending) return <Panel>Loading…</Panel>;
  if (q.isError) return <Panel>{q.error.message}</Panel>;
  const p = q.data;
  if (!p.app) return <Panel title="Nothing to write yet">{<p className="text-[14px] text-slate">{p.reason}</p>}</Panel>;
  return (
    <>
      <p className="-mt-3 text-[14px] text-slate">
        {p.app.org} · {p.event.name} Deal Room
      </p>
      <Editor key={`${p.app.teaser?.title}|${p.app.teaser?.summary}|${p.app.teaser?.anonymous}`} slug={slug} app={p.app} />
      <Documents slug={slug} app={p.app} />
    </>
  );
}

type App = NonNullable<MyProfile["app"]>;

function where(app: App) {
  if (app.state === "none") return { tone: "bg-warn-50 text-warn", label: "Not written", text: "Investors and partners first see a short teaser. Write it here; the Deal Room team approves it before anyone sees it." };
  if (app.state === "waiting") return { tone: "bg-warn-50 text-warn", label: "Waiting for approval", text: "The Deal Room team checks it before it goes into the directory. We email you once it is approved." };
  if (!app.listed) return { tone: "bg-ok-50 text-ok", label: "Approved", text: "It shows in the directory once the Deal Room team marks you Deal Room Ready." };
  return { tone: "bg-ok-50 text-ok", label: "In the directory", text: `Approved ${fmtStamp(app.approvedAt!)}. Verified investors and partners see it, and can ask the team for an introduction.` };
}

function Editor({ slug, app }: { slug: string; app: App }) {
  const act = useTeaserActions(slug);
  const [title, setTitle] = useState(app.teaser?.title ?? `${app.preview.sector}, ${app.preview.country}`);
  const [summary, setSummary] = useState(app.teaser?.summary ?? "");
  const [anonymous, setAnonymous] = useState(app.teaser?.anonymous ?? true);
  const changed = !app.teaser || title.trim() !== app.teaser.title || summary.trim() !== app.teaser.summary || anonymous !== app.teaser.anonymous;
  const w = where(app);
  return (
    <>
      <Panel title="Your teaser" aside={<span className={`pill whitespace-nowrap ${w.tone}`}>{w.label}</span>}>
        <p className="-mt-1 mb-4 text-[14px] text-slate">
          {w.text}
          {!app.completedAt && app.deadline && ` Due by ${fmtStamp(app.deadline, false)}.`}
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() && summary.trim()) act.save.mutate({ title: title.trim(), summary: summary.trim(), anonymous });
          }}
        >
          <label className="flex items-start gap-2.5 text-[14px]">
            <input type="checkbox" className="mt-1" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            <span>
              Keep our name back until an introduction
              <span className="block text-[12px] text-slate">The directory shows the title below instead of {app.org}.</span>
            </span>
          </label>
          <label className="block">
            <span className="label">{anonymous ? "Title, shown instead of your name" : "Title, for your own reference"}</span>
            <input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Summary: what you do, your traction and what you are looking for</span>
            <textarea className="input min-h-32 leading-relaxed" maxLength={1200} value={summary} onChange={(e) => setSummary(e.target.value)} />
            <span className="mt-1 block text-right text-[12px] text-slate">{summary.length} of 1,200</span>
          </label>
          {act.save.error && (
            <p role="alert" className="rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
              {act.save.error.message}
            </p>
          )}
          <button className="btn btn-primary w-full sm:w-auto" disabled={act.save.isPending || !changed || !title.trim() || !summary.trim()}>
            {act.save.isPending ? "Sending…" : app.state === "none" ? "Send for approval" : "Save and send for approval"}
          </button>
          {app.state === "approved" && changed && <p className="text-[12px] text-slate">A change leaves the directory until the team approves it again.</p>}
        </form>
      </Panel>
      <div>
        <p className="mb-2 text-[13px] font-medium">How the directory shows it</p>
        <Teaser t={{ ...app.preview, title: anonymous ? title.trim() : app.org, named: !anonymous, summary: summary.trim() }} />
      </div>
    </>
  );
}

function Documents({ slug, app }: { slug: string; app: App }) {
  const act = useTeaserActions(slug);
  if (!app.documents.length) return null;
  return (
    <Panel title="Your documents">
      <p className="-mt-1 mb-3 text-[14px] text-slate">
        No one sees a document until you share it with a named investor or partner, after you both accept an introduction. Here you choose how they may open it.
      </p>
      {act.download.error && (
        <p role="alert" className="mb-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
          {act.download.error.message}
        </p>
      )}
      <ul className="border-t border-line">
        {app.documents.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line py-2.5 last:border-0">
            <span className="min-w-0 text-[14px]">
              {d.kind}
              <span className="block truncate text-[12px] text-slate">{d.name}</span>
              <span className={`block text-[12px] ${!d.stamped && !d.download ? "text-bad" : "text-slate"}`}>
                {d.stamped
                  ? d.download
                    ? "Opens as a copy stamped with their name; may be downloaded"
                    : "View only, as a copy stamped with their name"
                  : d.download
                    ? "Can't be stamped: shared as a download"
                    : "Can't be stamped, and downloads are off: they can't open it"}
              </span>
            </span>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={d.download} disabled={act.download.isPending} onChange={(e) => act.download.mutate({ docId: d.id, download: e.target.checked })} />
              Allow downloads
            </label>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
