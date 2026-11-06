"use client";

import { useState } from "react";
import { Empty, KV, PageHeader, Section } from "@/components/ui";
import { useStore } from "@/lib/store";
import { EV_CA3, compact, publicStatus } from "@/lib/dealroom/logic";
import type { DrRole } from "@/lib/dealroom/types";
import { fmtStamp } from "@/lib/time";
import { DocLine } from "@/app/dealroom/bits";

/** DA-2, DA-3, DA-5: Algotech provisions the Deal Room staff and opens a participant's file only under a lead's grant. */
export default function AdminDealRoom() {
  const { state, dispatch } = useStore();
  const dr = state.dealRoom;
  const event = state.events.find((e) => e.id === EV_CA3)!;
  const [draft, setDraft] = useState({ name: "", email: "", role: "Reviewer" as DrRole, canDecide: false });
  const [lookup, setLookup] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);
  const viewer = "Algotech support";
  const target = dr.apps.find((a) => a.ref?.toLowerCase() === lookup.trim().toLowerCase() || a.id === lookup.trim());
  const grant = target && dr.grants.find((g) => g.appId === target.id && g.to === viewer && g.expires > dr.clock);
  const open = viewing ? dr.apps.find((a) => a.id === viewing) : undefined;

  return (
    <>
      <PageHeader title="Deal Room" kicker={`${event.name}: add-on KES ${event.dealRoom?.addOnPrice.toLocaleString("en-KE")}, ${event.dealRoom?.deskStaff} desk staff a day. Algotech enables and supports; it takes no part in deal decisions.`} />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Section title={`Staff accounts, ${dr.staff.filter((s) => s.active).length} active`} flush>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Person</th>
                <th className="th">Role</th>
                <th className="th">May decide</th>
                <th className="th">MFA</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {dr.staff.map((s) => (
                <tr key={s.id} className={s.active ? "" : "opacity-60"}>
                  <td className="td">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-[12px] text-slate">{s.email}</div>
                  </td>
                  <td className="td">
                    <select className="input h-8 w-auto text-[13px]" disabled={!s.active} value={s.role} onChange={(e) => dispatch({ type: "dr/staffSet", staffId: s.id, role: e.target.value as DrRole, canDecide: e.target.value === "Lead" ? true : e.target.value === "Operations" ? false : s.canDecide, mfa: e.target.value === "Operations" ? s.mfa : true })}>
                      <option>Lead</option>
                      <option>Reviewer</option>
                      <option>Operations</option>
                    </select>
                  </td>
                  <td className="td">
                    <input type="checkbox" aria-label={`${s.name} may decide`} disabled={!s.active || s.role !== "Reviewer"} checked={s.canDecide} onChange={(e) => dispatch({ type: "dr/staffSet", staffId: s.id, role: s.role, canDecide: e.target.checked, mfa: s.mfa })} />
                  </td>
                  <td className="td">
                    <input type="checkbox" aria-label={`${s.name} MFA`} disabled={!s.active || s.role !== "Operations"} checked={s.mfa} onChange={(e) => dispatch({ type: "dr/staffSet", staffId: s.id, role: s.role, canDecide: s.canDecide, mfa: e.target.checked })} />
                  </td>
                  <td className="td text-right">
                    {s.active ? (
                      <button className="btn-quiet text-bad" onClick={() => dispatch({ type: "dr/staffRevoke", staffId: s.id })}>
                        Revoke
                      </button>
                    ) : (
                      <span className="text-[12px] text-slate">Revoked {s.revokedAt && fmtStamp(s.revokedAt)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-5 py-3 text-[12px] text-slate">Leads and reviewers always sign in with MFA. Revoking takes effect at once and is logged.</p>
        </Section>

        <Section title="Add a staff account">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email)) return;
              dispatch({
                type: "dr/staffAdd",
                staff: { id: `st_${Date.now().toString(36)}`, eventId: EV_CA3, name: draft.name.trim(), email: draft.email.trim(), role: draft.role, canDecide: draft.role === "Lead" || (draft.role === "Reviewer" && draft.canDecide), mfa: draft.role !== "Operations", active: true, addedAt: dr.clock },
              });
              setDraft({ name: "", email: "", role: "Reviewer", canDecide: false });
            }}
          >
            <input className="input" placeholder="Full name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
            <input className="input" type="email" placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} required />
            <select className="input" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as DrRole })}>
              <option>Lead</option>
              <option>Reviewer</option>
              <option>Operations</option>
            </select>
            {draft.role === "Reviewer" && (
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={draft.canDecide} onChange={(e) => setDraft({ ...draft, canDecide: e.target.checked })} />
                May record decisions
              </label>
            )}
            <button className="btn-primary">Create the account</button>
            <p className="text-[12px] text-slate">Scoped to {event.name}. The lead sends the staff list; Algotech creates the accounts.</p>
          </form>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px] mt-4">
        <Section title="Open a participant's file for support">
          <div className="flex flex-wrap gap-2">
            <input className="input h-9 flex-1 min-w-48" placeholder="Reference, for example CA3-CS-00012" value={lookup} onChange={(e) => { setLookup(e.target.value); setViewing(null); }} />
            <button
              className="btn-secondary btn-sm"
              disabled={!target}
              onClick={() => {
                if (!target) return;
                if (grant) dispatch({ type: "dr/supportView", appId: target.id, viewer });
                setViewing(target.id);
              }}
            >
              Open
            </button>
          </div>
          {lookup && !target && <p className="mt-2 text-[13px] text-slate">No application with that reference.</p>}
          {open && !grant && (
            <div className="mt-3 rounded-md bg-bad-50 px-3 py-2 text-[14px]">
              Refused: Algotech has no support access to {open.ref}. The Deal Room lead grants time-limited access from the application&apos;s page; every opening is then logged.
            </div>
          )}
          {open && grant && (
            <div className="mt-4">
              <p className="mb-3 text-[13px] text-slate">
                Under a grant from the lead until {fmtStamp(grant.expires)}: {grant.reason}. This opening is logged.
              </p>
              <KV rows={[["Reference", open.ref ?? "–"], ["Organisation", open.org.name], ["Status", publicStatus(open)], ["Contact", `${open.contact.name}, ${open.contact.email}`], ["Ask", open.ask ? compact(open.ask.amount, open.ask.currency) : "–"]]} />
              <div className="mt-3">{open.documents.length ? open.documents.map((d) => <DocLine key={d.id} doc={d} />) : <Empty>No documents.</Empty>}</div>
            </div>
          )}
        </Section>
        <Section title="Access and provisioning log" flush>
          <ul className="max-h-[420px] overflow-auto">
            {dr.adminLog.map((h, i) => (
              <li key={i} className="px-5 py-2.5 border-b border-line last:border-0 text-[13px]">
                <div className="text-slate">{fmtStamp(h.at)}</div>
                <div>{h.what}</div>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
