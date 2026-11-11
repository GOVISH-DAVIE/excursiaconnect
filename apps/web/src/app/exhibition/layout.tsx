import { ExhibitionShell } from "./shell";

export default function ExhibitionLayout({ children }: LayoutProps<"/exhibition">) {
  return <ExhibitionShell>{children}</ExhibitionShell>;
}
