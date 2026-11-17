import { Suspense } from "react";
import { seed } from "@excursia/domain/seed";
import { MyMeetingsPage } from "./meetings";

export function generateStaticParams() {
  return seed.events.map((e) => ({ slug: e.slug }));
}

export const metadata = { title: "My Deal Room meetings", robots: { index: false, follow: false } };

// the params are read inside the Suspense boundary, so the shell around them can render at once
async function Resolved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MyMeetingsPage slug={slug} />;
}

export default function MeetingsPage({ params }: PageProps<"/e/[slug]/deal-room/meetings">) {
  return (
    <Suspense fallback={<div className="p-10 text-slate">Loading…</div>}>
      <Resolved params={params} />
    </Suspense>
  );
}
