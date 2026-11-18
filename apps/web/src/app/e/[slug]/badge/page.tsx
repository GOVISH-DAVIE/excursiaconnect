import { Suspense } from "react";
import { seed } from "@excursia/domain/seed";
import { MyBadge } from "./badge";

export function generateStaticParams() {
  return seed.events.map((e) => ({ slug: e.slug }));
}

export const metadata = { title: "My Deal Room badge", robots: { index: false, follow: false } };

// the params are read inside the Suspense boundary, so the shell around them can render at once
async function Resolved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MyBadge slug={slug} />;
}

export default function BadgePage({ params }: PageProps<"/e/[slug]/badge">) {
  return (
    <Suspense fallback={<div className="p-10 text-slate">Loading…</div>}>
      <Resolved params={params} />
    </Suspense>
  );
}
