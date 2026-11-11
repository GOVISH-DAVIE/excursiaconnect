"use client";

/**
 * The sign-in screen: an applicant with an emailed code, or staff with a password and an authenticator. It asks
 * the API who is signed in first, so a reload in the middle of a staff sign-in comes back to the right step. The
 * step that finishes a sign-in goes straight on to the person's workspace; someone who arrives already signed in
 * sees who they are, and can sign out.
 */
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { SignInNext } from "@excursia/contracts/auth";
import { Tabs } from "@/components/ui";
import { useSession } from "@/features/auth/hooks/use-session";
import { sessionQuery } from "@/features/auth/queries";
import { ApplicantForm } from "./applicant-form";
import { destination } from "./destination";
import { Problem } from "./parts";
import { SignedIn } from "./signed-in";
import { StaffPassword } from "./staff-password";
import { RecoveryList, TotpEnrol, TotpVerify } from "./staff-totp";

const WHO = ["Applicant", "Staff"] as const;

export function SignIn() {
  const session = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  // only a path on this site: never an absolute or protocol-relative URL, so the link can't send anyone elsewhere
  const nextParam = useSearchParams().get("next");
  const next = nextParam && /^\/(?!\/)[\w\-/?=&.%]*$/.test(nextParam) ? nextParam : null;
  const [who, setWho] = useState<(typeof WHO)[number]>("Applicant");
  /** What the password step said comes next. */
  const [after, setAfter] = useState<SignInNext | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  /** Setting up the authenticator from the signed-in card, after putting it off. */
  const [settingUp, setSettingUp] = useState(false);
  const [leaving, setLeaving] = useState(false);

  /** A sign-in just finished: on to the person's workspace. */
  async function goIn() {
    setLeaving(true);
    const s = await queryClient.fetchQuery({ ...sessionQuery.options(), staleTime: 0 });
    router.replace(s ? (next ?? destination(s)) : "/signin");
  }

  if (leaving) return <p className="text-[14px] text-slate">Signed in. Taking you in…</p>;
  if (session.isPending) return <p className="text-[14px] text-slate">Checking whether you&apos;re signed in…</p>;
  if (session.isError) return <Problem error={session.error} />;

  // the recovery codes stay on screen until they are acknowledged, though the session is already complete
  if (recovery) return <RecoveryList codes={recovery} onDone={goIn} />;

  const s = session.data;
  if (s && s.mfa !== "pending")
    return settingUp ? <TotpEnrol onRecoveryCodes={setRecovery} onSkipped={goIn} /> : <SignedIn session={s} onSetUp={() => setSettingUp(true)} />;

  const step = s?.mfa === "pending" ? (after?.next ?? s.pendingStep) : after?.next;
  if (step === "totp_enrol") return <TotpEnrol onRecoveryCodes={setRecovery} onSkipped={goIn} skipUntil={after?.skipUntil ?? s?.mfaDueBy} />;
  if (step === "totp") return <TotpVerify onSignedIn={goIn} />;

  return (
    <div>
      <Tabs tabs={WHO} value={who} onChange={setWho} />
      {who === "Applicant" ? <ApplicantForm onSignedIn={goIn} /> : <StaffPassword onNext={setAfter} />}
    </div>
  );
}
