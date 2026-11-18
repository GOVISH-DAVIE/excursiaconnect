"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, PageHeader, Section } from "@/components/ui";
import { fmtStamp } from "@excursia/domain/time";
import { useExpo } from "../bits";

/** Every email and SMS the exhibition sent: what changed and when, never amounts owed or documents. */
export default function ExhibitionMessages() {
  const { state, expo, cfg } = useExpo();
  const [to, setTo] = useState<"all" | "exhibitors" | "team">("all");
  if (!cfg) return null;
  const list = expo.outbox.filter((m) => m.eventId === cfg.eventId).filter((m) => to === "all" || (to === "team") === m.to.startsWith("u_"));
  const who = (id: string) => expo.exhibitors.find((e) => e.id === id)?.name ?? state.team.find((t) => t.id === id)?.name ?? id;
  return (
    <>
      <PageHeader title="Messages" kicker="Email and SMS sent by the exhibition. Each says what changed and links into the platform." />
      <div className="mb-3 flex gap-2">
        {(["all", "exhibitors", "team"] as const).map((x) => (
          <button key={x} aria-pressed={to === x} className={`pill ${to === x ? "bg-ink text-white" : "bg-paper-200 text-slate hover:text-ink"}`} onClick={() => setTo(x)}>
            {x === "all" ? "Everyone" : x === "exhibitors" ? "Exhibitors" : "The team"}
          </button>
        ))}
      </div>
      <Section title={`${list.length} messages`} flush>
        {list.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>None.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">When</th>
                  <th className="th">To</th>
                  <th className="th">Message</th>
                  <th className="th">Channel</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id}>
                    <td className="td text-[13px] whitespace-nowrap">{fmtStamp(m.at)}</td>
                    <td className="td text-[13px]">
                      {m.to.startsWith("ex_") ? (
                        <Link className="hover:underline" href={`/exhibition/exhibitors/${m.to}`}>
                          {who(m.to)}
                        </Link>
                      ) : (
                        who(m.to)
                      )}
                    </td>
                    <td className="td text-[13px]">
                      <Link className="hover:underline" href={m.link}>
                        {m.subject}
                      </Link>
                    </td>
                    <td className="td text-[13px] text-slate">{m.channel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
