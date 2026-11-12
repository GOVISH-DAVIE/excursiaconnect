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

/** An amount in the event's own currency. */
const money = (n: number, currency: string) => `${currency} ${n.toLocaleString("en-KE")}`;
/** Rate cards are set in Kenya shillings; an event charged in another currency gets its fees typed in afresh. */
const CARD_CURRENCY = "KES";

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
                  ["Licence fee", money(e.terms.licenceFee, e.currency)],
                  ["One-off fee", money(e.terms.oneOffFee, e.currency)],
                  ["Gateway fees borne by", e.terms.gatewayFeesBorneBy],
                  ["On-site", `${e.terms.staffCount} staff, ${e.terms.stations} station${e.terms.stations === 1 ? "" : "s"} a day`],
                  ["Deal Room", e.terms.dealRoom.enabled ? `${money(e.terms.dealRoom.addOnPrice, e.currency)}, ${e.terms.dealRoom.deskStaff} desk staff a day` : "Not included"],
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
        ["Kind", e.kind === "dealroom" ? "A Deal Room on its own" : "A summit or conference"],
        ["Time zone and currency", `${e.timezone}, ${e.currency}`],
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
  // the organiser's rate card, for this kind of event (PA-4)
  const st = e.startTerms;
  // the card's fees are in shillings: for an event charged in dollars they'd be wildly wrong, so they start empty
  const fromCard = e.currency === CARD_CURRENCY;
  const fee = (n: number) => (fromCard ? String(n) : "");
  const [t, setT] = useState({
    commissionPct: String(st.commissionPct),
    oneOffFee: fee(st.oneOffFee),
    licenceFee: fee(st.licenceFee),
    gatewayFeesBorneBy: st.gatewayFeesBorneBy,
    staffCount: String(st.staffCount),
    stations: String(st.stations),
    dealRoom: st.dealRoom.enabled,
    addOnPrice: fee(st.dealRoom.addOnPrice),
    deskStaff: String(st.dealRoom.deskStaff),
  });
  const [note, setNote] = useState("");
  if (e.state !== "Submitted" && e.state !== "Under review") return null;
  const dealroomOnly = e.kind === "dealroom";
  const num = (k: "commissionPct" | "oneOffFee" | "licenceFee" | "addOnPrice" | "deskStaff" | "staffCount" | "stations", label: string) => (
    <div>
      <label className="label" htmlFor={`t-${k}`}>
        {label}
      </label>
      <input id={`t-${k}`} className="input" type="number" min={0} value={t[k]} onChange={(x) => setT((v) => ({ ...v, [k]: x.target.value }))} />
    </div>
  );
  const verified = e.organiser.kycStatus === "Verified";
  const c = e.currency;
  const withDealRoom = t.dealRoom || dealroomOnly;
  const feesMissing = [t.licenceFee, t.oneOffFee, ...(withDealRoom ? [t.addOnPrice] : [])].some((v) => v.trim() === "");
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
        {fromCard ? (
          <p className="text-[13px] text-slate">Starting from {e.organiser.name}&apos;s rate card. Change any figure for this event.</p>
        ) : (
          <p className="text-[13px] text-slate">
            This event charges in {c}, and {e.organiser.name}&apos;s rate card is in {CARD_CURRENCY}: enter each fee in {c}. Commission and staffing start from the card.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {num("commissionPct", "Commission %")}
          {num("licenceFee", `Licence fee (${c})`)}
          {num("oneOffFee", `One-off fee (${c})`)}
          <div>
            <label className="label" htmlFor="t-gw">
              Gateway fees borne by
            </label>
            <select id="t-gw" className="input" value={t.gatewayFeesBorneBy} onChange={(x) => setT((v) => ({ ...v, gatewayFeesBorneBy: x.target.value as "Algotech" | "Organiser" }))}>
              <option>Algotech</option>
              <option>Organiser</option>
            </select>
          </div>
          {num("staffCount", "On-site staff a day")}
          {num("stations", "Accreditation stations")}
        </div>
        <div className="rounded-md border border-line p-3">
          {dealroomOnly ? (
            <p className="text-[14px] font-medium">The Deal Room (this event is a Deal Room on its own)</p>
          ) : (
            <label className="flex items-center gap-2 text-[14px] font-medium">
              <input type="checkbox" checked={t.dealRoom} onChange={(x) => setT((v) => ({ ...v, dealRoom: x.target.checked }))} />
              Deal Room add-on{e.dealRoomRequest ? " (asked for)" : ""}
            </label>
          )}
          {(t.dealRoom || dealroomOnly) && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {num("addOnPrice", dealroomOnly ? `Deal Room price (${c})` : `Add-on price (${c})`)}
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
            disabled={!verified || feesMissing || decide.isPending}
            title={feesMissing ? `Enter the fees in ${c}` : undefined}
            onClick={() =>
              decide.mutate({
                to: "Approved",
                note: note || undefined,
                terms: {
                  commissionPct: Number(t.commissionPct),
                  oneOffFee: Number(t.oneOffFee),
                  licenceFee: Number(t.licenceFee),
                  gatewayFeesBorneBy: t.gatewayFeesBorneBy,
                  staffCount: Number(t.staffCount),
                  stations: Number(t.stations),
                  dealRoom: { enabled: withDealRoom, addOnPrice: Number(t.addOnPrice), deskStaff: Number(t.deskStaff) },
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
  const change = useEventChange((a: { staffId: string; role: DealRoomStaffInput["role"]; canDecide: boolean }) => onboardingApi.changeStaff(e.id, a.staffId, { role: a.role, canDecide: a.canDecide }));
  const remove = useEventChange((staffId: string) => onboardingApi.removeStaff(e.id, staffId));
  const [removing, setRemoving] = useState<string | null>(null);
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
            {admin && <th className="th" />}
          </tr>
        </thead>
        <tbody>
          {dr.staff
            .filter((s) => s.active)
            .map((s) => (
              <tr key={s.id}>
                <td className="td">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-[13px] text-slate">{s.email}</div>
                </td>
                <td className="td">
                  {admin && s.role !== "Lead" ? (
                    <div className="space-y-1">
                      <select
                        className="input"
                        aria-label={`${s.name}'s role`}
                        value={s.role}
                        disabled={change.isPending}
                        onChange={(x) => change.mutate({ staffId: s.id, role: x.target.value as DealRoomStaffInput["role"], canDecide: s.canDecide })}
                      >
                        {DR_ROLES.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                      {s.role === "Reviewer" && (
                        <label className="flex items-center gap-2 text-[13px]">
                          <input type="checkbox" checked={s.canDecide} disabled={change.isPending} onChange={(x) => change.mutate({ staffId: s.id, role: s.role as DealRoomStaffInput["role"], canDecide: x.target.checked })} />
                          May decide
                        </label>
                      )}
                    </div>
                  ) : (
                    <>
                      {s.role}
                      {s.canDecide && s.role !== "Lead" ? ", may decide" : ""}
                    </>
                  )}
                </td>
                <td className="td hidden sm:table-cell">{s.signedUp ? <Tone tone="ok">Password set</Tone> : <Tone tone="warn">Invited</Tone>}</td>
                {admin && (
                  <td className="td text-right">
                    {s.role !== "Lead" &&
                      (removing === s.id ? (
                        <button className="btn-secondary btn-sm text-bad" disabled={remove.isPending} onClick={() => remove.mutate(s.id, { onSettled: () => setRemoving(null) })}>
                          Remove {s.name.split(" ")[0]}?
                        </button>
                      ) : (
                        <button className="btn-secondary btn-sm" onClick={() => setRemoving(s.id)}>
                          Remove
                        </button>
                      ))}
                  </td>
                )}
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
      <div className="px-5">
        <Failed error={change.error ?? remove.error} />
      </div>
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
          <label className={`flex items-center gap-2 self-end pb-2 text-[14px] ${f.role === "Reviewer" || f.role === "Lead" ? "" : "invisible"}`}>
            <input type="checkbox" checked={f.role === "Lead" || !!f.canDecide} disabled={f.role !== "Reviewer"} onChange={(x) => setF({ ...f, canDecide: x.target.checked })} />
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
