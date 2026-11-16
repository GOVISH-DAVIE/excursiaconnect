"use client";

/**
 * The Deal Room desk's scanners, for the desk team (the lead, operations, the coordinators): the tablets and phones
 * enrolled for this event, enrolling the one in your hand, retiring a lost one, and your own scanner PIN (M2.2).
 */
import Link from "next/link";
import { useState } from "react";
import { SetPinInput } from "@excursia/contracts/scan";
import { PageHeader, Section } from "@/components/ui";
import { useDeviceActions, useDevices } from "@/features/scan/hooks/use-devices";
import { Failed, Loading } from "../bits";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");

export function DeskScanners({ eventId }: { eventId: string }) {
  const q = useDevices(eventId);
  const act = useDeviceActions(eventId);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pinDone, setPinDone] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const v = q.data;
  const here = v.devices.find((d) => d.here && !d.retired);
  const live = v.devices.filter((d) => !d.retired);
  const error = act.enrol.error ?? act.retire.error;

  return (
    <>
      <PageHeader
        title="Desk scanners"
        kicker={`${v.event.name}: the tablets and phones that check participants in at the Deal Room desk. Each of the desk team signs in on them with their own PIN.`}
        actions={
          here ? (
            <Link href="/desk" className="btn-primary">
              Open the scanner
            </Link>
          ) : undefined
        }
      />
      {error && (
        <p className="mb-3 rounded-lg border border-bad/30 bg-bad-50 px-4 py-3 text-[14px]" role="alert">
          {error.message}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Section title="Scanners" action={<span className="text-[13px] text-slate">{live.length} in use</span>} flush>
          {v.devices.length === 0 ? (
            <p className="px-5 pb-4 text-[14px] text-slate">None yet. Enrol the first one below, on the device itself.</p>
          ) : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-y border-line text-left text-[13px] text-slate">
                  <th className="px-5 py-2 font-normal">Device</th>
                  <th className="px-3 py-2 font-normal">Last used</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {v.devices.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5">
                      {d.name}
                      {d.here && !d.retired && <span className="pill ml-2 bg-ok-50 text-ok">This device</span>}
                      {d.locked && <span className="pill ml-2 bg-warn-50 text-warn">Locked: wrong PINs</span>}
                      {d.retired && <span className="pill ml-2 bg-paper-200 text-slate">Retired</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate">{when(d.lastSeenAt)}</td>
                    <td className="px-5 py-2.5 text-right">
                      {!d.retired && (
                        <button className="btn-quiet btn-sm text-bad" disabled={act.retire.isPending} onClick={() => act.retire.mutate(d.id)}>
                          Retire
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form
            className="flex flex-wrap gap-2 border-t border-line px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              act.enrol.mutate(name, { onSuccess: () => setName("") });
            }}
          >
            <input className="input h-9 min-w-48 flex-1 text-[14px]" aria-label="Name for this device" placeholder="Name this device, for example Desk tablet 1" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            <button className="btn-secondary btn-sm" disabled={act.enrol.isPending || !name.trim()}>
              {here ? "Enrol this device again" : "Use this device as a scanner"}
            </button>
            <p className="w-full text-[13px] text-slate">Enrol on the tablet or phone itself: it keeps a key that only this browser holds. Retire a scanner that is lost; whoever is signed in on it is signed out at once.</p>
          </form>
        </Section>

        <Section title="My scanner PIN" action={<span className={`pill ${v.pinSet ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn"}`}>{v.pinSet ? "Set" : "Not set"}</span>}>
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              // the contract's own reasons, in the form: an obvious PIN is refused before it is sent
              const check = SetPinInput.safeParse({ pin });
              setPinError(check.success ? null : check.error.issues[0].message);
              if (check.success) act.setPin.mutate(pin, { onSuccess: () => { setPin(""); setPinDone(true); } });
            }}
          >
            <input
              className="input text-center font-mono tracking-[0.4em]"
              aria-label="New six-digit PIN"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPinDone(false); setPinError(null); }}
              placeholder="••••••"
            />
            <button className="btn-secondary btn-sm" disabled={act.setPin.isPending || pin.length !== 6}>
              {v.pinSet ? "Change my PIN" : "Set my PIN"}
            </button>
            {(pinError ?? act.setPin.error) && <p className="text-[13px] text-bad" role="alert">{pinError ?? act.setPin.error?.message}</p>}
            {pinDone && <p className="text-[13px] text-ok">Saved. Use it on any of this event&rsquo;s scanners.</p>}
            <p className="text-[13px] text-slate">Six digits, yours alone. Five wrong tries lock it for 15 minutes.</p>
          </form>
        </Section>
      </div>
    </>
  );
}
