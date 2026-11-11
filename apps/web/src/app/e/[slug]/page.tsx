import { seed } from "@excursia/domain/seed";
import { EventPublic } from "./event-public";

export function generateStaticParams() {
  return seed.events.map((e) => ({ slug: e.slug }));
}

export default async function EventPage({ params }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  return <EventPublic slug={slug} />;
}
