import { DealRoomShell } from "./shell";

export default function DealRoomLayout({ children }: LayoutProps<"/dealroom">) {
  return <DealRoomShell>{children}</DealRoomShell>;
}
