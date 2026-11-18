import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { VisitBeacon } from "@/components/visit-beacon";

export const metadata: Metadata = {
  title: "ExcursiaConnect",
  description: "Epic Travel. Exceptional Events. — event management prototype",
  icons: { icon: "/brand/excursia-icon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        {/* the visitor log: pages, visible time and clicks, recorded on the server (README, Visitor log) */}
        <Suspense fallback={null}>
          <VisitBeacon />
        </Suspense>
      </body>
    </html>
  );
}
