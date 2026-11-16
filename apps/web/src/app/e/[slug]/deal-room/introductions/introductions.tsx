"use client";

/**
 * A Deal Room participant's introductions (backend-plan.md, M3.1). The emails about them link here; the participant
 * signs in with the email they applied with. Each introduction shows the brief and asks for an answer by its date.
 * A business chooses, when it accepts, which of its documents the counterparty may open, and can withdraw any one
 * later; it sees every opening of its file. A counterparty opens the business's profile at once, and each document
 * the business shares once both have accepted, as a copy stamped with its own name.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MyIntroduction, MyIntroductions, SeekerProfile } from "@excursia/contracts/matching";
import { fmtStamp } from "@excursia/domain/time";
import { useSession } from "@/features/auth/hooks/use-session";
import { useSignOut } from "@/features/auth/hooks/use-sign-in";
import { useIntroActions, useIntroductions } from "@/features/matching/hooks/use-introductions";

export function MyIntroductionsPage({ slug }: { slug: string }) {
  const router = useRouter();
  const session = useSession();
  const participant = session.data?.user.kind === "participant";
  const q = useIntroductions(slug, participant);
  const signOut = useSignOut();
  const here = `/e/${slug}/deal-room/introductions`;

  let body: React.ReactNode;
  if (session.isPending || (participant && q.isPending)) body = <Panel>Loading…</Panel>;
  else if (!session.data)
    body = (
      <Panel title="Sign in to see your introductions">
        <p className="mb-4 text-[14px] text-slate">Use the email you applied with. We email you a six-digit code; no password needed.</p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => router.push(`/signin?next=${encodeURIComponent(here)}`)}>
          Sign in with your email
        </button>
      </Panel>
    );
  else if (!participant)
    body = (
      <Panel>
        <p className="mb-4 text-[15px]">You are signed in with a staff account. To see your own introductions, sign out and sign in with the email you applied with.</p>
        <button className="btn btn-secondary" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          Sign out
        </button>
      </Panel>
    );
  else if (q.isError) body = <Panel>{q.error.message}</Panel>;
  else if (!q.data?.introductions.length && !q.data?.access.length)
    body = (
      <Panel title="No introductions yet">
        <p className="text-[14px] text-slate">
          The Deal Room team introduces you to investors, partners or businesses that fit, once your application is approved. We email you when one is waiting. Signed in as {session.data.user.email}.
        </p>
      </Panel>
    );
  else
    body = (
      <>
        {q.data.introductions.map((i) => (
          <Introduction key={`${i.matchId}:${i.side}`} slug={slug} i={i} />
        ))}
        {q.data.access.length > 0 && <AccessLog access={q.data.access} />}
      </>
    );

  return (
    <div className="min-h-screen bg-paper">
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="h2">My introductions</h1>
            {q.data && <p className="text-[14px] text-slate">{q.data.event.name} Deal Room</p>}
          </div>
          <Link href={`/e/${slug}/deal-room/apply`} className="link text-[14px]">
            My application
          </Link>
        </div>
        {body}
      </main>
    </div>
  );
}

function Panel({ title, children, aside }: { title?: string; children: React.ReactNode; aside?: React.ReactNode }) {
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

const STATUS: Record<MyIntroduction["stage"], string> = { Introduced: "bg-warn-50 text-warn", Accepted: "bg-ok-50 text-ok", Declined: "bg-paper-200 text-slate", Expired: "bg-paper-200 text-slate" };

function Introduction({ slug, i }: { slug: string; i: MyIntroduction }) {
  const act = useIntroActions(slug, i.matchId);
  const [consent, setConsent] = useState<string[]>(() => i.documents.map((d) => d.id));
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [profile, setProfile] = useState<SeekerProfile | null>(null);
  const answering = !i.mine && i.stage === "Introduced";
  const status = i.stage === "Introduced" ? (i.mine ? `Waiting for ${i.other.org}` : `Answer by ${fmtStamp(i.expiresAt)}`) : i.stage === "Accepted" ? "Both accepted" : i.stage;
  const error = act.respond.error ?? act.consent.error ?? act.profile.error ?? act.open.error;
  return (
    <Panel title={i.other.org} aside={<span className={`pill whitespace-nowrap ${STATUS[i.stage]}`}>{status}</span>}>
      <p className="-mt-2 mb-3 text-[13px] text-slate">
        {i.other.label} · introduced {fmtStamp(i.sentAt)}
      </p>
      <p className="whitespace-pre-line text-[15px] leading-relaxed">{i.brief.text}</p>
      {i.brief.agenda.length > 0 && (
        <>
          <p className="mt-3 text-[13px] font-medium">The meeting&apos;s agenda</p>
          <ol className="mt-1 list-decimal pl-5 text-[14px] text-slate">
            {i.brief.agenda.map((a, n) => (
              <li key={n}>{a}</li>
            ))}
          </ol>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
          {error.message}
        </p>
      )}

      {i.side === "provider" && i.stage !== "Expired" && i.stage !== "Declined" && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[13px] font-medium">Shared with this introduction</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" disabled={act.profile.isPending} onClick={() => act.profile.mutate(undefined, { onSuccess: setProfile })}>
              Open the full profile
            </button>
          </div>
          {profile && <Profile p={profile} onClose={() => setProfile(null)} />}
          {i.documents.length > 0 && (
            <ul className="mt-3 grid gap-2">
              {i.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                  <span>
                    {d.kind}
                    {!d.opens.ok && d.opens.reason && <span className="block text-[12px] text-slate">{d.opens.reason}</span>}
                  </span>
                  {d.opens.ok && (
                    <span className="flex gap-2">
                      {d.stamped && (
                        <button className="btn-secondary btn-sm" disabled={act.open.isPending} onClick={() => act.open.mutate({ docId: d.id, action: "view", tab: window.open("", "_blank") })}>
                          Open
                        </button>
                      )}
                      {d.download && (
                        <button className="btn-quiet btn-sm" disabled={act.open.isPending} onClick={() => act.open.mutate({ docId: d.id, action: "download", tab: null })}>
                          Download
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[12px] text-slate">Documents open as a copy stamped with your name and organisation. The business sees each opening.</p>
        </div>
      )}

      {i.side === "seeker" && i.stage === "Accepted" && i.documents.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[13px] font-medium">What {i.other.org} may open</p>
          <ul className="mt-2 grid gap-2">
            {i.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                <span>
                  {d.kind}
                  <span className="block text-[12px] text-slate">
                    {d.shared ? "Shared" : "Not shared"} · {d.opened.length ? `${d.opened[0].action === "download" ? "downloaded" : "opened"} ${fmtStamp(d.opened[0].at)}` : "not opened"}
                  </span>
                </span>
                <button className={`btn-secondary btn-sm ${d.shared ? "text-bad" : ""}`} disabled={act.consent.isPending} onClick={() => act.consent.mutate({ docId: d.id, granted: !d.shared })}>
                  {d.shared ? "Withdraw" : "Share"}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-slate">Withdrawing stops access at once. What was already opened stays in the list below.</p>
        </div>
      )}

      {answering && (
        <div className="mt-4 border-t border-line pt-3">
          {i.side === "seeker" && i.documents.length > 0 && (
            <fieldset>
              <legend className="text-[13px] font-medium">Which documents may {i.other.org} open?</legend>
              {i.documents.map((d) => (
                <label key={d.id} className="mt-1.5 flex items-center gap-2 text-[14px]">
                  <input type="checkbox" checked={consent.includes(d.id)} onChange={(e) => setConsent(e.target.checked ? [...consent, d.id] : consent.filter((x) => x !== d.id))} />
                  {d.kind}
                </label>
              ))}
              <p className="mt-1 text-[12px] text-slate">Your profile goes with the introduction. Each document goes only if ticked, and only once both of you accept.</p>
            </fieldset>
          )}
          {declining ? (
            <div className="mt-3 grid gap-2">
              <label className="block">
                <span className="label">Why not? The Deal Room team reads this to find you a better match.</span>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={!reason.trim() || act.respond.isPending} onClick={() => act.respond.mutate({ response: "Declined", reason })}>
                  Decline the introduction
                </button>
                <button className="btn-quiet" onClick={() => setDeclining(false)}>
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-primary" disabled={act.respond.isPending} onClick={() => act.respond.mutate({ response: "Accepted", consent: i.side === "seeker" ? consent : [] })}>
                Accept the introduction
              </button>
              <button className="btn-secondary" onClick={() => setDeclining(true)}>
                Decline
              </button>
            </div>
          )}
          <p className="mt-2 text-[12px] text-slate">
            A meeting is booked only if both of you accept. {i.other.org} {i.theirs ? `has ${i.theirs.response.toLowerCase()}` : "hasn't answered yet"}.
          </p>
        </div>
      )}
      {i.mine && (
        <p className="mt-3 text-[13px] text-slate">
          You {i.mine.response.toLowerCase()} on {fmtStamp(i.mine.at)}
          {i.mine.reason ? `: ${i.mine.reason}` : ""}.{i.theirs && i.stage !== "Accepted" ? ` ${i.other.org} ${i.theirs.response.toLowerCase()}.` : ""}
        </p>
      )}
      {i.stage === "Expired" && !i.mine && <p className="mt-3 text-[13px] text-slate">This introduction expired unanswered on {fmtStamp(i.expiresAt)}.</p>}
    </Panel>
  );
}

function Profile({ p, onClose }: { p: SeekerProfile; onClose: () => void }) {
  const rows: [string, string][] = [
    ["Sector and country", `${p.sector}, ${p.country}`],
    ["Ask", p.ask],
    ["Use of funds", p.useOfFunds],
    ["Traction", p.traction],
    ["Decision-maker", p.decisionMaker],
    ["Contact", p.contact],
    ...(p.website ? ([["Website", p.website]] as [string, string][]) : []),
  ];
  return (
    <div className="mt-3 rounded-lg border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{p.org}: full profile</p>
        <button className="btn-quiet btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <dl className="mt-2 grid gap-1.5 text-[14px]">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="inline text-slate">{k}: </dt>
            <dd className="inline">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[12px] text-slate">Opened {fmtStamp(p.openedAt)}. The business sees this opening.</p>
    </div>
  );
}

function AccessLog({ access }: { access: MyIntroductions["access"] }) {
  return (
    <Panel title="Who opened your file">
      <ul>
        {access.map((a, n) => (
          <li key={n} className="flex flex-wrap justify-between gap-2 border-b border-line py-2 text-[14px] last:border-0">
            <span>
              <b className="font-medium">{a.who}</b> {a.action === "download" ? "downloaded" : "opened"} {a.what.toLowerCase()}
            </span>
            <span className="text-[12px] text-slate">{fmtStamp(a.at)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
