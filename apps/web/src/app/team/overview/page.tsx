"use client";

/**
 * The Deal Room at a glance (M3.6), for everyone on the team: how far applications, matching, meetings, sessions
 * and follow-ups have come, as counts only. No names, no records and no money, so every role can read it,
 * oversight included, and each number links to the screen behind it only for a role that can open that screen.
 */
import { PageHeader, Section, Stat } from "@/components/ui";
import { useSession } from "@/features/auth/hooks/use-session";
import { rolesOf } from "@/features/auth/roles";
import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { useOverview } from "@/features/dealroom/hooks/use-overview";
import { Failed, Loading, Signed } from "../bits";

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-y-6 sm:grid-cols-4">{children}</div>;
}

function Overview({ eventId }: { eventId: string }) {
  const q = useOverview(eventId);
  const r = rolesOf(useSession().data);
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const o = q.data;
  const link = (allowed: boolean, href: string) => (allowed ? href : undefined);
  return (
    <>
      <PageHeader title="Overview" kicker={`${o.event.name}: where the Deal Room stands, in numbers. It refreshes every minute.`} />
      <div className="grid gap-4">
        <Section title="Applications">
          <Row>
            <Stat label="Started" value={o.applications.started} />
            <Stat label="Submitted" value={o.applications.submitted} href={link(r.reviews, "/team/applications")} />
            <Stat label="In review" value={o.applications.inReview} tone={o.applications.inReview ? "coral" : undefined} sub={o.applications.infoRequested ? `${o.applications.infoRequested} waiting on the applicant` : undefined} />
            <Stat label="Decided" value={o.applications.decided} />
          </Row>
        </Section>
        <Section title="Participants">
          <Row>
            <Stat label="Approved seekers" value={o.participants.approved} sub={`of ${o.participants.seekers} who applied`} />
            <Stat label="Ready to meet" value={o.participants.ready} />
            <Stat label="Verified providers" value={o.participants.verified} sub={`${o.participants.verifiedCapital} capital, ${o.participants.verifiedPartners} partners`} />
            <Stat label="Challenges" value={o.participants.challenges} />
          </Row>
        </Section>
        <Section title="Matching">
          <Row>
            <Stat label="Matches approved" value={o.matching.approved} href={link(r.matching, "/team/matching")} />
            <Stat label="Introduced" value={o.matching.introduced} />
            <Stat label="Both said yes" value={o.matching.accepted} tone={o.matching.accepted ? "ok" : undefined} />
          </Row>
        </Section>
        <Section title="Meetings">
          <Row>
            <Stat label="Waiting for an answer" value={o.meetings.proposed} href={link(r.meetings, "/team/meetings")} />
            <Stat label="Confirmed" value={o.meetings.confirmed} />
            <Stat label="Held" value={o.meetings.held} tone={o.meetings.held ? "ok" : undefined} />
            <Stat label="No-shows" value={o.meetings.noShow} tone={o.meetings.noShow ? "warn" : undefined} />
          </Row>
        </Section>
        <Section title="Sessions and follow-ups">
          <Row>
            <Stat label="Sessions ahead" value={o.sessions.planned} href={link(r.sessions, "/team/sessions")} />
            <Stat label="Sessions held" value={o.sessions.held} sub={`${o.sessions.attended} attendances`} />
            <Stat label="Follow-ups open" value={o.followUps.open} />
            <Stat label="Overdue" value={o.followUps.overdue} tone={o.followUps.overdue ? "bad" : undefined} />
          </Row>
        </Section>
      </div>
    </>
  );
}

function Gate() {
  const eventId = useDealRoomEvent();
  if (!eventId) return <PageHeader title="Overview" kicker="You aren't on a Deal Room team." />;
  return <Overview eventId={eventId} />;
}

export default function OverviewPage() {
  return (
    <Signed>
      <Gate />
    </Signed>
  );
}
