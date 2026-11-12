"use client";

/** Pieces the organiser's and Algotech's screens share: the session wait, statuses, a history list, a file picker. */
import { useSyncExternalStore, type ReactNode } from "react";
import { Tone } from "@/components/ui";
import Link from "next/link";
import { useSession } from "@/features/auth/hooks/use-session";
import { homeOf, rolesOf } from "@/features/auth/roles";

const noop = () => () => {};
/**
 * False while React hydrates what the server rendered, true after. A page streamed in a Suspense boundary
 * hydrates after the session has loaded; without this its first render would differ from the server's.
 */
export const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** Renders its children once a full staff session is in; the shell sends anyone else to the sign-in page. */
export function Signed({ children }: { children: ReactNode }) {
  const s = useSession().data;
  const hydrated = useHydrated();
  if (!hydrated || !s || s.mfa === "pending" || s.user.kind === "participant") return <p className="text-[14px] text-slate">Checking your sign-in…</p>;
  return <>{children}</>;
}

/** Algotech's screens: anyone else is told so and pointed to their own workspace (the API refuses them anyway). */
export function AlgotechOnly({ children }: { children: ReactNode }) {
  const s = useSession().data;
  if (!s || rolesOf(s).admin) return <>{children}</>;
  return (
    <div className="max-w-xl">
      <h1 className="h1">This is Algotech&apos;s</h1>
      <p className="mt-2 text-[15px] text-slate">
        These screens are for Algotech&apos;s team.{" "}
        <Link href={homeOf(s)} className="underline underline-offset-4">
          Go to your workspace
        </Link>
      </p>
    </div>
  );
}

export function Loading() {
  return <p className="text-[14px] text-slate">Loading…</p>;
}

export function Failed({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md bg-bad-50 px-3 py-2.5 text-[14px] text-bad">
      {error.message}
    </p>
  );
}

export function KycTone({ status }: { status: string }) {
  const tone = status === "Verified" ? "ok" : status === "Returned" ? "bad" : status === "Pending" ? "warn" : "mute";
  return <Tone tone={tone}>{status === "Pending" ? "With Algotech" : status}</Tone>;
}

export function StateTone({ state }: { state: string }) {
  const tone = state === "Live" || state === "Approved" ? "ok" : state === "Rejected" || state === "Suspended" ? "bad" : state === "Draft" || state === "Closed" ? "mute" : "warn";
  return <Tone tone={tone}>{state}</Tone>;
}

/** What is still missing, as a short list. */
export function Gaps({ title, gaps }: { title: string; gaps: string[] }) {
  if (!gaps.length) return null;
  return (
    <div className="rounded-md bg-paper-200 px-4 py-3 text-[14px]">
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-disc pl-5 text-slate">
        {gaps.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
    </div>
  );
}

export function History({ items }: { items: { at: string; what: string }[] }) {
  if (!items.length) return <p className="text-[14px] text-slate">Nothing yet.</p>;
  return (
    <ol className="space-y-2 text-[14px]">
      {[...items].reverse().map((h, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-32 shrink-0 font-mono text-[12px] text-slate">{h.at}</span>
          <span>{h.what}</span>
        </li>
      ))}
    </ol>
  );
}

export const ACCEPT = "application/pdf,image/png,image/jpeg,.docx,.xlsx,.pptx";

/** A button that opens the file picker; the chosen file goes to `onFile`. */
export function FileButton({ label, busy, disabled, onFile }: { label: string; busy?: boolean; disabled?: boolean; onFile: (f: File) => void }) {
  return (
    <label className={`btn-secondary btn-sm shrink-0 ${disabled || busy ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
      {busy ? "Uploading…" : label}
      <input
        type="file"
        className="sr-only"
        accept={ACCEPT}
        disabled={disabled || busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </label>
  );
}
