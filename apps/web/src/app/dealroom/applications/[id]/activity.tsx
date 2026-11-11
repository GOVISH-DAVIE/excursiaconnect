"use client";

import Link from "next/link";
import { Empty, Section } from "@/components/ui";
import { drCan, matchStage, oppParties, staffName } from "@excursia/domain/dealroom/logic";
import type { DrApplication } from "@excursia/domain/dealroom/types";
import { fmtStamp } from "@excursia/domain/time";
import { useStore } from "@/lib/store";
import { Pill, useDr } from "../../bits";
import { stageTone } from "../../stage";
import { MeetingPill } from "../../meetings/parts";
import { OppStagePill } from "../../opportunities/parts";

/** One participant across the Deal Room: every pair they are in, every meeting, every opportunity, each opening its record. */
export function Activity({ app }: { app: DrApplication }) {
  const { state } = useStore();
  const { dr, cfg, me, now } = useDr();
  const matches = dr.matches.filter((m) => m.seekerId === app.id || m.providerId === app.id);
  const meetings = dr.meetings.filter((mt) => matches.some((m) => m.id === mt.matchId) && mt.status !== "Cancelled").sort((a, b) => a.start.localeCompare(b.start));
  const opps = dr.opportunities.filter((o) => matches.some((m) => m.id === o.matchId));
  const other = (seekerId: string, providerId: string) => dr.apps.find((a) => a.id === (app.type === "seeker" ? providerId : seekerId));
  const schedule = drCan(me, "schedule");
  const owns = me?.role === "Lead" || me?.role === "Reviewer";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section
        title={`Matches, ${matches.length}`}
        flush
        action={
          drCan(me, "match") ? (
            <Link className="link text-[13px]" href={`/dealroom/matching?who=${app.id}`}>
              Find more
            </Link>
          ) : undefined
        }
      >
        {matches.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>Not in any pair yet.</Empty>
          </div>
        ) : (
          <ul>
            {matches.map((m) => {
              const st = matchStage(m, cfg!, now);
              return (
                <li key={m.id} className="px-5 py-2.5 border-b border-line last:border-0 flex items-center justify-between gap-3 text-[14px]">
                  <Link className="min-w-0 truncate hover:underline" href={`/dealroom/matches/${m.id}`}>
                    {other(m.seekerId, m.providerId)?.org.name}
                  </Link>
                  <Pill tone={stageTone[st]}>{st}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <div className="min-w-0 space-y-4">
        <Section
          title={`Meetings, ${meetings.length}`}
          flush
          action={
            schedule && meetings.length > 0 ? (
              <Link className="link text-[13px]" href={`/dealroom/meetings?tab=Schedule&who=${app.id}&day=${meetings[0].start.slice(0, 10)}`}>
                On the schedule
              </Link>
            ) : undefined
          }
        >
          {meetings.length === 0 ? (
            <div className="px-5 pb-5">
              <Empty>No meetings.</Empty>
            </div>
          ) : (
            <ul>
              {meetings.map((mt) => {
                const m = matches.find((x) => x.id === mt.matchId)!;
                return (
                  <li key={mt.id} className="px-5 py-2.5 border-b border-line last:border-0 flex items-center justify-between gap-3 text-[14px]">
                    <Link className="min-w-0 hover:underline" href={schedule ? `/dealroom/meetings?meeting=${mt.id}` : `/dealroom/matches/${m.id}`}>
                      <span className="block truncate">{other(m.seekerId, m.providerId)?.org.name}</span>
                      <span className="block text-[12px] text-slate">
                        {fmtStamp(mt.start)}, {state.rooms.find((r) => r.id === mt.roomId)?.name ?? "online"}
                      </span>
                    </Link>
                    <MeetingPill m={mt} />
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
        <Section title={`Opportunities, ${opps.length}`} flush>
          {opps.length === 0 ? (
            <div className="px-5 pb-5">
              <Empty>None yet. An opportunity opens when a meeting ends with a next action.</Empty>
            </div>
          ) : (
            <ul>
              {opps.map((o) => {
                const { seeker, provider } = oppParties(dr, o);
                const name = app.type === "seeker" ? provider?.org.name : seeker?.org.name;
                return (
                  <li key={o.id} className="px-5 py-2.5 border-b border-line last:border-0 flex items-center justify-between gap-3 text-[14px]">
                    {owns ? (
                      <Link className="min-w-0 hover:underline" href={`/dealroom/opportunities/${o.id}`}>
                        <span className="block truncate">{name}</span>
                        <span className="block text-[12px] text-slate">Owned by {staffName(dr, o.owner)}</span>
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate">{name}</span>
                    )}
                    <OppStagePill stage={o.stage} />
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
