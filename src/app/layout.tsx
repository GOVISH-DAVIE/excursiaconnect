import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
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
        <StoreProvider>{children}</StoreProvider>
        {/* the visitor log: pages, visible time and clicks, recorded on the server (README, Visitor log) */}
        <Suspense fallback={null}>
          <VisitBeacon />
        </Suspense>
      </body>
    </html>
  );
}
