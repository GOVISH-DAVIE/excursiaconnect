import { Suspense } from "react";
import { seed } from "@/lib/seed";
import { Register } from "./register";

export function generateStaticParams() {
  return seed.events.map((e) => ({ slug: e.slug }));
}

// the params are read inside the Suspense boundary, so the shell around them can render at once
async function Resolved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Register slug={slug} />;
}

export default function RegisterPage({ params }: PageProps<"/e/[slug]/register">) {
  return (
    <Suspense fallback={<div className="p-10 text-slate">Loading…</div>}>
      <Resolved params={params} />
    </Suspense>
  );
}
