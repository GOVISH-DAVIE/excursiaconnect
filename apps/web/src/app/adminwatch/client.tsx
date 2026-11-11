"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, type SignInState } from "./actions";

/** The password form; the action checks it on the server and refuses after five misses in 15 minutes. */
export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  return (
    <form action={action} className="surface mx-auto mt-16 max-w-sm p-6">
      <h1 className="text-[22px] font-medium tracking-[-0.02em]">Visitor log</h1>
      <p className="mt-1 text-[14px] text-slate">Private. Sign in with the password set on the server.</p>
      <label className="label mt-5" htmlFor="aw-password">
        Password
      </label>
      <input id="aw-password" name="password" type="password" autoComplete="current-password" required className="input" />
      {state.error && <p className="mt-2 text-[14px] text-bad">{state.error}</p>}
      <button className="btn-primary mt-4 w-full" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}

/** Keeps the log current: the server page is fetched again every 30 seconds while the tab is visible. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
