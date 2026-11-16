import { Desk } from "./desk";

export const metadata = { title: "Deal Room desk scanner", robots: { index: false, follow: false } };

export default function DeskPage() {
  return <Desk />;
}
