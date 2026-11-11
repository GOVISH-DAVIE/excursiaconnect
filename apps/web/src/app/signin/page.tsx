import type { Metadata } from "next";
import Link from "next/link";
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
        <SignIn />
      </div>
      <p className="mt-6 max-w-md text-center text-[13px] text-slate">Signing in keeps your Deal Room application and meetings in one place. We never share your email.</p>
    </main>
  );
}
