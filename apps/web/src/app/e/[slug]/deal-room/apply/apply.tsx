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
import type { ApplyForm, ApplyMode, MyApplications } from "@excursia/contracts/apply";
import { fmtStamp } from "@excursia/domain/time";
import { initials, readableOn } from "@/lib/brand";
import { useSession } from "@/features/auth/hooks/use-session";
import { useApplyForm, useMyApplication, useMyApplications, useStartApplication } from "@/features/apply/hooks/use-apply";
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
  const [mode, setMode] = useState<ApplyMode>(initialMode);
  const [chosen, setChosen] = useState<string | null>(null);

  // the application to show: the one just started or chosen, else an open draft of this kind
  const openOne = mine.data?.find((a) => OPEN.includes(a.status) && a.mode === mode) ?? mine.data?.find((a) => OPEN.includes(a.status));
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
        <button className="btn btn-primary" onClick={() => router.push(`/signin?next=${encodeURIComponent(back)}`)}>
          Sign in with your email
        </button>
      </Card>
    );
  else if (!applicant) body = <Card>You are signed in with a staff account. To apply, sign out and sign in with your own email.</Card>;
  else if (start.isError) body = <Card>{start.error.message}</Card>;
  else if (current && loaded.data && !OPEN.includes(loaded.data.status)) body = <Submitted app={loaded.data} />;
  else if (current && loaded.data) body = <Editor key={current} slug={slug} form={form} initial={loaded.data} />;
  else if (current || start.isPending) body = <Card>Opening your application…</Card>;
  else
    body = (
      <>
        <Card title="What are you applying as?">
          <ModeTabs mode={mode} setMode={setMode} />
          <button className="btn btn-primary" onClick={() => start.mutate({ mode }, { onSuccess: (a) => setChosen(a.id) })}>
            Start my application
          </button>
        </Card>
        <Earlier apps={mine.data ?? []} onOpen={setChosen} />
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
            <span className="nav__name">{form.eventName} Deal Room</span>
          </Link>
          <Link href={`/e/${slug}/deal-room`} className="link">
            About the Deal Room
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

function ModeTabs({ mode, setMode }: { mode: ApplyMode; setMode: (m: ApplyMode) => void }) {
  return (
    <div className="dr-toggle mb-4" role="tablist">
      {(
        [
          ["seeker", "Raising capital"],
          ["provider", "Investing, buying or partnering"],
          ["challenge", "Bringing a challenge"],
        ] as const
      ).map(([m, label]) => (
        <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
          {label}
        </button>
      ))}
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
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[14px]">
            <span>
              {a.org || "Untitled"} <span className="text-slate">· {a.ref ?? a.status}</span>
            </span>
            <button className="btn-quiet" onClick={() => onOpen(a.id)}>
              {OPEN.includes(a.status) ? "Continue" : "See its status"}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Submitted({ app }: { app: { ref: string | null; submittedAt: string | null; status: string; form: { org: { name: string } } } }) {
  return (
    <Card title="Application received">
      <p className="text-[15px]">
        {app.form.org.name || "Your application"} is in, with reference <strong className="font-mono">{app.ref}</strong>
        {app.submittedAt ? `, submitted ${fmtStamp(app.submittedAt)}` : ""}.
      </p>
      <p className="mt-2 text-[14px] text-slate">Status: {app.status}. The Deal Room team reviews applications in the order they arrive and writes to you by email; keep the reference for any question.</p>
    </Card>
  );
}
