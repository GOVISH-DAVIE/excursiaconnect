import { Resolve } from "@/components/resolve";
import { Review } from "./review";

export default function ReviewPage({ params }: PageProps<"/dealroom/applications/[id]">) {
  return <Resolve params={params} render={(p) => <Review id={p.id} />} />;
}
