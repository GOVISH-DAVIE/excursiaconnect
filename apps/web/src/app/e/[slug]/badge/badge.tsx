"use client";

/**
 * A Deal Room participant's badge, on the API (backend-plan.md, M2.1), in the participant's frame like their other
 * pages. The emails about it link here; the participant signs in with the email they applied with and sees the
 * badge of each of their applications that holds one: the QR the desk and the doors scan, and where to go first.
 * They correct the name and title on it until the organiser locks them for printing; after that the Deal Room desk
 * does. Printing gives the badge alone, without the page around it.
 */
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import type { BadgeView } from "@excursia/contracts/badge";
import { fmtLong } from "@excursia/domain/time";
import { initials, readableOn } from "@/lib/brand";
import { useSession } from "@/features/auth/hooks/use-session";
import { useBadgeDetails, useMyBadges } from "@/features/badges/hooks/use-badges";
import { Panel, ParticipantPage, Skeleton } from "../deal-room/participant";

export function MyBadge({ slug }: { slug: string }) {
  return (
    <ParticipantPage
      slug={slug}
      page="badge"
      title="Your badge"
      lede="Show its code at the Deal Room desk on your first day. After that, the Deal Room doors open to it for your meetings."
      signIn="Sign in to open your badge"
      wide
    >
      <Body slug={slug} />
    </ParticipantPage>
  );
}

function Body({ slug }: { slug: string }) {
  const session = useSession();
  const q = useMyBadges(slug, true);
  if (q.isPending) return <Skeleton rows={6} />;
  if (q.isError)
    return (
      <Panel title="Your badge didn't load">
        <p className="mb-4 text-[15px] text-slate">{q.error.message}</p>
        <button className="btn-secondary" onClick={() => q.refetch()}>
          Try again
        </button>
      </Panel>
    );
  if (!q.data.length)
    return (
      <Panel title="No badge yet">
        <p className="max-w-[60ch] text-[15px] text-slate">
          Your Deal Room badge comes once your application is approved and any participation fee is paid, or once your organisation is verified. We email you when it is ready. Signed in as {session.data?.user.email}.
        </p>
        <Link href={`/e/${slug}/deal-room/apply`} className="btn-secondary mt-4">
          See your application
        </Link>
      </Panel>
    );
  return (
    <div className="space-y-10">
      {q.data.map((b) => (
        <BadgeBlock key={b.appId} slug={slug} badge={b} />
      ))}
    </div>
  );
}

/** One badge: the card itself, and beside it what to do with it. */
function BadgeBlock({ slug, badge }: { slug: string; badge: BadgeView }) {
  const valid = badge.status === "valid";
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-8 print:block">
      <BadgeCard badge={badge} />
      <div className="min-w-0 space-y-5 print:hidden">
        {valid ? (
          <>
            <Panel title={badge.accredited ? "You are checked in" : "First stop: the Deal Room desk"}>
              <p className="max-w-[60ch] text-[15px] text-slate">
                {badge.accredited
                  ? "The Deal Room doors open to this code for your meetings. Keep it on your phone, or print it."
                  : "Show this code at the desk on your first day; they check you in once. After that, the room doors open to it for your meetings."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-secondary btn-sm" onClick={() => window.print()}>
                  Print or save as PDF
                </button>
                <Link href={`/e/${slug}/deal-room/meetings`} className="btn-quiet btn-sm">
                  See your meetings
                </Link>
              </div>
            </Panel>
            <Details slug={slug} badge={badge} />
          </>
        ) : (
          <Panel title="This badge is revoked">
            <p className="max-w-[60ch] text-[15px] text-slate">It opens no door. The Deal Room team has written to you about the decision behind it; for a question, reply to that email or ask at the Deal Room desk.</p>
          </Panel>
        )}
      </div>
    </div>
  );
}

