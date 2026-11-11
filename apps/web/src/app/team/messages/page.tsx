"use client";

/**
 * The Deal Room's messages (M1.4), read from the outbox: every email the Deal Room sent or will send, to whom,
 * and whether it went. A message names the action only; its details are on the page it links to.
 */
import { Empty, PageHeader, Section, Tone } from "@/components/ui";
import type { MessageRow } from "@excursia/contracts/dealroom";
import { useDealRoomEvent } from "@/features/dealroom/hooks/use-deal-room-event";
import { useMessages } from "@/features/dealroom/hooks/use-messages";
import { Failed, Loading, Signed } from "../bits";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Status({ m }: { m: MessageRow }) {
  if (m.status === "sent" || m.status === "delivered") return <Tone tone="ok">Sent{m.sentAt ? `, ${when(m.sentAt)}` : ""}</Tone>;
  if (m.status === "failed") return <Tone tone="bad">Failed after {m.attempts} tries</Tone>;
  return <Tone tone="warn">{m.attempts > 0 ? `Retrying (${m.attempts} tries)` : "Waiting to send"}</Tone>;
}

function Messages({ eventId }: { eventId: string }) {
  const q = useMessages(eventId);
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const failed = q.data.filter((m) => m.status === "failed").length;
  return (
    <>
      <PageHeader title="Messages" kicker={`Emails the Deal Room sent, newest first.${failed ? ` ${failed} failed: check the address with the person.` : ""}`} />
      <Section title={`${q.data.length} message${q.data.length === 1 ? "" : "s"}`} flush>
        {q.data.length ? (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">To</th>
                <th className="th">Message</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((m) => (
                <tr key={m.id}>
                  <td className="td">
                    <div className="font-medium">{m.to}</div>
                    <div className="text-[13px] text-slate">{m.kind === "staff" ? "Team" : m.kind === "organiser" ? "Organiser" : "Applicant"}</div>
                  </td>
                  <td className="td">
                    {m.subject}
                    <div className="text-[13px] text-slate">{when(m.at)}</div>
                  </td>
                  <td className="td">
                    <Status m={m} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Nothing sent yet.</Empty>
        )}
      </Section>
    </>
  );
}

function Gate() {
  const eventId = useDealRoomEvent();
  if (!eventId) return <PageHeader title="Messages" kicker="You aren't on a Deal Room team." />;
  return <Messages eventId={eventId} />;
}

export default function MessagesPage() {
  return (
    <Signed>
      <Gate />
    </Signed>
  );
}
