"use client";

/** An applicant signs in with a code sent to their email: no password to remember. */
import { useState } from "react";
import { useRequestCode } from "@/features/auth/hooks/use-request-code";
import { useVerifyCode } from "@/features/auth/hooks/use-sign-in";
import { Aside, Field, Notice, Problem, Step, codeInput } from "./parts";

export function ApplicantForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState(false);
  const request = useRequestCode();
  const verify = useVerifyCode();

  if (!sent)
    return (
      <Step title="Sign in with your email">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate(email, { onSuccess: () => setSent(true) });
          }}
        >
          <Field id="ap-email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} hint="The address on your application. We'll send a six-digit code." />
          <Problem error={request.error} />
          <button className="btn-primary w-full" disabled={request.isPending}>
            {request.isPending ? "Sending…" : "Send me a code"}
          </button>
        </form>
      </Step>
    );

  return (
    <Step title="Enter your code">
      <Notice>If {email} can sign in, a code is on its way. It works once, for 10 minutes.</Notice>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          verify.mutate({ email, code }, { onSuccess: onSignedIn });
        }}
      >
        <Field id="ap-code" label="Six-digit code" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} {...codeInput} />
        <Problem error={verify.error} />
        <button className="btn-primary w-full" disabled={verify.isPending || code.length !== 6}>
          {verify.isPending ? "Checking…" : "Sign in"}
        </button>
      </form>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Aside
          onClick={() =>
            request.mutate(email, {
              onSuccess: () => {
                verify.reset();
                setCode("");
                setResent(true);
              },
            })
          }
        >
          Send a new code
        </Aside>
        <Aside
          onClick={() => {
            setSent(false);
            setCode("");
            verify.reset();
          }}
        >
          Use another email
        </Aside>
      </div>
      {resent && !request.isPending && !request.error && <p className="text-[13px] text-slate">A new code is on its way; the old one no longer works.</p>}
      <Problem error={request.error} />
    </Step>
  );
}