/** The badge as it is printed and scanned, in the event's colours. */
function BadgeCard({ badge }: { badge: BadgeView }) {
  const brand = badge.event.brand.primary;
  const ink = readableOn(brand);
  const mark = (badge.event.brand.logoText || initials(badge.event.name)).slice(0, 4).toUpperCase();
  const valid = badge.status === "valid";
  const dates = badge.event.startDate === badge.event.endDate ? fmtLong(badge.event.startDate) : `${fmtLong(badge.event.startDate)} to ${fmtLong(badge.event.endDate)}`;
  return (
    <article className="mx-auto w-full max-w-[400px] overflow-hidden rounded-[var(--r-lg)] border border-line bg-white print:break-inside-avoid" aria-label={`Deal Room badge for ${badge.name}`}>
      <header className="flex items-center gap-3 px-5 py-4" style={{ background: brand, color: ink }}>
        <span className="grid size-9 shrink-0 place-items-center rounded-md border text-[11px] font-medium" style={{ borderColor: ink }} aria-hidden="true">
          {mark}
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-medium leading-snug">{badge.event.name}</span>
          <span className="block text-[13px] opacity-85">{dates}</span>
        </span>
      </header>
      <div className="flex items-center justify-between bg-ink px-5 py-2 text-[13px] text-white">
        <span className="font-medium">{badge.category}</span>
        <span className="opacity-80">{badge.tier}</span>
      </div>
      <div className="px-5 py-6 text-center">
        <p className="text-[24px] font-medium leading-tight tracking-[-0.02em] text-balance">{badge.name}</p>
        {badge.jobTitle && <p className="mt-1 text-[15px] text-slate">{badge.jobTitle}</p>}
        <p className="text-[15px]">{badge.organisation}</p>
        {valid ? (
          <>
            <div className="mt-5 inline-block rounded-[var(--r-md)] border border-line bg-white p-3">
              <QRCodeSVG value={badge.code} size={192} level="M" fgColor="#1c1c1e" title={`Badge code ${badge.code}`} />
            </div>
            <p className="mt-2 font-mono text-[15px] tracking-wide">{badge.code}</p>
            <p className="mt-3">
              <span className={`pill ${badge.accredited ? "bg-ok-50 text-ok" : "bg-paper-200 text-slate"}`}>{badge.accredited ? "Checked in" : "Not checked in yet"}</span>
            </p>
          </>
        ) : (
          <p className="mt-5 rounded-[var(--r-sm)] bg-bad-50 px-4 py-3 text-[14px] text-bad">This badge is revoked and opens no door.</p>
        )}
      </div>
      <footer className="border-t border-line bg-paper px-5 py-3 text-[13px] text-slate">
        {badge.event.venue}, {badge.event.city}
        {badge.ref && (
          <>
            {" · "}
            <span className="whitespace-nowrap font-mono">{badge.ref}</span>
          </>
        )}
      </footer>
    </article>
  );
}

/** The name and title printed on the badge: the holder's to correct until they are locked for printing. */
function Details({ slug, badge }: { slug: string; badge: BadgeView }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(badge.name);
  const [jobTitle, setJobTitle] = useState(badge.jobTitle);
  const save = useBadgeDetails(slug, badge.appId);
  if (badge.locked)
    return (
      <Panel title="Name and title">
        <p className="text-[15px] text-slate">Names and titles are locked for printing. To change yours, ask at the Deal Room desk.</p>
      </Panel>
    );
  if (!editing)
    return (
      <Panel
        title="Name and title"
        aside={
          <button
            className="btn-quiet btn-sm"
            onClick={() => {
              setName(badge.name);
              setJobTitle(badge.jobTitle);
              save.reset();
              setEditing(true);
            }}
          >
            Correct them
          </button>
        }
      >
        <p className="text-[15px]">{badge.name}</p>
        <p className="text-[15px] text-slate">{badge.jobTitle || "No job title"}</p>
        <p className="mt-3 text-[13px] text-slate">As printed on your badge. You can correct them until the organiser locks them for printing.</p>
      </Panel>
    );
  return (
    <form
      className="surface grid gap-3 p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ name, jobTitle }, { onSuccess: () => setEditing(false) });
      }}
    >
      <h2 className="h2">Name and title</h2>
      <label className="block">
        <span className="label">Name, as it should be printed</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" required autoFocus />
      </label>
      <label className="block">
        <span className="label">Job title</span>
        <input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={80} autoComplete="organization-title" />
      </label>
      <p className="text-[13px] text-slate">Your organisation&rsquo;s name comes from your application. Your badge code stays the same.</p>
      {save.isError && (
        <p className="rounded-[var(--r-sm)] bg-bad-50 px-3 py-2 text-[14px] text-bad" role="alert">
          {save.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary btn-sm" disabled={save.isPending || name.trim().length < 2}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn-quiet btn-sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
