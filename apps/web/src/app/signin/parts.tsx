"use client";

/** The pieces every sign-in step uses: a labelled field, the API's refusal, a step heading. */
import type { InputHTMLAttributes, ReactNode } from "react";

export function Field({ id, label, hint, ...input }: { id: string; label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="input" {...input} />
      {hint && <p className="mt-1.5 text-[13px] text-slate">{hint}</p>}
    </div>
  );
}

/** The API's own sentence, for anything that went wrong. */
export function Problem({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md bg-bad-50 px-3 py-2.5 text-[14px] text-bad">
      {error.message}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-md bg-ok-50 px-3 py-2.5 text-[14px] text-ok">
      {children}
    </p>
  );
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="text-[18px] font-medium tracking-[-0.01em]">{title}</h2>
      {children}
    </div>
  );
}

/** Six digits, as phones offer them from an SMS or an email. */
export const codeInput = { inputMode: "numeric", autoComplete: "one-time-code", pattern: "\\d{6}", maxLength: 6, placeholder: "123456" } as const;

/** A quiet link-like button for going back or switching. */
export function Aside({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-[14px] text-slate underline underline-offset-4 hover:text-ink">
      {children}
    </button>
  );
}
