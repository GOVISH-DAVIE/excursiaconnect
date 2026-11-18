"use client";

/** Algotech's queue: organisers whose KYC waits for a check, and events waiting for approval; then everything else. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OpenOrganiser } from "@excursia/contracts/onboarding";
import { onboardingApi } from "@/features/onboarding/api";
import { Empty, PageHeader, Section, Stat } from "@/components/ui";
import { useAdminQueue, useOrganiserChange } from "@/features/onboarding/hooks/use-onboarding";
import { AlgotechOnly, Failed, KycTone, Loading, Signed, StateTone } from "../bits";

function Queue() {
  const q = useAdminQueue();
  const [find, setFind] = useState("");
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const needle = find.trim().toLowerCase();
  const hit = (...xs: string[]) => !needle || xs.some((x) => x.toLowerCase().includes(needle));
  const organisers = q.data.organisers.filter((o) => hit(o.name, o.owner, o.country, o.kycStatus));
  const events = q.data.events.filter((e) => hit(e.name, e.organiser, e.city, e.state));
  const kycWaiting = q.data.organisers.filter((o) => o.kycStatus === "Pending");
  const eventsWaiting = q.data.events.filter((e) => e.state === "Submitted" || e.state === "Under review");
  const order = (s: string) => (s === "Pending" || s === "Submitted" || s === "Under review" ? 0 : 1);
  return (
    <>
      <PageHeader title="Organisers and events" kicker="Algotech checks every organiser once (KYC), and approves each event with its terms." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="KYC to check" value={kycWaiting.length} tone={kycWaiting.length ? "coral" : undefined} />
        <Stat label="Events to approve" value={eventsWaiting.length} tone={eventsWaiting.length ? "coral" : undefined} />
        <Stat label="Organisers" value={q.data.organisers.length} />
        <Stat label="Live events" value={q.data.events.filter((e) => e.state === "Live").length} />
      </div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <input className="input max-w-sm" type="search" placeholder="Find an organiser, owner or event" aria-label="Find an organiser, owner or event" value={find} onChange={(e) => setFind(e.target.value)} />
        <OpenForClient />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Organisers" flush>
          {organisers.length ? (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Organiser</th>
                  <th className="th">KYC</th>
                </tr>
              </thead>
              <tbody>
                {[...organisers].sort((a, b) => order(a.kycStatus) - order(b.kycStatus)).map((o) => (
                  <tr key={o.id}>
                    <td className="td">
                      <Link href={`/team/admin/organisers/${o.id}`} className="font-medium hover:text-coral">
                        {o.name}
                      </Link>
                      <div className="text-[13px] text-slate">
                        {o.country} · {o.owner}
                      </div>
                    </td>
                    <td className="td">
                      <KycTone status={o.kycStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>No organisers have signed up yet.</Empty>
          )}
        </Section>
        <Section title="Events" flush>
          {events.length ? (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Event</th>
                  <th className="th">State</th>
                </tr>
              </thead>
              <tbody>
                {[...events].sort((a, b) => order(a.state) - order(b.state)).map((e) => (
                  <tr key={e.id}>
                    <td className="td">
                      <Link href={`/team/events/${e.id}`} className="font-medium hover:text-coral">
                        {e.name}
                      </Link>
                      <div className="text-[13px] text-slate">
                        {e.organiser} · {e.startDate}
                        {e.kind === "dealroom" ? " · Deal Room only" : e.dealRoom.requested || e.dealRoom.enabled ? " · with a Deal Room" : ""}
                      </div>
                    </td>
                    <td className="td">
                      <StateTone state={e.state} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>No events yet.</Empty>
          )}
        </Section>
      </div>
    </>
  );
}

const COUNTRIES = ["Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia", "Nigeria", "Ghana", "South Africa", "Other"];

/** PA-1: Algotech opens an organiser for a client; the owner is invited by email and does KYC. */
function OpenForClient() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ organisation: "", country: "Kenya", name: "", email: "" });
  const make = useOrganiserChange("new", (input: OpenOrganiser) => onboardingApi.openOrganiser(input));
  if (!open)
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        Open an organiser for a client
      </button>
    );
  return (
    <Section title="Open an organiser for a client" className="w-full">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          make.mutate({ organisation: f.organisation, country: f.country, owner: { name: f.name, email: f.email } }, { onSuccess: (o) => router.push(`/team/admin/organisers/${o.id}`) });
        }}
      >
        <div>
          <label className="label" htmlFor="op-org">
            Organisation&apos;s registered name
          </label>
          <input id="op-org" className="input" required minLength={2} value={f.organisation} onChange={(e) => setF({ ...f, organisation: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="op-country">
            Registered in
          </label>
          <select id="op-country" className="input" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="op-name">
            Owner&apos;s full name
          </label>
          <input id="op-name" className="input" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="op-email">
            Owner&apos;s work email
          </label>
          <input id="op-email" className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <p className="text-[13px] text-slate sm:col-span-2">The owner gets an email, sets a password on the sign-in page, and completes KYC like any organiser. You check it here.</p>
        <div className="sm:col-span-2">
          <Failed error={make.error} />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn-primary" disabled={make.isPending}>
            {make.isPending ? "Opening…" : "Open it and invite the owner"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </form>
    </Section>
  );
}

export default function AdminPage() {
  return (
    <Signed>
      <AlgotechOnly>
        <Queue />
      </AlgotechOnly>
    </Signed>
  );
}
