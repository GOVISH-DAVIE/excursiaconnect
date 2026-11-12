"use client";

/**
 * Algotech's team, for super admins: who can check KYC and approve events (admins), and who also manages this
 * team and the organisers' rate cards (super admins). An invitation is an email; the person sets their own
 * password and adds an authenticator. Removing someone signs them out everywhere at once.
 */
import { useState } from "react";
import type { AdminInvite, AdminMember } from "@excursia/contracts/onboarding";
import { PageHeader, Section, Tone } from "@/components/ui";
import { useSession } from "@/features/auth/hooks/use-session";
import { rolesOf } from "@/features/auth/roles";
import { onboardingApi } from "@/features/onboarding/api";
import { useAdminTeam, useAdminTeamChange } from "@/features/onboarding/hooks/use-onboarding";
import { Failed, Loading, Signed } from "../../bits";

function Status({ m }: { m: AdminMember }) {
  if (m.status === "removed") return <Tone tone="mute">Removed</Tone>;
  if (m.status === "invited") return <Tone tone="warn">Invited</Tone>;
  return m.mfa ? <Tone tone="ok">Active</Tone> : <Tone tone="warn">Active, no authenticator yet</Tone>;
}

function Team() {
  const team = useAdminTeam();
  const invite = useAdminTeamChange((input: AdminInvite) => onboardingApi.inviteAdmin(input));
  const level = useAdminTeamChange((a: { userId: string; superAdmin: boolean }) => onboardingApi.setAdminLevel(a.userId, a.superAdmin));
  const remove = useAdminTeamChange((userId: string) => onboardingApi.removeAdmin(userId));
  const [f, setF] = useState({ name: "", email: "", superAdmin: false });
  const [confirm, setConfirm] = useState<string | null>(null);
  if (team.isPending) return <Loading />;
  if (team.isError) return <Failed error={team.error} />;
  const current = team.data.filter((m) => m.status !== "removed");
  const removed = team.data.filter((m) => m.status === "removed");

  return (
    <>
      <PageHeader title="Algotech team" kicker="Admins check KYC, approve events and set up Deal Room staff. Super admins also manage this team and the organisers' rate cards." />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Section title={`${current.length} on the team`} flush>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Person</th>
                <th className="th">Level</th>
                <th className="th hidden sm:table-cell">Account</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {current.map((m) => (
                <tr key={m.id}>
                  <td className="td">
                    <div className="font-medium">
                      {m.name}
                      {m.me ? " (you)" : ""}
                    </div>
                    <div className="text-[13px] text-slate">{m.email}</div>
                  </td>
                  <td className="td">{m.superAdmin ? "Super admin" : "Admin"}</td>
                  <td className="td hidden sm:table-cell">
                    <Status m={m} />
                  </td>
                  <td className="td text-right">
                    {!m.me && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <button className="btn-secondary btn-sm" disabled={level.isPending} onClick={() => level.mutate({ userId: m.id, superAdmin: !m.superAdmin })}>
                          {m.superAdmin ? "Make admin" : "Make super admin"}
                        </button>
                        {confirm === m.id ? (
                          <button className="btn-secondary btn-sm text-bad" disabled={remove.isPending} onClick={() => remove.mutate(m.id, { onSettled: () => setConfirm(null) })}>
                            Remove {m.name.split(" ")[0]}?
                          </button>
                        ) : (
                          <button className="btn-secondary btn-sm" onClick={() => setConfirm(m.id)}>
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3">
            <Failed error={level.error ?? remove.error} />
          </div>
          {removed.length > 0 && <p className="border-t border-line px-5 py-3 text-[13px] text-slate">Removed: {removed.map((m) => m.name).join(", ")}. Inviting the same email again brings them back.</p>}
        </Section>

        <Section title="Invite someone">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate(f, { onSuccess: () => setF({ name: "", email: "", superAdmin: false }) });
            }}
          >
            <div>
              <label className="label" htmlFor="ad-name">
                Full name
              </label>
              <input id="ad-name" className="input" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="ad-email">
                Algotech email
              </label>
              <input id="ad-email" className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={f.superAdmin} onChange={(e) => setF({ ...f, superAdmin: e.target.checked })} />
              Super admin
            </label>
            <p className="text-[13px] text-slate">They get an email, set their own password on the sign-in page and add an authenticator before they can decide anything.</p>
            <Failed error={invite.error} />
            <button className="btn-primary w-full" disabled={invite.isPending}>
              {invite.isPending ? "Inviting…" : "Send the invitation"}
            </button>
          </form>
        </Section>
      </div>
    </>
  );
}

function Gate() {
  const roles = rolesOf(useSession().data);
  if (!roles.superAdmin) return <PageHeader title="Algotech team" kicker="Only a super admin manages Algotech's team." />;
  return <Team />;
}

export default function AdminTeamPage() {
  return (
    <Signed>
      <Gate />
    </Signed>
  );
}
