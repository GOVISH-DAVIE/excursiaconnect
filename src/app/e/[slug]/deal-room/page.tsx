import { Suspense } from "react";
import { seed } from "@/lib/seed";
import { DealRoomPublic } from "./public";

export function generateStaticParams() {
  return seed.events.map((e) => ({ slug: e.slug }));
}

export default async function DealRoomPage({ params }: PageProps<"/e/[slug]/deal-room">) {
  const { slug } = await params;
  return (
    <Suspense fallback={<div className="p-10 text-slate">Loading…</div>}>
      <DealRoomPublic slug={slug} />
    </Suspense>
  );
}
