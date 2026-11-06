import { Suspense } from "react";
import { seed } from "@/lib/seed";
import { Apply } from "./apply";

export function generateStaticParams() {
  return seed.events.map((e) => ({ slug: e.slug }));
}

export default async function ApplyPage({ params }: PageProps<"/e/[slug]/deal-room/apply">) {
  const { slug } = await params;
  return (
    <Suspense fallback={<div className="p-10 text-slate">Loading…</div>}>
      <Apply slug={slug} />
    </Suspense>
  );
}
