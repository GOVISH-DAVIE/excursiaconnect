import Link from "next/link";
import { Logo } from "@/components/ui";
import { ResetButton } from "@/components/reset";

const personas = [
  { href: "/e/nairobi-brand-summit-2026", title: "Delegate", desc: "Public event page, programme, registration and payment, then the mobile badge." },
  { href: "/badge/d_demo", title: "Badge", desc: "Amina's QR badge with My day, breakout enrolment, meeting booking and chat." },
  { href: "/organiser", title: "Organiser", desc: "Epic PR & Events: live dashboard, delegates, tiers, programme, zones, finance, with a drill-down behind every number." },
  { href: "/admin", title: "Algotech admin", desc: "Approval queue, KYC, per-event pricing and staffing, reconciliation and payouts." },
  { href: "/speaker/s3", title: "Facilitator", desc: "Esther's session: roster, door scans, start and end, slides and feedback." },
  { href: "/scan", title: "Staff scanner", desc: "Accreditation desk and zone doors. Allow or deny in one tap, with the reason." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <Logo variant="light" className="h-32" />
        <p className="mt-8 max-w-xl text-white/70 text-lg leading-relaxed">
          Clickable prototype of the ExcursiaConnect PRD. Data is mock and lives in this browser, so what one persona does, the others see.
        </p>
        <div className="mt-10 grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3 rounded-lg overflow-hidden">
          {personas.map((p) => (
            <Link key={p.href} href={p.href} className="group bg-ink p-6 hover:bg-ink-800 transition-colors">
              <h2 className="text-xl font-extrabold tracking-tight group-hover:text-coral">{p.title}</h2>
              <p className="mt-2 text-sm text-white/65 leading-relaxed">{p.desc}</p>
            </Link>
          ))}
        </div>
        <div className="mt-10 flex items-center gap-5 text-sm text-white/50">
          <ResetButton />
          <span>Prototype v0.2, Algotech Labs, November 2026</span>
        </div>
      </div>
    </div>
  );
}
