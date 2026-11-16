"use client";

/**
 * A Deal Room participant's badge, on the API (backend-plan.md, M2.1). The emails about it link here; the
 * participant signs in with the email they applied with, as they did to apply, and sees the badge of each of their
 * applications that holds one: the QR the desk and the doors scan, and where to go first. They correct the name and
 * title on it until the organiser locks them for printing; after that the Deal Room desk does.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import type { BadgeView } from "@excursia/contracts/badge";
import { fmtLong } from "@excursia/domain/time";
import { initials, readableOn } from "@/lib/brand";
import { useSession } from "@/features/auth/hooks/use-session";
import { useSignOut } from "@/features/auth/hooks/use-sign-in";
import { useBadgeDetails, useMyBadges } from "@/features/badges/hooks/use-badges";

export function MyBadge({ slug }: { slug: string }) {
  const router = useRouter();
  const session = useSession();
  const participant = session.data?.user.kind === "participant";
  const badges = useMyBadges(slug, participant);
  const signOut = useSignOut();
  const here = `/e/${slug}/badge`;

  let body: React.ReactNode;
  if (session.isPending || (participant && badges.isPending)) body = <Panel>Loading…</Panel>;
  else if (!session.data)
    body = (
      <Panel title="Sign in to open your badge">
        <p className="mb-4 text-[14px] text-slate">Use the email you applied with. We email you a six-digit code; no password needed.</p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => router.push(`/signin?next=${encodeURIComponent(here)}`)}>
          Sign in with your email
        </button>
      </Panel>
    );
  else if (!participant)
    body = (
      <Panel>
        <p className="mb-4 text-[15px]">You are signed in with a staff account. To open your own badge, sign out and sign in with the email you applied with.</p>
        <button className="btn btn-secondary" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          Sign out
        </button>
      </Panel>
    );
  else if (badges.isError) body = <Panel>{badges.error.message}</Panel>;
  else if (!badges.data?.length)
    body = (
      <Panel title="No badge yet">
        <p className="text-[14px] text-slate">
          A Deal Room badge comes once your application is approved and any participation fee is paid, or once your organisation is verified. Signed in as {session.data.user.email}.
        </p>
        <Link href={`/e/${slug}/deal-room/apply`} className="link mt-3 inline-block text-[14px]">
          See my application
        </Link>
      </Panel>
    );
  else body = badges.data.map((b) => <Badge key={b.appId} slug={slug} badge={b} />);

  return (
    <div className="min-h-screen bg-paper print:bg-white">
      <main className="mx-auto max-w-md space-y-5 px-4 py-8 print:max-w-none print:p-0">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <h1 className="h2">My Deal Room badge</h1>
          <Link href={`/e/${slug}/deal-room/apply`} className="link text-[14px]">
            My application
          </Link>
        </div>
        {body}
      </main>
    </div>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="surface p-5">
      {title && <h2 className="h2 mb-3">{title}</h2>}
      {children}
    </section>
  );
}

function Badge({ slug, badge }: { slug: string; badge: BadgeView }) {
  const brand = badge.event.brand.primary;
  const ink = readableOn(brand);
  const mark = (badge.event.brand.logoText || initials(badge.event.name)).slice(0, 4).toUpperCase();
  const valid = badge.status === "valid";
  const dates = badge.event.startDate === badge.event.endDate ? fmtLong(badge.event.startDate) : `${fmtLong(badge.event.startDate)} to ${fmtLong(badge.event.endDate)}`;
  return (
    <div className="space-y-4 print:break-inside-avoid">
      <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm print:shadow-none" aria-label={`Deal Room badge for ${badge.name}`}>
        <header className="flex items-center gap-3 px-5 py-4" style={{ background: brand, color: ink }}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border text-[11px] font-semibold" style={{ borderColor: ink }} aria-hidden="true">
            {mark}
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-medium leading-snug">{badge.event.name}</span>
            <span className="block text-[13px] opacity-80">{dates}</span>
          </span>
        </header>
        <div className="flex items-center justify-between bg-ink px-5 py-2 text-[13px] text-white">
          <span className="font-medium">{badge.category}</span>
          <span className="opacity-80">{badge.tier}</span>
        </div>
        <div className="p-5 text-center">
          <div className="text-2xl font-medium tracking-tight">{badge.name}</div>
          {badge.jobTitle && <div className="text-[15px] text-slate">{badge.jobTitle}</div>}
          <div className="text-[15px]">{badge.organisation}</div>
          {valid ? (
            <>
              <div className="mt-5 inline-block rounded-xl border border-line bg-white p-3">
                <QRCodeSVG value={badge.code} size={192} level="M" fgColor="#1c1c1e" title={`Badge code ${badge.code}`} />
              </div>
              <div className="mt-2 font-mono text-[15px] tracking-wide">{badge.code}</div>
              <div className="mt-3">
                <span className={`pill ${badge.accredited ? "bg-ok-50 text-ok" : "bg-paper-200 text-slate"}`}>{badge.accredited ? "Accredited" : "Not yet accredited"}</span>
              </div>
            </>
          ) : (
            <p className="mt-5 rounded-lg bg-bad-50 px-4 py-3 text-[14px] text-bad">
              This badge is revoked and opens no door. The Deal Room team has written to you about the decision behind it.
            </p>
          )}
        </div>
        <footer className="border-t border-line bg-paper px-5 py-3 text-[13px] text-slate">
          {badge.event.venue}, {badge.event.city}
          {badge.ref && (
            <>
              {" · "}
              <span className="font-mono">{badge.ref}</span>
            </>
          )}
        </footer>
      </article>

      {valid && (
        <div className="space-y-4 print:hidden">
          {!badge.accredited && (
            <section className="rounded-xl border border-line bg-white px-4 py-3 text-[14px]">
              <div className="font-medium">First stop: the Deal Room desk</div>
              <p className="mt-1 text-slate">Show this code at the desk on your first day. The desk checks you in once; after that, the room doors open to it for your meetings.</p>
            </section>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-secondary" onClick={() => window.print()}>
              Print or save as PDF
            </button>
            <Link href={`/e/${slug}/deal-room/apply`} className="btn btn-secondary">
              My application
            </Link>
          </div>
          <Details slug={slug} badge={badge} />
        </div>
      )}
    </div>
  );
}

/** The name and title printed on the badge: the holder's to correct until they are locked for printing. */
function Details({ slug, badge }: { slug: string; badge: BadgeView }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(badge.name);
  const [jobTitle, setJobTitle] = useState(badge.jobTitle);
  const save = useBadgeDetails(slug, badge.appId);
  if (badge.locked) return <p className="text-[14px] text-slate">Names and titles are locked for printing. To change yours, ask at the Deal Room desk.</p>;
  if (!editing)
    return (
      <button
        className="link text-[14px]"
        onClick={() => {
          setName(badge.name);
          setJobTitle(badge.jobTitle);
          save.reset();
          setEditing(true);
        }}
      >
        Correct the name or title on my badge
      </button>
    );
  return (
    <form
      className="surface grid gap-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ name, jobTitle }, { onSuccess: () => setEditing(false) });
      }}
    >
      <h2 className="h2">The name and title on your badge</h2>
      <label className="block">
        <span className="label">Name, as it should be printed</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" required />
      </label>
      <label className="block">
        <span className="label">Job title</span>
        <input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={80} autoComplete="organization-title" />
      </label>
      <p className="text-[13px] text-slate">Your organisation&rsquo;s name comes from your application. Your badge code stays the same.</p>
      {save.isError && <p className="text-[14px] text-bad" role="alert">{save.error.message}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={save.isPending || name.trim().length < 2}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
