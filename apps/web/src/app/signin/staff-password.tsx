"use client";

/** Staff, step one: email and password. Also where a password is set for the first time, or reset. */
import { useState } from "react";
import { useRequestPasswordCode } from "@/features/auth/hooks/use-request-password-code";
import { useSetPassword, useStaffSignIn } from "@/features/auth/hooks/use-sign-in";
import type { SignInNext } from "@excursia/contracts/auth";
import { Aside, Field, Notice, Problem, Step, codeInput } from "./parts";

export function StaffPassword({ onNext }: { onNext: (r: SignInNext) => void }) {
  const [mode, setMode] = useState<"signin" | "ask" | "set">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [justSet, setJustSet] = useState(false);
  const signIn = useStaffSignIn();
  const askCode = useRequestPasswordCode();
  const setNew = useSetPassword();

  if (mode === "ask")
    return (
      <Step title="Set or reset your password">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            askCode.mutate(email, { onSuccess: () => setMode("set") });
          }}
        >
          <Field id="pw-email" label="Staff email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} hint="We'll send a code to this address if it belongs to a staff account." />
          <Problem error={askCode.error} />
          <button className="btn-primary w-full" disabled={askCode.isPending}>
            {askCode.isPending ? "Sending…" : "Send me a code"}
          </button>
        </form>
        <Aside onClick={() => setMode("signin")}>Back to sign-in</Aside>
      </Step>
    );

  if (mode === "set")
    return (
      <Step title="Choose a password">
        <Notice>If {email} is a staff account, a code is on its way. It works once, for 30 minutes.</Notice>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setNew.mutate(
              { email, code, password },
              {
                onSuccess: () => {
                  setJustSet(true);
                  setPassword("");
                  setCode("");
                  setMode("signin");
                },
              },
            );
          }}
        >
          <Field id="pw-code" label="Six-digit code" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} {...codeInput} />
          <Field id="pw-new" label="New password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 12 characters. A few unrelated words make a strong one." />
          <Problem error={setNew.error} />
          <button className="btn-primary w-full" disabled={setNew.isPending}>
            {setNew.isPending ? "Saving…" : "Save password"}
          </button>
        </form>
        <Aside onClick={() => setMode("ask")}>Send a new code</Aside>
      </Step>
    );

  return (
    <Step title="Staff sign-in">
      {justSet && <Notice>Your password is set, and any other sign-ins have ended. Sign in with it now.</Notice>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          signIn.mutate({ email, password }, { onSuccess: onNext });
        }}
      >
        <Field id="st-email" label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field id="st-password" label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Problem error={signIn.error} />
        <button className="btn-primary w-full" disabled={signIn.isPending}>
          {signIn.isPending ? "Checking…" : "Continue"}
        </button>
      </form>
      <Aside onClick={() => setMode("ask")}>First time here, or forgot your password?</Aside>
    </Step>
  );
}
