"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, PageHeader, Section } from "@/components/ui";
import { staffName } from "@excursia/domain/dealroom/logic";
import { fmtStamp } from "@excursia/domain/time";
import { Pill, useDr } from "../bits";

/** PRD Notifications: every message sent, with its delivery status. Messages say what changed and link in; never private data. */
export default function Notifications() {
  const { dr } = useDr();
  const [to, setTo] = useState<"all" | "participants" | "staff">("all");
  const [status, setStatus] = useState("All");
  const list = dr.outbox
    .filter((m) => to === "all" || (to === "staff" ? m.to.startsWith("st_") : !m.to.startsWith("st_")))
    .filter((m) => status === "All" || m.status === status);
  const who = (id: string) => (id.startsWith("st_") ? staffName(dr, id) : dr.apps.find((a) => a.id === id)?.contact.name ?? id);
  return (
    <>
      <PageHeader title="Notifications" kicker="Email and SMS by default, push in the apps. Each says what changed and the date, and links into the platform." />
      <Section title={`${list.length} messages`} flush action={
        <span className="flex gap-2">
          <select className="input h-8 w-auto text-[13px]" value={to} onChange={(e) => setTo(e.target.value as typeof to)}>
            <option value="all">Everyone</option>
            <option value="participants">Participants</option>
            <option value="staff">Staff</option>
          </select>
          <select className="input h-8 w-auto text-[13px]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>All</option>
            <option>Delivered</option>
            <option>Sent</option>
            <option>Failed</option>
          </select>
        </span>
      }>
        {list.length === 0 ? (
          <div className="p-5">
            <Empty>No messages.</Empty>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">When</th>
                <th className="th">To</th>
                <th className="th">Message</th>
                <th className="th">Channel</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td className="td text-[13px] whitespace-nowrap">{fmtStamp(m.at)}</td>
                  <td className="td text-[13px]">{who(m.to)}</td>
                  <td className="td text-[13px]">
                    <Link className="hover:underline" href={m.to.startsWith("st_") ? m.link : `/dealroom/applications/${m.to}`}>
                      {m.subject}
                    </Link>
                  </td>
                  <td className="td text-[13px]">{m.channel}</td>
                  <td className="td">
                    <Pill tone={m.status === "Failed" ? "bad" : m.status === "Delivered" ? "ok" : "mute"}>{m.status}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
