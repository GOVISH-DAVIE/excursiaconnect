import { Suspense } from "react";
import { Badge } from "./badge";

async function Resolved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Badge id={id} />;
}

export default function BadgePage({ params }: PageProps<"/badge/[id]">) {
  return (
    <Suspense fallback={<div className="p-10 text-slate">Loading badge…</div>}>
      <Resolved params={params} />
    </Suspense>
  );
}
