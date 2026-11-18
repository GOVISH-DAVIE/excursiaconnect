import { Suspense } from "react";
import { seed } from "@excursia/domain/seed";
import { Apply } from "./apply";

export function generateStaticParams() {
  return seed.events.map((e) => ({ slug: e.slug }));
}

// the params are read inside the Suspense boundary, so the shell around them can render at once
async function Resolved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Apply slug={slug} />;
}

export default function ApplyPage({ params }: PageProps<"/e/[slug]/deal-room/apply">) {
  return (
    <Suspense fallback={<div className="p-10 text-slate">Loading…</div>}>
      <Resolved params={params} />
    </Suspense>
  );
}
