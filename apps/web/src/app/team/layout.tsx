import type { Metadata } from "next";
import { TeamShell } from "./team-shell";

export const metadata: Metadata = { title: "Team workspace · ExcursiaConnect", robots: { index: false } };

export default function TeamLayout({ children }: LayoutProps<"/team">) {
  return <TeamShell>{children}</TeamShell>;
}
