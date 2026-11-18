import type { ReactNode } from "react";

/** A portal panel: a white surface with an optional title and something beside it. */
export function Card({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="surface p-5">
      {(title || aside) && (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 mb-3">
          {title && <h2 className="h2">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
