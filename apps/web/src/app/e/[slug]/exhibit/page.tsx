import { Suspense } from "react";
import { seed } from "@excursia/domain/seed";
import { ExhibitPublic } from "./public";

export function generateStaticParams() {
  return seed.events.map((e) => ({ slug: e.slug }));
}

// the params are read inside the Suspense boundary, so the shell around them can render at once
async function Resolved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ExhibitPublic slug={slug} />;
}

export default function ExhibitPage({ params }: PageProps<"/e/[slug]/exhibit">) {
  return (
    <Suspense fallback={<div className="p-10 text-slate">Loading…</div>}>
      <Resolved params={params} />
    </Suspense>
  );
}
