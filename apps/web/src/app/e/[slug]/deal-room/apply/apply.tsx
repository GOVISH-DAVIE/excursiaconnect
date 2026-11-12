"use client";

/**
 * Applying to the Deal Room, on the API (backend-plan.md, M1.1): the organiser-branded page around the form. A bare
 * apply link asks which of the four registration pathways first; a pathway's link (`?type=partner`) goes straight to
 * it. The applicant signs in with a code sent to their email (the real sign-in page, then back here) and fills in
 * that pathway's steps; a draft started before comes back on any device signed in with the same email. An
 * invitation link opens the invited application for the email it was sent to.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ApplyForm, ApplyMode, MyApplication, MyApplications } from "@excursia/contracts/apply";
import { APPLY_MODES, modeFromLink } from "@excursia/domain/dealroom/apply";
import { ROLE_LABEL } from "@excursia/domain/dealroom/logic";
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
  seeker: "Register as a capital seeker",
  capital: "Register as a capital provider",
  partner: "Register as a commercial or strategic partner",
  challenge: "Submit an institutional challenge",
};
/** Who each pathway is for, in the organiser's words. */
const WHO_FOR: Record<ApplyMode, string> = {
  seeker: "For startups, scale-ups, established enterprises and project sponsors seeking investment or financing to establish, expand or scale.",
  capital: "For angel investors, venture capital and private equity firms, banks, development finance institutions, institutional investors and funds.",
  partner: "For corporates, enterprises, procurement teams, distributors, technology providers and regional operators seeking suppliers, solutions, distribution, market entry and partnerships.",
  challenge: "For ministries, public agencies, county governments, regulators and corporate institutions with a defined institutional, operational, infrastructure or service-delivery priority.",
};

export function Apply({ slug }: { slug: string }) {
  const search = useSearchParams();
  const form = useApplyForm(slug);
  if (form.isPending) return <div className="p-10 text-slate">Loading…</div>;
  if (form.isError) return <div className="p-10">{form.error.message}</div>;
  // a pathway's link names it (the old "provider" means capital provider); without one, or an unknown one, the page asks
  const linked = modeFromLink(search.get("type"));
  return <Page key={linked ?? "choose"} slug={slug} form={form.data} linked={linked} invite={search.get("invite")} />;
}

function Page({ slug, form, linked, invite }: { slug: string; form: ApplyForm; linked: ApplyMode | null; invite: string | null }) {
  const router = useRouter();
  const session = useSession();
  const applicant = session.data?.user.kind === "participant";
  const mine = useMyApplications(slug, applicant);
  const start = useStartApplication(slug);
  const signOut = useSignOut();
  const mode: ApplyMode = linked ?? "seeker";
  const [chosen, setChosen] = useState<string | null>(null);
  const pick = (m: ApplyMode | null) => {
    router.replace(m ? `/e/${slug}/deal-room/apply?type=${m}` : `/e/${slug}/deal-room/apply`, { scroll: false });
    window.scrollTo({ top: 0 });
  };

  // the application to show: the one just started or chosen; else one waiting on the applicant's answer, else an
  // open draft on the pathway they came for. Choosing a pathway shows the list of what they have instead.
  const openOne = mine.data?.find((a) => a.status === "Information requested") ?? (linked ? mine.data?.find((a) => OPEN.includes(a.status) && a.mode === linked) : undefined);
  const current = chosen ?? (invite ? null : (openOne?.id ?? null));
  const loaded = useMyApplication(slug, current);
  const shownMode = loaded.data?.mode ?? openOne?.mode ?? linked;
  // asking which pathway: a bare link, with nothing of theirs to open and no invitation
  const choosing = !linked && !current && !invite;

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
  const back = `/e/${slug}/deal-room/apply${linked ? `?type=${linked}` : ""}${invite ? `${linked ? "&" : "?"}invite=${encodeURIComponent(invite)}` : ""}`;

  let body: React.ReactNode;
  if (session.isPending || (applicant && mine.isPending)) body = <Card>Loading…</Card>;
  else if (choosing && !mine.data?.length) body = <Chooser onPick={pick} />;
  else if (!session.data)
    body = (
      <Card title="Sign in with a one-time code">
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
  else if (choosing)
    body = (
      <>
        <Earlier apps={mine.data ?? []} onOpen={setChosen} />
        <Chooser onPick={pick} title="Start another application" />
      </>
    );
  else
    body = (
      <>
        <Earlier apps={mine.data ?? []} onOpen={setChosen} />
        <Card title={mine.data?.length ? `Start another application, as a ${ROLE_LABEL[mode].toLowerCase()}` : "Start your application"}>
          <p className="mb-4 text-[14px] text-slate">It saves as you type, so you can stop and come back on any device signed in with your email.</p>
          <button className="btn btn-primary w-full sm:w-auto" onClick={() => start.mutate({ mode }, { onSuccess: (a) => setChosen(a.id) })}>
            {mode === "challenge" ? "Start the challenge" : "Start my application"}
          </button>
        </Card>
      </>
    );
  // the form takes the page's full width; choosing a pathway and signing in stay a narrow column
  const wide = !!(current && loaded.data && OPEN.includes(loaded.data.status));
  const heading = shownMode ?? (choosing ? null : mode);

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

      <main className={wide ? "wrap space-y-8 py-10" : "wrap wrap--narrow space-y-5 py-10"}>
        <div>
          <h1 className="h1">{heading ? TITLE[heading] : `Register for the ${form.eventName} Deal Room`}</h1>
          <p className="mt-2 max-w-[60ch] text-[15px]">{heading ? WHO_FOR[heading] : "Select the registration pathway that best reflects your role and the purpose of your participation in the Deal Room."}</p>
          <p className="mt-1 text-[15px] text-slate">Open until {fmtStamp(form.closes, false)}. Your answers save as you type.</p>
          {linked && !current && !invite && (
            <button type="button" className="link mt-3 text-[14px]" onClick={() => pick(null)}>
              Choose another pathway
            </button>
          )}
        </div>
        {body}
      </main>
    </div>
  );
}

/** The four registration pathways, as event registration lists its tickets: each with who it is for. */
function Chooser({ onPick, title }: { onPick: (m: ApplyMode) => void; title?: string }) {
  return (
    <section className="surface p-6" aria-label="Registration pathways">
      {title && <h2 className="h2 mb-4">{title}</h2>}
      {APPLY_MODES.map((m) => (
        <button key={m} type="button" className="choice" aria-label={TITLE[m]} onClick={() => onPick(m)}>
          <span className="choice__title">{ROLE_LABEL[m]}</span>
          <span className="choice__act btn btn-secondary btn-sm" aria-hidden="true">
            {m === "challenge" ? "Submit" : "Register"} <span aria-hidden="true">→</span>
          </span>
          <span className="choice__text">{WHO_FOR[m]}</span>
        </button>
      ))}
    </section>
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
                {ROLE_LABEL[a.mode]} · {a.ref ? <span className="font-mono">{a.ref}</span> : "Draft"} · {OPEN.includes(a.status) ? "not submitted yet" : a.status}
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
