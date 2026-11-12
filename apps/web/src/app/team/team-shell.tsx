"use client";

/**
 * The staff workspace on the real API (backend-plan.md, M0.5), in the same rail as the rest of the app: the dark
 * ground, the wordmark, the event, and the person. Here the person is whoever is signed in, not a persona picker,
 * and everything under /team reads and writes PostgreSQL. Screens join the rail as their module moves off the
 * prototype store.
 */
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Rail, type NavItem } from "@/components/ui";
import { useSession } from "@/features/auth/hooks/use-session";
import { useSignOut } from "@/features/auth/hooks/use-sign-in";
import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { useTeam } from "@/features/dealroom/hooks/use-team";
import { rolesOf } from "@/features/auth/roles";

/** The menu, by what the person is: Algotech, an organiser's owner, the Deal Room's team (its lead sets it up). */
function navFor(r: ReturnType<typeof rolesOf>): NavItem[] {
  const nav: NavItem[] = [];
  if (r.admin) nav.push({ href: "/team/admin", label: "Organisers and events" });
  if (r.superAdmin) nav.push({ href: "/team/admin/team", label: "Algotech team" });
  if (r.owner) nav.push({ href: "/team/organisation", label: "Organisation and KYC" }, { href: "/team/events", label: "Events" });
  if (r.dealRoom) nav.push({ href: "/team/applications", label: "Review queue" }, { href: "/team/messages", label: "Messages" });
  if (r.lead) nav.push({ href: "/team/dealroom/settings", label: "Deal Room settings" });
  return nav;
}

const dueDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" });

export function TeamShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const signOut = useSignOut();
  const router = useRouter();
  const s = session.data;
  const allowed = !!s && s.mfa !== "pending" && s.user.kind !== "participant";
  const eventId = useDealRoomEvent();
  const team = useTeam(allowed && eventId ? eventId : "");

  // not signed in (or an applicant, or half signed in): to the sign-in page, and back here afterwards
  // (the path is read in the browser, here, so the shell doesn't hold up prerendering on dynamic pages)
  useEffect(() => {
    if (session.isSuccess && !allowed) router.replace(`/signin?next=${encodeURIComponent(window.location.pathname)}`);
  }, [session.isSuccess, allowed, router]);

  const me = team.data?.me;
  const roles = rolesOf(allowed ? s : null);
  const persona = roles.admin ? "Algotech" : roles.dealRoom ? `Deal Room${team.data ? ` · ${team.data.event.name}` : ""}` : roles.owner ? "Organiser" : "Workspace";
  const context = allowed ? (
    <div className="space-y-3 text-[13px]">
      {s.mfa === "skipped" && (
        <Link href="/signin" className="block rounded-md bg-coral/15 px-3 py-2 text-coral hover:bg-coral/25">
          Set up your authenticator{s.mfaDueBy ? ` by ${dueDay(s.mfaDueBy)}` : ""}
        </Link>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded bg-white/10 px-2.5 py-1 hover:bg-white/20" onClick={() => signOut.mutate(undefined, { onSuccess: () => router.replace("/signin") })}>
          {signOut.isPending ? "Signing out…" : "Sign out"}
        </button>
        {roles.dealRoom && (
          <Link href="/dealroom" className="rounded bg-white/10 px-2.5 py-1 hover:bg-white/20">
            Deal Room prototype
          </Link>
        )}
      </div>
    </div>
  ) : undefined;

  return (
    <Rail
      persona={persona}
      who={!allowed ? "Checking your sign-in…" : me ? `${me.name}, ${me.role}` : s.user.name}
      nav={navFor(roles)}
      context={context}
      footer={<span className="text-ok">Live data</span>}
      drawer
    >
      {/* always rendered, so the server can prerender each screen's shell; each screen waits for the session itself */}
      {children}
    </Rail>
  );
}
