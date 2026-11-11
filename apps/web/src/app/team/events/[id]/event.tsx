"use client";

/**
 * One event, for its organiser and for Algotech. The organiser edits the draft, sends it, and publishes it once
 * approved. Algotech reviews it (approve with terms, ask for changes, reject) and gives its Deal Room its staff.
 */
import Link from "next/link";
import { useState } from "react";
import { DR_ROLES, type DealRoomStaffInput, type EventDecisionInput, type EventInput, type EventView } from "@excursia/contracts/onboarding";
import { KV, PageHeader, Section, Tone } from "@/components/ui";
import { useSession } from "@/features/auth/hooks/use-session";
import { rolesOf } from "@/features/auth/roles";
import { onboardingApi } from "@/features/onboarding/api";
import { useEvent, useEventChange } from "@/features/onboarding/hooks/use-onboarding";
import { Failed, Gaps, History, Loading, StateTone } from "../../bits";
import { EventForm } from "../event-form";

const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

export function EventScreen({ id }: { id: string }) {
  const event = useEvent(id);
  const admin = rolesOf(useSession().data).admin;
  if (event.isPending) return <Loading />;
  if (event.isError) return <Failed error={event.error} />;
  const e = event.data;
  return (
    <>
      <PageHeader
        title={e.name}
        badge={<StateTone state={e.state} />}
        crumbs={admin ? [{ href: "/team/admin", label: "Organisers and events" }, { label: e.name }] : [{ href: "/team/events", label: "Events" }, { label: e.name }]}
        kicker={
          <>
            {e.organiser.name} · {e.startDate === e.endDate ? e.startDate : `${e.startDate} to ${e.endDate}`} · {e.city || "city to be set"} · /e/{e.slug}
          </>
        }
      />
      {e.reviewNote && (e.state === "Changes requested" || e.state === "Rejected") && (
        <p className="mb-4 rounded-lg border border-bad bg-bad-50 px-4 py-3 text-[14px]">
          <span className="font-medium text-bad">Algotech: </span>
          {e.reviewNote}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {admin ? <AdminReview e={e} /> : <OwnerSteps e={e} />}
          <Section title="Details">
            {admin ? <Details e={e} /> : <OwnerForm e={e} />}
          </Section>
          {e.dealRoom && <DealRoomPanel e={e} admin={admin} />}
        </div>
        <div className="space-y-4">
          {e.terms && (
            <Section title="Terms, as approved">
              <KV
                rows={[
                  ["Commission", `${e.terms.commissionPct}%`],
                  ["Licence fee", kes(e.terms.licenceFee)],
                  ["One-off fee", kes(e.terms.oneOffFee)],
                  ["Gateway fees borne by", e.terms.gatewayFeesBorneBy],
                  ["Deal Room", e.terms.dealRoom.enabled ? `${kes(e.terms.dealRoom.addOnPrice)}, ${e.terms.dealRoom.deskStaff} desk staff a day` : "Not included"],
                ]}
              />
            </Section>
          )}
          <Section title="History">
            <History items={e.history} />
          </Section>
        </div>
      </div>
    </>
  );
}

function Details({ e }: { e: EventView }) {
  return (
    <KV
      rows={[
        ["Tagline", e.tagline || "—"],
        ["Venue", e.venue || "—"],
        ["City", e.city || "—"],
        ["Dates", `${e.startDate} to ${e.endDate}`],
        ["Expected attendance", e.expectedAttendance.toLocaleString("en-KE")],
        ["Deal Room asked for", e.dealRoomRequest ? `Yes, lead ${e.dealRoomRequest.lead.name} (${e.dealRoomRequest.lead.email})` : "No"],
        ["Organiser KYC", e.organiser.kycStatus],
      ]}
    />
  );
}

function OwnerForm({ e }: { e: EventView }) {
  const save = useEventChange((input: EventInput) => onboardingApi.saveEvent(e.id, input));
  if (!e.can.edit) return <Details e={e} />;
  return (
    <>
      <EventForm key={e.history.length} initial={e} submitLabel="Save changes" busy={save.isPending} onSave={(input) => save.mutate(input)} />
      <div className="mt-3">
        <Failed error={save.error} />
      </div>
    </>
  );
}

/** What the organiser does next: send it, wait, or publish it. */
function OwnerSteps({ e }: { e: EventView }) {
  const submit = useEventChange(() => onboardingApi.submitEvent(e.id));
  const publish = useEventChange(() => onboardingApi.publishEvent(e.id));
  if (e.can.edit)
    return (
      <Section title="Send to Algotech">
        <div className="space-y-3">
          <Gaps title="Still needed before sending" gaps={e.gaps} />
          {e.organiser.kycStatus !== "Verified" && (
            <p className="text-[14px] text-slate">
              Your KYC must be verified first.{" "}
              <Link href="/team/organisation" className="underline underline-offset-4">
                KYC
              </Link>
            </p>
          )}
          <Failed error={submit.error} />
          <button className="btn-primary" disabled={!e.can.submit || submit.isPending} onClick={() => submit.mutate(undefined)}>
            {submit.isPending ? "Sending…" : "Send for approval"}
          </button>
        </div>
      </Section>
    );
  if (e.state === "Submitted" || e.state === "Under review") return <p className="rounded-lg bg-paper-200 px-4 py-3 text-[14px]">With Algotech for approval. You&apos;ll see their answer here.</p>;
  if (e.can.publish)
    return (
      <Section title="Approved: publish it">
        <p className="mb-3 text-[14px] text-slate">Publishing opens the event&apos;s public page{e.terms?.dealRoom.enabled ? ", and its Deal Room once the lead has set it up" : ""}.</p>
        <Failed error={publish.error} />
        <button className="btn-primary" disabled={publish.isPending} onClick={() => publish.mutate(undefined)}>
          {publish.isPending ? "Publishing…" : "Publish the event"}
        </button>
      </Section>
    );
  return null;
}

/** Algotech's review of a submitted event: terms for an approval, a note for anything else. */
function AdminReview({ e }: { e: EventView }) {
  const decide = useEventChange((input: EventDecisionInput) => onboardingApi.decideEvent(e.id, input));
  const [t, setT] = useState({ commissionPct: "5", oneOffFee: "0", licenceFee: "120000", gatewayFeesBorneBy: "Algotech" as "Algotech" | "Organiser", dealRoom: !!e.dealRoomRequest, addOnPrice: "450000", deskStaff: "3" });
  const [note, setNote] = useState("");
  if (e.state !== "Submitted" && e.state !== "Under review") return null;
  const num = (k: "commissionPct" | "oneOffFee" | "licenceFee" | "addOnPrice" | "deskStaff", label: string) => (
    <div>
      <label className="label" htmlFor={`t-${k}`}>
        {label}
      </label>
      <input id={`t-${k}`} className="input" type="number" min={0} value={t[k]} onChange={(x) => setT((v) => ({ ...v, [k]: x.target.value }))} />
    </div>
  );
  const verified = e.organiser.kycStatus === "Verified";
  return (
    <Section title="Algotech's review">
      <div className="space-y-4">
        {!verified && (
          <p className="text-[14px] text-bad">
            The organiser&apos;s KYC is {e.organiser.kycStatus.toLowerCase()}.{" "}
            <Link href={`/team/admin/organisers/${e.organiser.id}`} className="underline underline-offset-4">
              Check it
            </Link>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {num("commissionPct", "Commission %")}
          {num("licenceFee", "Licence fee (KES)")}
          {num("oneOffFee", "One-off fee (KES)")}
          <div>
            <label className="label" htmlFor="t-gw">
              Gateway fees borne by
            </label>
            <select id="t-gw" className="input" value={t.gatewayFeesBorneBy} onChange={(x) => setT((v) => ({ ...v, gatewayFeesBorneBy: x.target.value as "Algotech" | "Organiser" }))}>
              <option>Algotech</option>
              <option>Organiser</option>
            </select>
          </div>
        </div>
        <div className="rounded-md border border-line p-3">
          <label className="flex items-center gap-2 text-[14px] font-medium">
            <input type="checkbox" checked={t.dealRoom} onChange={(x) => setT((v) => ({ ...v, dealRoom: x.target.checked }))} />
            Deal Room add-on{e.dealRoomRequest ? " (asked for)" : ""}
          </label>
          {t.dealRoom && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {num("addOnPrice", "Add-on price (KES)")}
              {num("deskStaff", "Desk staff a day")}
            </div>
          )}
        </div>
        <div>
          <label className="label" htmlFor="t-note">
            Note to the organiser
          </label>
          <textarea id="t-note" className="input" rows={2} value={note} onChange={(x) => setNote(x.target.value)} placeholder="Needed to ask for changes or to reject" />
        </div>
        <Failed error={decide.error} />
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-secondary text-bad" disabled={!note.trim() || decide.isPending} onClick={() => decide.mutate({ to: "Rejected", note })}>
            Reject
          </button>
          <button className="btn-secondary" disabled={!note.trim() || decide.isPending} onClick={() => decide.mutate({ to: "Changes requested", note })}>
            Ask for changes
          </button>
          <button
            className="btn-primary"
            disabled={!verified || decide.isPending}
            onClick={() =>
              decide.mutate({
                to: "Approved",
                note: note || undefined,
                terms: {
                  commissionPct: Number(t.commissionPct),
                  oneOffFee: Number(t.oneOffFee),
                  licenceFee: Number(t.licenceFee),
                  gatewayFeesBorneBy: t.gatewayFeesBorneBy,
                  dealRoom: { enabled: t.dealRoom, addOnPrice: Number(t.addOnPrice), deskStaff: Number(t.deskStaff) },
                },
              })
            }
          >
            {decide.isPending ? "Saving…" : "Approve with these terms"}
          </button>
        </div>
      </div>
    </Section>
  );
}

/** The Deal Room: what still stops applications, its staff, and (for Algotech) adding staff accounts. */
function DealRoomPanel({ e, admin }: { e: EventView; admin: boolean }) {
  const dr = e.dealRoom!;
  const hasLead = dr.staff.some((s) => s.role === "Lead" && s.active);
  const ask = e.dealRoomRequest?.lead;
  const [f, setF] = useState<DealRoomStaffInput>({ name: hasLead ? "" : (ask?.name ?? ""), email: hasLead ? "" : (ask?.email ?? ""), role: hasLead ? "Reviewer" : "Lead", canDecide: false });
  const add = useEventChange((input: DealRoomStaffInput) => onboardingApi.addStaff(e.id, input));
  return (
    <Section title="Deal Room" flush>
      <div className="space-y-3 px-5 pb-4">
        {dr.gaps.length ? (
          <Gaps title="Applications open once the lead has:" gaps={dr.gaps} />
        ) : (
          <p className="text-[14px] text-ok">Set up. {e.state === "Live" ? `Applications open at /e/${e.slug}/deal-room/apply.` : "Applications open once the event is published."}</p>
        )}
      </div>
      <table className="w-full">
        <thead>
          <tr>
            <th className="th">Staff</th>
            <th className="th">Role</th>
            <th className="th hidden sm:table-cell">Account</th>
          </tr>
        </thead>
        <tbody>
          {dr.staff.map((s) => (
            <tr key={s.id}>
              <td className="td">
                <div className="font-medium">{s.name}</div>
                <div className="text-[13px] text-slate">{s.email}</div>
              </td>
              <td className="td">
                {s.role}
                {s.canDecide && s.role !== "Lead" ? ", may decide" : ""}
              </td>
              <td className="td hidden sm:table-cell">{s.signedUp ? <Tone tone="ok">Password set</Tone> : <Tone tone="warn">Invited</Tone>}</td>
            </tr>
          ))}
          {!dr.staff.length && (
            <tr>
              <td className="td text-slate" colSpan={3}>
                No staff yet. {admin ? "Add the lead first." : "Algotech adds the lead you named."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {admin && (
        <form
          className="grid gap-3 border-t border-line p-5 sm:grid-cols-2"
          onSubmit={(x) => {
            x.preventDefault();
            add.mutate(f, { onSuccess: () => setF({ name: "", email: "", role: "Reviewer", canDecide: false }) });
          }}
        >
          <p className="text-[14px] font-medium sm:col-span-2">Add a staff account</p>
          <div>
            <label className="label" htmlFor="st-name">
              Name
            </label>
            <input id="st-name" className="input" required value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="st-email">
              Work email
            </label>
            <input id="st-email" className="input" type="email" required value={f.email} onChange={(x) => setF({ ...f, email: x.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="st-role">
              Role
            </label>
            <select id="st-role" className="input" value={f.role} onChange={(x) => setF({ ...f, role: x.target.value as DealRoomStaffInput["role"] })}>
              {DR_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-[14px]">
            <input type="checkbox" checked={f.role === "Lead" || !!f.canDecide} disabled={f.role === "Lead"} onChange={(x) => setF({ ...f, canDecide: x.target.checked })} />
            May decide
          </label>
          <p className="text-[13px] text-slate sm:col-span-2">They set their own password on the sign-in page (Staff → Set or reset your password), then add an authenticator.</p>
          <div className="sm:col-span-2">
            <Failed error={add.error} />
          </div>
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={add.isPending}>
              {add.isPending ? "Adding…" : "Add to the team"}
            </button>
          </div>
        </form>
      )}
    </Section>
  );
}
