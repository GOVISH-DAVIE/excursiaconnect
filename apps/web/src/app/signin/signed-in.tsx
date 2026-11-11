"use client";

/** Who is signed in, until the persona screens move onto the API (backend-plan.md, M0.5 onwards). */
import Link from "next/link";
import type { SessionView } from "@excursia/contracts/auth";
import { KV } from "@/components/ui";
import { useSignOut } from "@/features/auth/hooks/use-sign-in";
import { Aside, Notice, Problem, Step } from "./parts";
import { dueDay } from "./staff-totp";
import { destination } from "./destination";

const ROLE: Record<string, string> = {
  admin: "Algotech admin",
  dr_lead: "Deal Room lead",
  dr_reviewer: "Deal Room reviewer",
  dr_operations: "Deal Room operations",
  dr_coordinator: "Deal Room coordinator",
  dr_oversight: "Deal Room oversight",
};

export function SignedIn({ session, onSetUp }: { session: SessionView; onSetUp: () => void }) {
  const signOut = useSignOut();
  const staff = session.user.kind !== "participant";
  const roles = session.memberships.map((m) => `${ROLE[m.role] ?? m.role}${m.canDecide ? ", decides" : ""}${m.eventId ? ` (${m.eventId})` : ""}`);
  const ends = new Date(session.expiresAt).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <Step title={`Signed in as ${session.user.name}`}>
      <KV
        rows={[
          ["Email", session.user.email ?? "none"],
          ["Account", !staff ? "Applicant" : session.mfa === "skipped" ? "Staff, authenticator not set up yet" : "Staff, with an authenticator"],
          ...(roles.length ? ([["Roles", roles.join("; ")]] as [string, string][]) : []),
          ["Signed in until", `${ends}, Nairobi${staff ? ", or 30 minutes after your last action" : ""}`],
        ]}
      />
      {session.mfa === "skipped" && (
        <div className="space-y-2">
          <Notice>Set up your authenticator {session.mfaDueBy ? `by ${dueDay(session.mfaDueBy)}` : "now"}: after that, signing in needs it.</Notice>
          <Aside onClick={onSetUp}>Set it up now</Aside>
        </div>
      )}
      <Problem error={signOut.error} />
      <div className="flex flex-wrap gap-3">
        <Link href={destination(session)} className="btn-primary">
          Continue
        </Link>
        <button className="btn-secondary" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          {signOut.isPending ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </Step>
  );
}
