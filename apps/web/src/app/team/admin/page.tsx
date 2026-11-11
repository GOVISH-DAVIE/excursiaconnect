"use client";

/** Algotech's queue: organisers whose KYC waits for a check, and events waiting for approval; then everything else. */
import Link from "next/link";
import { Empty, PageHeader, Section, Stat } from "@/components/ui";
import { useAdminQueue } from "@/features/onboarding/hooks/use-onboarding";
import { Failed, KycTone, Loading, Signed, StateTone } from "../bits";

function Queue() {
  const q = useAdminQueue();
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const { organisers, events } = q.data;
  const kycWaiting = organisers.filter((o) => o.kycStatus === "Pending");
  const eventsWaiting = events.filter((e) => e.state === "Submitted" || e.state === "Under review");
  const order = (s: string) => (s === "Pending" || s === "Submitted" || s === "Under review" ? 0 : 1);
  return (
    <>
      <PageHeader title="Organisers and events" kicker="Algotech checks every organiser once (KYC), and approves each event with its terms." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="KYC to check" value={kycWaiting.length} tone={kycWaiting.length ? "coral" : undefined} />
        <Stat label="Events to approve" value={eventsWaiting.length} tone={eventsWaiting.length ? "coral" : undefined} />
        <Stat label="Organisers" value={organisers.length} />
        <Stat label="Live events" value={events.filter((e) => e.state === "Live").length} />
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
                        {e.dealRoom.requested || e.dealRoom.enabled ? " · Deal Room" : ""}
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

export default function AdminPage() {
  return (
    <Signed>
      <Queue />
    </Signed>
  );
}
