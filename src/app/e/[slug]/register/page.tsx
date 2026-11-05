import { Suspense } from "react";
import { seed } from "@/lib/seed";
import { Register } from "./register";

export function generateStaticParams() {
  return seed.events.map((e) => ({ slug: e.slug }));
}

export default async function RegisterPage({ params }: PageProps<"/e/[slug]/register">) {
  const { slug } = await params;
  return (
    <Suspense fallback={<div className="p-10 text-slate">Loading…</div>}>
      <Register slug={slug} />
    </Suspense>
  );
}
