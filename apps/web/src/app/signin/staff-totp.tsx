"use client";

/**
 * Staff, step two: the authenticator. The first time, it is set up here (scan or type the secret, confirm with a
 * code, keep the recovery codes); afterwards, a code from it, or one recovery code, finishes the sign-in.
 */
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useStartTotp } from "@/features/auth/hooks/use-start-totp";
import { useConfirmTotp, useSkipTotp, useVerifyTotp } from "@/features/auth/hooks/use-sign-in";
import { Aside, Field, Problem, Step, codeInput } from "./parts";

/** "18 Nov", in Nairobi. */
export const dueDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" });

export function TotpEnrol({ onRecoveryCodes, onSkipped, skipUntil }: { onRecoveryCodes: (codes: string[]) => void; onSkipped: () => void; skipUntil?: string }) {
  const start = useStartTotp();
  const confirm = useConfirmTotp();
  const skip = useSkipTotp();
  const [code, setCode] = useState("");
  // once per screen: React runs effects twice in development, and the secret on screen must be the one stored
  const asked = useRef(false);
  const { mutate } = start;
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    mutate();
  }, [mutate]);

  return (
    <Step title="Set up your authenticator">
      <p className="text-[14px] text-slate">Staff accounts need a second step. Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password), then enter the code it shows.</p>
      {start.data && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-line p-4">
          <QRCodeSVG value={start.data.uri} size={176} aria-label="Authenticator QR code" />
          <p className="text-[13px] text-slate">Or type this key:</p>
          {/* 32 characters in two lines of four groups, so a group never breaks across lines */}
          <code className="text-center font-mono text-[15px] leading-relaxed tracking-wider" data-testid="totp-secret">
            {[0, 16].map((at) => (
              <span key={at} className="block whitespace-nowrap">
                {start.data.secret.slice(at, at + 16).match(/.{1,4}/g)?.join(" ")}
              </span>
            ))}
          </code>
        </div>
      )}
      <Problem error={start.error} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          confirm.mutate(code, { onSuccess: (r) => onRecoveryCodes(r.recoveryCodes) });
        }}
      >
        <Field id="totp-first" label="Code from the app" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} {...codeInput} autoComplete="off" />
        <Problem error={confirm.error} />
        <button className="btn-primary w-full" disabled={!start.data || confirm.isPending || code.length !== 6}>
          {confirm.isPending ? "Checking…" : "Confirm"}
        </button>
      </form>
      {skipUntil && (
        <div className="space-y-2 border-t border-line pt-4">
          <Aside onClick={() => skip.mutate(undefined, { onSuccess: onSkipped })}>{skip.isPending ? "Signing in…" : `Set up later (you have until ${dueDay(skipUntil)})`}</Aside>
          <Problem error={skip.error} />
        </div>
      )}
    </Step>
  );
}

export function RecoveryList({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [kept, setKept] = useState(false);
  return (
    <Step title="Keep your recovery codes">
      <p className="text-[14px] text-slate">If you lose your phone, each of these signs you in once instead of an authenticator code. They are shown only now: print them or keep them in a password manager.</p>
      <ol className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-line p-4 font-mono text-[14px]" data-testid="recovery-codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <label className="flex items-center gap-2 text-[14px]">
        <input type="checkbox" checked={kept} onChange={(e) => setKept(e.target.checked)} className="size-4" />
        I&apos;ve kept them somewhere safe
      </label>
      <button className="btn-primary w-full" disabled={!kept} onClick={onDone}>
        Continue
      </button>
    </Step>
  );
}

export function TotpVerify({ onSignedIn }: { onSignedIn: () => void }) {
  const verify = useVerifyTotp();
  const [recovery, setRecovery] = useState(false);
  const [value, setValue] = useState("");
  return (
    <Step title={recovery ? "Use a recovery code" : "Enter your authenticator code"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          verify.mutate(recovery ? { recoveryCode: value } : { code: value }, { onSuccess: onSignedIn });
        }}
      >
        {recovery ? (
          <Field id="totp-recovery" label="Recovery code" required autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="abcde-12345" />
        ) : (
          <Field id="totp-code" label="Six-digit code from the app" required value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} {...codeInput} autoComplete="off" />
        )}
        <Problem error={verify.error} />
        <button className="btn-primary w-full" disabled={verify.isPending || (!recovery && value.length !== 6)}>
          {verify.isPending ? "Checking…" : "Sign in"}
        </button>
      </form>
      <Aside
        onClick={() => {
          setRecovery(!recovery);
          setValue("");
          verify.reset();
        }}
      >
        {recovery ? "Use the authenticator app instead" : "Lost your phone? Use a recovery code"}
      </Aside>
    </Step>
  );
}
