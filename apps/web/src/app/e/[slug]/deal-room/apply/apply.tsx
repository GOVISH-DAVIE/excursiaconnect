"use client";

/**
 * Applying to the Deal Room, on the API (backend-plan.md, M1.1): the organiser-branded page around the form. An
 * applicant signs in with a code sent to their email (the real sign-in page, then back here), picks what they are
 * applying as, and fills in the form; a draft started before comes back on any device signed in with the same
 * email. An invitation link opens the invited application for the email it was sent to.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ApplyForm, ApplyMode, MyApplication, MyApplications } from "@excursia/contracts/apply";
import { fmtStamp } from "@excursia/domain/time";
import { initials, readableOn } from "@/lib/brand";
import { useSession } from "@/features/auth/hooks/use-session";
import { useSignOut } from "@/features/auth/hooks/use-sign-in";
import { useApplyForm, useMyApplication, useMyApplications, useStartApplication } from "@/features/apply/hooks/use-apply";
import { Answer } from "./answer";
import { Editor } from "./editor";
import { Card } from "./fields";

const OPEN = ["Lead", "Invited", "Draft"];
const TITLE: Record<ApplyMode, string> = {
  seeker: "Apply to raise capital",
  provider: "Apply as an investor, buyer or partner",
  challenge: "Bring a challenge to the Deal Room",
};

export function Apply({ slug }: { slug: string }) {
  const search = useSearchParams();
  const form = useApplyForm(slug);
  if (form.isPending) return <div className="p-10 text-slate">Loading…</div>;
  if (form.isError) return <div className="p-10">{form.error.message}</div>;
  const typeParam = search.get("type");
  return <Page slug={slug} form={form.data} initialMode={typeParam === "provider" || typeParam === "challenge" ? typeParam : "seeker"} invite={search.get("invite")} />;
}

function Page({ slug, form, initialMode, invite }: { slug: string; form: ApplyForm; initialMode: ApplyMode; invite: string | null }) {
  const router = useRouter();
  const session = useSession();
  const applicant = session.data?.user.kind === "participant";
  const mine = useMyApplications(slug, applicant);
  const start = useStartApplication(slug);
  const signOut = useSignOut();
  const [mode, setMode] = useState<ApplyMode>(initialMode);
  const [chosen, setChosen] = useState<string | null>(null);

  // the application to show: the one just started or chosen, else an open draft of this kind
  // an application waiting on the applicant's answer comes first; then an open draft of this kind, then any
  const openOne =
    mine.data?.find((a) => a.status === "Information requested") ??
    mine.data?.find((a) => OPEN.includes(a.status) && a.mode === mode) ??
    mine.data?.find((a) => OPEN.includes(a.status));
  const current = chosen ?? (invite ? null : (openOne?.id ?? null));
  const loaded = useMyApplication(slug, current);
  const shownMode = loaded.data?.mode ?? openOne?.mode ?? mode;

  // an invitation is taken up once, as soon as its applicant is signed in
  const tookInvite = useRef(false);
  const { mutate: startApp } = start;
  useEffect(() => {
    if (!invite || !applicant || tookInvite.current) return;
    tookInvite.current = true;
    startApp({ mode, invite }, { onSuccess: (a) => setChosen(a.id) });
  }, [invite, applicant, mode, startApp]);

  const brand = form.brand.primary;
  const ink = readableOn(brand);
  const mark = (form.brand.logoText || initials(form.eventName)).slice(0, 4).toUpperCase();
  const back = `/e/${slug}/deal-room/apply?type=${mode}${invite ? `&invite=${encodeURIComponent(invite)}` : ""}`;

  let body: React.ReactNode;
  if (session.isPending || (applicant && mine.isPending)) body = <Card>Loading…</Card>;
  else if (!session.data)
    body = (
      <Card title="Sign in with a one-time code">
        <ModeTabs mode={mode} setMode={setMode} />
        <p className="mb-4 text-[14px] text-slate">No password needed: we email you a six-digit code. If you started an application before, signing in with the same email brings it back, on any device.</p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => router.push(`/signin?next=${encodeURIComponent(back)}`)}>
          Sign in with your email
        </button>
      </Card>
    );
  else if (!applicant)
    body = (
      <Card>
        <p className="mb-4 text-[15px]">You are signed in with a staff account. To apply, sign out and sign in with your own email.</p>
        <button className="btn btn-secondary" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          Sign out
        </button>
      </Card>
    );
  else if (start.isError) body = <Card>{start.error.message}</Card>;
  else if (current && loaded.data && !OPEN.includes(loaded.data.status))
    body = (
      <>
        <Answer slug={slug} app={loaded.data} maxBytes={form.upload.maxBytes} onSent={() => setChosen(current)} />
        <Submitted app={loaded.data} />
      </>
    );
  // once submitted, it stays on screen as received rather than falling back to the chooser
  else if (current && loaded.data) body = <Editor key={current} slug={slug} form={form} initial={loaded.data} onSubmitted={() => setChosen(current)} />;
  else if (current || start.isPending) body = <Card>Opening your application…</Card>;
  else
    body = (
      <>
        <Earlier apps={mine.data ?? []} onOpen={setChosen} />
        <Card title={mine.data?.length ? "Start another application" : "What are you applying as?"}>
          <ModeTabs mode={mode} setMode={setMode} />
          <button className="btn btn-primary w-full sm:w-auto" onClick={() => start.mutate({ mode }, { onSuccess: (a) => setChosen(a.id) })}>
            Start my application
          </button>
        </Card>
      </>
    );

  return (
    <div className="brand min-h-screen bg-paper" style={{ "--accent": brand, "--accent-ink": ink } as React.CSSProperties}>
      <header className="nav nav--static">
        <div className="wrap nav__bar">
          <Link href={`/e/${slug}/deal-room`} className="nav__logo">
            <span className="mark" style={{ background: brand, color: ink, fontSize: mark.length > 2 ? 10 : 13 }} aria-hidden="true">
              {mark}
            </span>
            <span className="nav__name">
              {form.eventName}
              <span className="hidden sm:inline"> Deal Room</span>
            </span>
          </Link>
          <Link href={`/e/${slug}/deal-room`} className="link">
            About<span className="hidden sm:inline"> the Deal Room</span>
          </Link>
        </div>
      </header>

      <main className="wrap wrap--narrow space-y-5 py-10">
        <div>
          <h1 className="h1">{TITLE[shownMode]}</h1>
          <p className="mt-1 text-[15px] text-slate">
            Applications open on {fmtStamp(form.opens, false)} and close on {fmtStamp(form.closes, false)}. About 20 minutes; it saves as you type.
          </p>
        </div>
        {body}
      </main>
    </div>
  );
}

const MODES: { mode: ApplyMode; label: string; hint: string }[] = [
  { mode: "seeker", label: "Raising capital", hint: "A business or project looking for investment, credit or a buyer" },
  { mode: "provider", label: "Investing, buying or partnering", hint: "An investor, lender, buyer or partner looking for deals" },
  { mode: "challenge", label: "Bringing a challenge", hint: "A public institution or corporate buyer with a problem to solve" },
];

/** What someone is applying as: three options, stacked on a phone and side by side from a tablet up. */
function ModeTabs({ mode, setMode }: { mode: ApplyMode; setMode: (m: ApplyMode) => void }) {
  return (
    <div className="mb-5 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Applying as">
      {MODES.map((m) => {
        const on = mode === m.mode;
        return (
          <button
            key={m.mode}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setMode(m.mode)}
            className={`rounded-lg border p-3 text-left transition-colors ${on ? "border-ink bg-paper-200" : "border-line hover:border-line-strong"}`}
          >
            <span className="flex items-center gap-2 text-[15px] font-medium">
              <span aria-hidden="true" className={`grid size-4 shrink-0 place-items-center rounded-full border ${on ? "border-ink" : "border-line-strong"}`}>
                {on && <span className="size-2 rounded-full bg-ink" />}
              </span>
              {m.label}
            </span>
            <span className="mt-1 block pl-6 text-[13px] text-slate">{m.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Applications this person already made here: submitted ones show their reference. */
function Earlier({ apps, onOpen }: { apps: MyApplications; onOpen: (id: string) => void }) {
  if (!apps.length) return null;
  return (
    <Card title="Your applications here">
      <ul className="divide-y divide-line">
        {apps.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium">{a.org || "Untitled application"}</span>
              <span className="block text-[13px] text-slate">
                {a.ref ? <span className="font-mono">{a.ref}</span> : "Draft"} · {OPEN.includes(a.status) ? "not submitted yet" : a.status}
              </span>
            </span>
            <button className="btn-secondary btn-sm shrink-0" onClick={() => onOpen(a.id)}>
              {OPEN.includes(a.status) ? "Continue" : "View"}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Submitted({ app }: { app: Pick<MyApplication, "ref" | "submittedAt" | "status" | "form" | "requests"> }) {
  const answered = app.requests.filter((r) => r.answeredAt).at(-1);
  return (
    <Card title="Application received">
      <p className="text-[15px]">
        {app.form.org.name || "Your application"} is in, with reference <strong className="font-mono">{app.ref}</strong>
        {app.submittedAt ? `, submitted ${fmtStamp(app.submittedAt)}` : ""}.
      </p>
      <p className="mt-2 text-[14px] text-slate">Status: {app.status}. The Deal Room team reviews applications in the order they arrive and writes to you by email; keep the reference for any question.</p>
      {answered?.answeredAt && <p className="mt-2 text-[14px] text-slate">You answered the review team&rsquo;s request on {fmtStamp(answered.answeredAt)}.</p>}
    </Card>
  );
}
