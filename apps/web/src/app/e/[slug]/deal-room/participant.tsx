"use client";

/**
 * The frame of a Deal Room participant's own pages: the event's mark and name, who is signed in, and one simple
 * navigation between the pages that apply to them. On a big screen the pages are tabs under the header; on a phone
 * they sit in a bar at the foot of the screen, under the thumb. A page that has nothing for this participant yet
 * (introductions before approval, the directory for a business) isn't offered at all.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { MyApplications } from "@excursia/contracts/apply";
import type { TeaserCard } from "@excursia/contracts/matching";
import { Wordmark } from "@/components/ui";
import { initials, readableOn } from "@/lib/brand";
import { useApplyForm, useMyApplications } from "@/features/apply/hooks/use-apply";
import { useSession } from "@/features/auth/hooks/use-session";
import { useSignOut } from "@/features/auth/hooks/use-sign-in";
import { useIntroductions } from "@/features/matching/hooks/use-introductions";
import { useMyMeetings } from "@/features/meetings/hooks/use-my-meetings";

/** The participant's pages; the badge sits beside them, reached from the application and the meetings. */
export type ParticipantPath = "apply" | "introductions" | "meetings" | "teaser" | "directory" | "badge";

/** A titled block of a participant page. */
export function Panel({ title, children, aside, id }: { title?: string; children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <section className="surface p-5 sm:p-6" id={id} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          {title && (
            <h2 className="h2" id={id ? `${id}-title` : undefined}>
              {title}
            </h2>
          )}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** A placeholder shaped like the content it stands for, while it loads. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="surface p-5 sm:p-6" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-40 animate-pulse rounded bg-paper-200" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="mt-4 h-3 animate-pulse rounded bg-paper-200" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

type NavItem = { path: ParticipantPath; label: string; count: number };

/** The pages this participant has, by what their applications are: each only once it has something to show. */
function navFor(apps: MyApplications | undefined, counts: { introductions: number; meetings: number }): NavItem[] {
  const list = apps ?? [];
  const admitted = list.filter((a) => a.admitted);
  const items: NavItem[] = [{ path: "apply", label: "Application", count: 0 }];
  if (admitted.length) items.push({ path: "introductions", label: "Introductions", count: counts.introductions }, { path: "meetings", label: "Meetings", count: counts.meetings });
  if (admitted.some((a) => a.mode === "seeker")) items.push({ path: "teaser", label: "Teaser", count: 0 });
  if (admitted.some((a) => a.mode !== "seeker")) items.push({ path: "directory", label: "Directory", count: 0 });
  return items;
}

/**
 * A participant page: the frame, the page's title and line, then its body once a participant is signed in. With an
 * `aside`, a big screen sets it in a column beside the body; a phone puts it after.
 */
export function ParticipantPage({
  slug,
  page,
  title,
  lede,
  signIn,
  aside,
  narrow = false,
  wide = false,
  children,
}: {
  slug: string;
  page: ParticipantPath;
  title: string;
  lede?: ReactNode;
  signIn: string;
  aside?: ReactNode;
  narrow?: boolean;
  /** the page's full width, for a body that sets its own columns */
  wide?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const session = useSession();
  const signOut = useSignOut();
  const participant = session.data?.user.kind === "participant";
  const here = `/e/${slug}/deal-room/${page}`;

  let body: ReactNode;
  if (session.isPending) body = <Skeleton />;
  else if (!session.data)
    body = (
      <Panel title={signIn}>
        <p className="mb-4 max-w-[60ch] text-[15px] text-slate">Use the email you applied with. We send you a six-digit code; there is no password.</p>
        <button className="btn-primary w-full sm:w-auto" onClick={() => router.push(`/signin?next=${encodeURIComponent(here)}`)}>
          Sign in with your email
        </button>
      </Panel>
    );
  else if (!participant)
    body = (
      <Panel title="You are signed in with a staff account">
        <p className="mb-4 max-w-[60ch] text-[15px] text-slate">Your own Deal Room pages open with the email you applied with. Sign out, then sign in with that email.</p>
        <button className="btn-secondary" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          {signOut.isPending ? "Signing out…" : "Sign out"}
        </button>
      </Panel>
    );
  else body = children;

  return (
    <ParticipantFrame slug={slug} page={page}>
      <main id="main" className={`wrap ${!narrow && (aside || wide) ? "wrap--portal" : "wrap--narrow"} pb-10 pt-8 sm:pt-10 md:pb-16`}>
        <header className="mb-6 sm:mb-8 print:hidden">
          <h1 className="h1 text-balance sm:text-[30px]">{title}</h1>
          {lede && <div className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-slate">{lede}</div>}
        </header>
        {aside && participant ? (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
            <div className="min-w-0 space-y-5">{body}</div>
            <aside className="min-w-0 space-y-5 lg:sticky lg:top-[calc(var(--ptop)+24px)]">{aside}</aside>
          </div>
        ) : (
          <div className="space-y-5">{body}</div>
        )}
      </main>
    </ParticipantFrame>
  );
}

/** The header and the navigation around any participant page; the apply page uses it around its own layout. */
export function ParticipantFrame({ slug, page, children }: { slug: string; page: ParticipantPath; children: ReactNode }) {
  const session = useSession();
  const signOut = useSignOut();
  const form = useApplyForm(slug);
  const participant = session.data?.user.kind === "participant";
  const apps = useMyApplications(slug, participant);
  const admitted = !!apps.data?.some((a) => a.admitted);
  // what waits on the participant: an introduction to answer, a meeting to confirm or a move to answer
  const intros = useIntroductions(slug, admitted);
  const meetings = useMyMeetings(slug, admitted);
  const nav = participant
    ? navFor(apps.data, {
        introductions: intros.data?.introductions.filter((i) => i.stage === "Introduced" && !i.mine).length ?? 0,
        meetings: meetings.data?.meetings.filter((m) => m.can.confirm || m.can.answer).length ?? 0,
      })
    : [];
  const brand = form.data?.brand.primary ?? "#1C1C1E";
  const ink = readableOn(brand);
  const name = form.data?.eventName ?? "";
  const mark = (form.data?.brand.logoText || initials(name || "Deal Room")).slice(0, 4).toUpperCase();
  const showNav = nav.length > 1;

  return (
    <div className="brand portal min-h-screen bg-paper" style={{ "--accent": brand, "--accent-ink": ink } as React.CSSProperties}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">
        Skip to the page
      </a>
      <header className="portal__top print:hidden">
        <div className="wrap wrap--portal flex h-14 items-center justify-between gap-4 sm:h-16">
          <Link href={`/e/${slug}/deal-room`} className="flex min-w-0 items-center gap-3 text-ink" aria-label={`${name} Deal Room, about`}>
            <span className="mark grid size-8 shrink-0 place-items-center rounded-md font-medium" style={{ background: brand, color: ink, fontSize: mark.length > 2 ? 10 : 13 }} aria-hidden="true">
              {form.data ? mark : ""}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[15px] font-medium">{name || " "}</span>
              <span className="block text-[13px] text-slate">Deal Room</span>
            </span>
          </Link>
          {session.data && (
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden max-w-[240px] truncate text-[13px] text-slate md:block" title={session.data.user.email ?? undefined}>
                {session.data.user.email}
              </span>
              <button className="btn-quiet btn-sm" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
                Sign out
              </button>
            </div>
          )}
        </div>
        {showNav && (
          <nav className="hidden border-t border-line md:block" aria-label="Your Deal Room">
            <div className="wrap wrap--portal flex items-center justify-between gap-6">
            <ul className="flex gap-6">
              {nav.map((n) => (
                <li key={n.path}>
                  <Link href={`/e/${slug}/deal-room/${n.path}`} aria-current={n.path === page ? "page" : undefined} className="portal__tab">
                    {n.label}
                    {n.count > 0 && (
                      <span className="portal__count" aria-label={`${n.count} waiting for you`}>
                        {n.count}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            <PoweredBy />
            </div>
          </nav>
        )}
      </header>

      {children}

      {/* the platform under the organiser's event: in the tab row on a big screen, at the foot on a phone */}
      <footer className={`wrap wrap--portal border-t border-line pb-[calc(var(--pbar)+24px)] pt-6 print:hidden ${showNav ? "md:hidden" : "md:pb-8"}`}>
        <PoweredBy center />
      </footer>

      {showNav && (
        <nav className="portal__bar md:hidden print:hidden" aria-label="Your Deal Room">
          <ul className="grid h-full" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
            {nav.map((n) => (
              <li key={n.path} className="min-w-0">
                <Link href={`/e/${slug}/deal-room/${n.path}`} aria-current={n.path === page ? "page" : undefined} className="portal__item">
                  <span className="relative">
                    {n.label}
                    {n.count > 0 && (
                      <span className="portal__count portal__count--dot" aria-label={`${n.count} waiting for you`}>
                        {n.count}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/** ExcursiaConnect, the platform the organiser runs its Deal Room on. */
function PoweredBy({ center = false }: { center?: boolean }) {
  return (
    <Link href="/" className={`flex shrink-0 items-center gap-2 text-[13px] text-slate hover:text-ink ${center ? "justify-center" : ""}`} aria-label="Powered by ExcursiaConnect">
      Powered by <Wordmark size="sm" />
    </Link>
  );
}

/** Tier 1 of a business's file, as verified investors and partners see it in the directory. */
export function Teaser({ t, children }: { t: TeaserCard; children?: ReactNode }) {
  return (
    <article className="surface p-5 sm:p-6">
      <p className="text-[13px] text-slate">{[t.sector, t.country, t.askBand, t.pathway].filter((x) => x && x !== "–").join(" · ")}</p>
      <h2 className="mt-1 text-[17px] font-medium">{t.title || <span className="text-slate">Your title</span>}</h2>
      <p className="mt-1.5 max-w-[68ch] whitespace-pre-line text-[15px] leading-relaxed">{t.summary || <span className="text-slate">Your summary</span>}</p>
      {t.mission !== "–" && <p className="mt-2 text-[13px] text-slate">{t.mission}</p>}
      {children && <div className="mt-4">{children}</div>}
    </article>
  );
}
