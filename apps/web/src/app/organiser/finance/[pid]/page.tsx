import { Resolve } from "@/components/resolve";
import { PayoutStatement } from "./statement";

export default function Page({ params }: PageProps<"/organiser/finance/[pid]">) {
  return <Resolve params={params} render={({ pid }) => <PayoutStatement payoutId={pid} />} />;
}
