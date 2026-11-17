import { Suspense } from "react";
import { seed } from "@excursia/domain/seed";
import { DirectoryPage } from "./directory";

export function generateStaticParams() {
  return seed.events.map((e) => ({ slug: e.slug }));
}

export const metadata = { title: "Deal Room directory", robots: { index: false, follow: false } };

// the params are read inside the Suspense boundary, so the shell around them can render at once
async function Resolved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DirectoryPage slug={slug} />;
}

export default function Page({ params }: PageProps<"/e/[slug]/deal-room/directory">) {
  return (
    <Suspense fallback={<div className="p-10 text-slate">Loading…</div>}>
      <Resolved params={params} />
    </Suspense>
  );
}
