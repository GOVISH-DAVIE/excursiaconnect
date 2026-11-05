"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader, Section, Stat, Tone } from "@/components/ui";
import { money, payoutsFor, useStore } from "@/lib/store";

export default function AdminFinance() {
  const { state, dispatch } = useStore();
  const paid = state.orders.filter((o) => o.status === "paid");
  const gross = paid.reduce((a, o) => a + o.gross, 0);
  const commission = paid.reduce((a, o) => a + o.commission, 0);
  const gateway = paid.reduce((a, o) => a + o.gatewayFee, 0);
  const open = state.exceptions.filter((x) => !x.resolved);
  const [resolving, setResolving] = useState<string | null>(null);
  const [how, setHow] = useState("Ledger corrected");

  const run = state.organisers.map((o) => {
    const scheduled = payoutsFor(state, o.id).find((p) => p.status === "Scheduled");
    return { o, payout: scheduled, held: o.kycStatus !== "Verified" };
  });
  const runnable = run.filter((r) => r.payout && !r.held && r.payout.net > 0);
  const blocked = open.length > 0;

  return (
    <>
      <PageHeader
        title="Commission and payouts"
        kicker="The ledger must match gateway settlement to the shilling before Friday's payout run."
        actions={
          <button
            className="btn btn-primary"
            disabled={blocked || runnable.length === 0}
            title={blocked ? "Clear every reconciliation exception first" : undefined}
            onClick={() => {
              if (confirm(`Pay ${runnable.length} organiser${runnable.length === 1 ? "" : "s"}, ${money(runnable.reduce((a, r) => a + (r.payout?.net ?? 0), 0))} in all? Statements are emailed.`)) dispatch({ type: "runPayouts", payoutIds: runnable.map((r) => r.payout!.id) });
            }}
          >
            Run Friday payouts
          </button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-4 mb-4">
        <Stat label="Gross processed" value={money(gross)} />
        <Stat label="Commission" value={money(commission)} tone="coral" />
        <Stat label="Gateway fees, borne by Algotech" value={money(gateway)} tone="warn" />
        <Stat label="Algotech net" value={money(commission - gateway)} tone="ok" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={`Reconciliation exceptions, ${open.length} open`} flush>
          {open.length === 0 && <p className="px-5 py-4 text-[14px] text-slate">Nothing open. The ledger ties to the gateway; the payout run can go.</p>}
          <ul>
            {state.exceptions.map((e) => (
              <li key={e.ref} className={`px-5 py-3 border-b border-line last:border-0 text-[14px] ${e.resolved ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-[13px] text-slate">{e.ref}</div>
                    <div>{e.issue}</div>
                    <div className="text-[13px] text-slate mt-0.5">{e.resolved ? `Resolved ${e.resolved.at}: ${e.resolved.how}` : `Raised ${e.raised}`}</div>
                  </div>
                  {!e.resolved && (
                    <button className="btn-secondary btn-sm" onClick={() => setResolving(resolving === e.ref ? null : e.ref)}>
                      Resolve
                    </button>
                  )}
                </div>
                {resolving === e.ref && (
                  <form
                    className="mt-3 flex flex-wrap gap-2 items-end"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      dispatch({ type: "resolveException", ref: e.ref, how });
                      setResolving(null);
                    }}
                  >
                    <div className="flex-1 min-w-48">
                      <label className="label" htmlFor={`how-${e.ref}`}>How it was cleared</label>
                      <select id={`how-${e.ref}`} className="input" value={how} onChange={(x) => setHow(x.target.value)}>
                        <option>Ledger corrected</option>
                        <option>Matched to an order by reference</option>
                        <option>Gateway ticket raised, fee variance accepted</option>
                        <option>Refunded to payer, no order</option>
                      </select>
                    </div>
                    <button className="btn btn-primary" type="submit">Mark resolved</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Friday payout run" flush>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Organiser</th>
                <th className="th-r">Net due</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {run.map(({ o, payout, held }) => (
                <tr key={o.id} className="hover:bg-paper">
                  <td className="td">
                    <Link href={`/admin/organisers/${o.id}`} className="font-medium hover:underline">
                      {o.name}
                    </Link>
                    <div className="text-[13px] text-slate">{o.payoutAccount}</div>
                  </td>
                  <td className="td-r font-medium">{money(payout?.net ?? 0)}</td>
                  <td className="td">
                    {!payout ? <Tone tone="ok">Paid</Tone> : held ? <Tone tone="bad">Held, KYC pending</Tone> : blocked ? <Tone tone="warn">Waiting on reconciliation</Tone> : <Tone tone="warn">Scheduled</Tone>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-5 py-3 text-[13px] text-slate">A run pays every verified organiser&apos;s available balance, net of refunds and chargebacks since the last run, and emails the statement. A failed transfer is retried on Monday, then held.</p>
        </Section>
      </div>
    </>
  );
}
