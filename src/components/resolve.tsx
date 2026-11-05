import { Suspense, type ReactNode } from "react";

async function Inner<T>({ params, render }: { params: Promise<T>; render: (p: T) => ReactNode }) {
  const p = await params;
  return <>{render(p)}</>;
}

/** Streams a dynamic segment inside Suspense so routes without generateStaticParams still prerender a shell. */
export function Resolve<T>({ params, render }: { params: Promise<T>; render: (p: T) => ReactNode }) {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <Inner params={params} render={render} />
    </Suspense>
  );
}
