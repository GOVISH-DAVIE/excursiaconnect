import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/ui";
import { SignIn } from "./sign-in";

export const metadata: Metadata = { title: "Sign in · ExcursiaConnect", robots: { index: false } };

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-paper-200 px-4 py-10 sm:py-16">
      <Link href="/" aria-label="ExcursiaConnect home">
        <Logo variant="icon" className="h-12" />
      </Link>
      <div className="surface mt-8 w-full max-w-md p-6 sm:p-8">
        <Suspense fallback={<p className="text-[14px] text-slate">Loading…</p>}>
          <SignIn />
        </Suspense>
      </div>
      <p className="mt-6 max-w-md text-center text-[13px] text-slate">
        Signing in keeps your Deal Room application and meetings in one place. We never share your email.{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy notice
        </Link>
      </p>
      <p className="mt-2 max-w-md text-center text-[13px] text-slate">
        Organising an event?{" "}
        <Link href="/organisers/signup" className="underline underline-offset-4">
          Sign up as an organiser
        </Link>
      </p>
    </main>
  );
}
