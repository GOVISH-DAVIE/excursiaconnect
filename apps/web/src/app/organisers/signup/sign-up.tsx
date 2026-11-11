"use client";

/**
 * An organiser signs itself up (backend-plan.md, M2.3 brought forward): an emailed code proves the address, then
 * the person, the organisation and a password make the owner's account. Then the sign-in page takes over for the
 * authenticator, and lands them in the workspace, where KYC comes first.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { onboardingApi } from "@/features/onboarding/api";
import { Aside, Field, Notice, Problem, Step, codeInput } from "@/app/signin/parts";

const COUNTRIES = ["Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia", "Nigeria", "Ghana", "South Africa", "Other"];

export function OrganiserSignUp() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "details">("email");
  const [email, setEmail] = useState("");
  const [form, setForm] = useState({ code: "", name: "", organisation: "", country: "Kenya", password: "" });
  const askCode = useMutation({ mutationFn: onboardingApi.signupCode });
  const signUp = useMutation({ mutationFn: onboardingApi.signUp });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: k === "code" ? e.target.value.replace(/\D/g, "") : e.target.value }));

  if (step === "email")
    return (
      <Step title="Sign up as an event organiser">
        <p className="text-[14px] text-slate">List your events, sell tickets and run your Deal Room on ExcursiaConnect. First, confirm your work email.</p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            askCode.mutate(email, { onSuccess: () => setStep("details") });
          }}
        >
          <Field id="su-email" label="Work email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Problem error={askCode.error} />
          <button className="btn-primary w-full" disabled={askCode.isPending}>
            {askCode.isPending ? "Sending…" : "Send me a code"}
          </button>
        </form>
      </Step>
    );

  return (
    <Step title="About you and your organisation">
      <Notice>A six-digit code is on its way to {email}. It works once, for 10 minutes.</Notice>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          signUp.mutate({ email, ...form }, { onSuccess: () => router.replace("/signin?next=/team") });
        }}
      >
        <Field id="su-code" label="Six-digit code" required value={form.code} onChange={set("code")} {...codeInput} />
        <Field id="su-name" label="Your full name" autoComplete="name" required minLength={2} value={form.name} onChange={set("name")} />
        <Field id="su-org" label="Organisation's registered name" autoComplete="organization" required minLength={2} value={form.organisation} onChange={set("organisation")} hint="As on its registration certificate: Algotech checks it." />
        <div>
          <label className="label" htmlFor="su-country">
            Registered in
          </label>
          <select id="su-country" className="input" value={form.country} onChange={set("country")}>
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <Field id="su-password" label="Password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={form.password} onChange={set("password")} hint="At least 12 characters. Next you'll add an authenticator app." />
        <Problem error={signUp.error} />
        <button className="btn-primary w-full" disabled={signUp.isPending}>
          {signUp.isPending ? "Creating your account…" : "Create my account"}
        </button>
      </form>
      <Aside onClick={() => setStep("email")}>Use a different email, or send a new code</Aside>
    </Step>
  );
}
