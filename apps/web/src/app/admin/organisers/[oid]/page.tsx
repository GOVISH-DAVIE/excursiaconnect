import { Resolve } from "@/components/resolve";
import { OrganiserDetail } from "./organiser";

export default function Page({ params }: PageProps<"/admin/organisers/[oid]">) {
  return <Resolve params={params} render={({ oid }) => <OrganiserDetail organiserId={oid} />} />;
}
