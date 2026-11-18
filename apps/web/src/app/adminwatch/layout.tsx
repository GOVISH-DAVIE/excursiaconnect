import type { Metadata } from "next";
import type { ReactNode } from "react";

// private: never indexed, never linked from the prototype; nothing clicked here is recorded, and no replay shows it
export const metadata: Metadata = { title: "Visitor log", robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } } };

export default function WatchLayout({ children }: { children: ReactNode }) {
  return (
    <div data-no-track data-no-record className="min-h-screen bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
