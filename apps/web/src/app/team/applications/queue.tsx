"use client";

/**
 * The review queue on the API, and the worked example of docs/architecture.md: pick applications, pick a
 * reviewer, assign. The screen only renders what hooks return and calls what they offer; the API runs the
 * prototype's own rule and says why when it refuses.
 */
import Link from "next/link";
import { useState } from "react";
import type { ApplicationSummary, StaffMember } from "@excursia/contracts/dealroom";
import { ROLES, ROLE_LABEL } from "@excursia/domain/dealroom/logic";
import { PageHeader, Section } from "@/components/ui";
import { useApplications } from "@/features/dealroom/hooks/use-applications";
import { useAssignReviewer } from "@/features/dealroom/hooks/use-assign-reviewer";
import { useTeam } from "@/features/dealroom/hooks/use-team";
import { useSession } from "@/features/auth/hooks/use-session";
import { rolesOf } from "@/features/auth/roles";
import { useDealRoomSettings } from "@/features/onboarding/hooks/use-onboarding";

const STATUSES = ["Submitted", "In review", "Information requested", "Decided"] as const;

export function Queue({ eventId }: { eventId: string }) {
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [pathway, setPathway] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reviewer, setReviewer] = useState("");
  const team = useTeam(eventId);
  const queue = useApplications(eventId, { status: status || undefined, assignee: assignee || undefined });
  const assign = useAssignReviewer(eventId);

  const staff = team.data?.staff ?? [];
  const name = (id: string | null) => (id ? (staff.find((s) => s.id === id)?.name ?? id) : "Not assigned");
  // the pathway is narrowed here: the queue holds the event's submitted work, a few hundred rows at most
  const rows = (queue.data ?? []).filter((r) => !pathway || r.pathway === pathway);
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));

  return (
    <div>
      <PageHeader title="Review queue" kicker="Submitted applications and who reviews them. Changes here are saved for everyone." />
      <SetUpFirst eventId={eventId} />

      <div className="mb-4 flex flex-wrap gap-3">
        <select className="input h-10 w-full text-[14px] sm:w-auto sm:min-w-40" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All submitted work</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="input h-10 w-full text-[14px] sm:w-auto sm:min-w-40" aria-label="Pathway" value={pathway} onChange={(e) => setPathway(e.target.value)}>
          <option value="">Every pathway</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <select className="input h-10 w-full text-[14px] sm:w-auto sm:min-w-40" aria-label="Reviewer" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Any reviewer</option>
          <option value="me">Assigned to me</option>
          <option value="none">Not assigned</option>
          {staff.filter((s) => s.canReview).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {team.data?.canAssign && (
        <AssignBar count={picked.size} staff={staff} reviewer={reviewer} setReviewer={setReviewer} pending={assign.isPending} error={assign.error}
          done={assign.isSuccess ? `${assign.data.length} assigned to ${name(assign.data[0]?.assigneeId ?? null)}.` : undefined}
          onAssign={() => assign.mutate({ appIds: [...picked], staffId: reviewer }, { onSuccess: () => setPicked(new Set()) })} />
      )}

      <Section title={queue.isPending ? "Loading…" : `${rows.length} application${rows.length === 1 ? "" : "s"}`}>
        {queue.error && <p role="alert" className="px-4 py-3 text-[14px] text-bad">{queue.error.message}</p>}
        <table className="w-full text-[14px]">
          <thead>
            <tr>
              {team.data?.canAssign && (
                <th className="th w-10">
                  <input type="checkbox" aria-label="Choose all" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />
                </th>
              )}
              <th className="th">Reference</th>
              <th className="th">Organisation</th>
              <th className="th hidden sm:table-cell">Status</th>
              <th className="th hidden sm:table-cell">Reviewer</th>
              <th className="th hidden md:table-cell">Decision</th>
            </tr>
          </thead>
          <tbody className={queue.isPlaceholderData ? "opacity-60" : ""}>
            {rows.map((a) => (
              <Row key={a.id} a={a} reviewer={name(a.assigneeId)} pickable={!!team.data?.canAssign} picked={picked.has(a.id)} onPick={() => toggle(a.id)} />
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Row({ a, reviewer, pickable, picked, onPick }: { a: ApplicationSummary; reviewer: string; pickable: boolean; picked: boolean; onPick: () => void }) {
  return (
    <tr className={picked ? "bg-ok-50" : ""}>
      {pickable && (
        <td className="td">
          <input type="checkbox" aria-label={`Choose ${a.org}`} checked={picked} onChange={onPick} />
        </td>
      )}
      <td className="td whitespace-nowrap font-mono text-[12px] sm:text-[13px]">{a.ref ?? a.id}</td>
      <td className="td">
        <Link href={`/team/applications/${a.id}`} className="font-medium hover:underline">
          {a.org}
        </Link>
        <span className="block text-[13px] text-slate">
          {ROLE_LABEL[a.pathway]}
          {a.country ? `, ${a.country}` : ""}
        </span>
        {/* on a phone the status and reviewer columns fold in here */}
        <span className="mt-1 block text-[13px] sm:hidden">
          {a.status} · <span className={a.assigneeId ? "" : "text-slate"}>{reviewer}</span>
        </span>
      </td>
      <td className="td hidden whitespace-nowrap sm:table-cell">{a.status}</td>
      <td className={`td hidden whitespace-nowrap sm:table-cell ${a.assigneeId ? "" : "text-slate"}`}>{reviewer}</td>
      <td className="td hidden whitespace-nowrap md:table-cell">{a.decision ?? "–"}</td>
    </tr>
  );
}

function AssignBar(p: { count: number; staff: StaffMember[]; reviewer: string; setReviewer: (id: string) => void; pending: boolean; error: Error | null; done?: string; onAssign: () => void }) {
  return (
    <div className="surface mb-4 flex flex-wrap items-center gap-3 p-3">
      <span className="text-[14px]">{p.count ? `${p.count} chosen` : "Choose applications to assign"}</span>
      <select className="input h-10 w-full text-[14px] sm:w-auto sm:min-w-48" aria-label="Assign to" value={p.reviewer} onChange={(e) => p.setReviewer(e.target.value)}>
        <option value="">Assign to…</option>
        {p.staff.filter((s) => s.canReview).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.role})
          </option>
        ))}
      </select>
      <button className="btn-primary btn-sm" disabled={!p.count || !p.reviewer || p.pending} onClick={p.onAssign}>
        {p.pending ? "Assigning…" : "Assign"}
      </button>
      {p.error && <span role="alert" className="text-[14px] text-bad">{p.error.message}</span>}
      {!p.error && p.done && <span role="status" className="text-[14px] text-ok">{p.done}</span>}
    </div>
  );
}

/** For the lead: what still stops applications coming in, until the Deal Room is set up. */
function SetUpFirst({ eventId }: { eventId: string }) {
  const lead = rolesOf(useSession().data).lead;
  const settings = useDealRoomSettings(eventId, lead);
  const gaps = settings.data?.gaps ?? [];
  if (!lead || !gaps.length) return null;
  return (
    <div className="mb-4 rounded-lg border border-warn bg-warn-50 px-4 py-3 text-[14px]">
      <p className="font-medium">Applications open once the Deal Room is set up: {gaps.join("; ").toLowerCase()}.</p>
      <Link href="/team/dealroom/settings" className="mt-1 inline-block underline underline-offset-4">
        Open the Deal Room settings
      </Link>
    </div>
  );
}
