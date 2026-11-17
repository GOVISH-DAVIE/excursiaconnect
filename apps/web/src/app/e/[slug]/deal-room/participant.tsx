"use client";

/**
 * The frame of a Deal Room participant's own pages (M3.1): signed in with the email they applied with, a staff
 * account told to sign out, and the links between the participant's pages.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { TeaserCard } from "@excursia/contracts/matching";
import { useSession } from "@/features/auth/hooks/use-session";
import { useSignOut } from "@/features/auth/hooks/use-sign-in";

export function Panel({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="surface p-5">
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          {title && <h2 className="h2">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const PAGES = [
  { path: "apply", label: "My application" },
  { path: "introductions", label: "My introductions" },
] as const;

/** The page's title and links, then its body once a participant is signed in. */
export function ParticipantPage({ slug, page, title, sub, signIn, children }: { slug: string; page: string; title: string; sub?: string; signIn: string; children: ReactNode }) {
  const router = useRouter();
  const session = useSession();
  const signOut = useSignOut();
  const here = `/e/${slug}/deal-room/${page}`;
  let body: ReactNode;
  if (session.isPending) body = <Panel>Loading…</Panel>;
  else if (!session.data)
    body = (
      <Panel title={signIn}>
        <p className="mb-4 text-[14px] text-slate">Use the email you applied with. We email you a six-digit code; no password needed.</p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => router.push(`/signin?next=${encodeURIComponent(here)}`)}>
          Sign in with your email
        </button>
      </Panel>
    );
  else if (session.data.user.kind !== "participant")
    body = (
      <Panel>
        <p className="mb-4 text-[15px]">You are signed in with a staff account. To see your own Deal Room pages, sign out and sign in with the email you applied with.</p>
        <button className="btn btn-secondary" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          Sign out
        </button>
      </Panel>
    );
  else body = children;
  return (
    <div className="min-h-screen bg-paper">
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="h2">{title}</h1>
            {sub && <p className="text-[14px] text-slate">{sub}</p>}
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
            {PAGES.filter((p) => p.path !== page).map((p) => (
              <Link key={p.path} href={`/e/${slug}/deal-room/${p.path}`} className="link">
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
        {body}
      </main>
    </div>
  );
}

/** Tier 1 of a business's file, as verified investors and partners see it in the directory. */
export function Teaser({ t, children }: { t: TeaserCard; children?: ReactNode }) {
  return (
    <article className="surface p-5">
      <p className="text-[12px] text-slate">{[t.sector, t.country, t.askBand, t.pathway].filter((x) => x && x !== "–").join(" · ")}</p>
      <h2 className="mt-1 text-[17px] font-medium">{t.title || <span className="text-slate">Your title</span>}</h2>
      <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed">{t.summary || <span className="text-slate">Your summary</span>}</p>
      {t.mission !== "–" && <p className="mt-2 text-[12px] text-slate">{t.mission}</p>}
      {children && <div className="mt-3">{children}</div>}
    </article>
  );
}
