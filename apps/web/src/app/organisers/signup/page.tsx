import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { OrganiserSignUp } from "./sign-up";

export const metadata: Metadata = { title: "Sign up as an organiser · ExcursiaConnect" };

export default function OrganiserSignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-paper-200 px-4 py-10 sm:py-16">
      <Link href="/" aria-label="ExcursiaConnect home">
        <Logo variant="icon" className="h-12" />
      </Link>
      <div className="surface mt-8 w-full max-w-md p-6 sm:p-8">
        <OrganiserSignUp />
      </div>
      <p className="mt-6 max-w-md text-center text-[13px] text-slate">
        Algotech checks every organiser (KYC) before its first event goes live. Already signed up?{" "}
        <Link href="/signin" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
