import Link from "next/link";
import { Logo } from "@/components/ui";
import { ResetButton } from "@/components/reset";

const personas = [
  { href: "/e/nairobi-brand-summit-2026", title: "Event website", desc: "The organiser-branded public page: programme, speakers, tickets and venue, then registration and payment." },
  { href: "/badge/d_demo", title: "Badge", desc: "Amina's QR badge with My day, breakout enrolment, meeting booking and chat." },
  { href: "/organiser", title: "Organiser", desc: "Epic PR & Events: live dashboard, delegates, tiers, programme, zones, finance, with a drill-down behind every number." },
  { href: "/admin", title: "Algotech admin", desc: "Approval queue, KYC, per-event pricing and staffing, reconciliation and payouts." },
  { href: "/speaker/s3", title: "Facilitator", desc: "Esther's session: roster, door scans, start and end, slides and feedback." },
  { href: "/scan", title: "Staff scanner", desc: "Accreditation desk and zone doors. Allow or deny in one tap, with the reason." },
];

const dealRoom = [
  { href: "/e/connected-africa-3/deal-room", title: "Deal Room page", desc: "Connected Africa 3.0: who it is for, the eligibility check, how it works, and the two applications." },
  { href: "/dealroom", title: "Deal Room team", desc: "Bouer's lead, reviewers and operations: the queue, scoring with evidence, decisions, settings and reports." },
  { href: "/dr/dr_cs50", title: "A business raising capital", desc: "Approved and Deal Room Ready: status, decision, teaser and profile, documents, badge." },
  { href: "/dr/dr_fp20", title: "An investor", desc: "A verified finance provider: KYC, the NDA, the mandate and its re-review." },
  { href: "/dr/dr_cs24", title: "An applicant asked for more", desc: "A seeker with an open information request to answer, before any decision." },
  { href: "/dr/dr_fp10", title: "A provider not yet verified", desc: "Uploading KYC and signing the NDA; nothing else in the Deal Room is visible yet." },
  { href: "/admin/deal-room", title: "Algotech: Deal Room", desc: "The add-on on the approval record, staff accounts and MFA, support access only under a lead's grant." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <Logo variant="light" className="h-32" />
        <p className="mt-8 max-w-xl text-white/70 text-[18px] leading-relaxed">Clickable prototype of the ExcursiaConnect PRD. Data is mock and lives in this browser, so what one persona does, the others see.</p>
        <div className="mt-10 grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3 rounded-xl overflow-hidden">
          {personas.map((p) => (
            <Link key={p.href} href={p.href} className="group bg-ink p-6 hover:bg-ink-800 transition-colors">
              <h2 className="text-[20px] font-medium tracking-[-0.01em] group-hover:text-coral transition-colors">{p.title}</h2>
              <p className="mt-2 text-[15px] text-white/65 leading-relaxed">{p.desc}</p>
            </Link>
          ))}
        </div>
        <h2 className="mt-14 text-[13px] font-medium uppercase tracking-[0.08em] text-white/50">Deal Room module · Connected Africa 3.0, as of summit day 2</h2>
        <div className="mt-4 grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3 rounded-xl overflow-hidden">
          {dealRoom.map((p) => (
            <Link key={p.href} href={p.href} className="group bg-ink p-6 hover:bg-ink-800 transition-colors">
              <h2 className="text-[20px] font-medium tracking-[-0.01em] group-hover:text-coral transition-colors">{p.title}</h2>
              <p className="mt-2 text-[15px] text-white/65 leading-relaxed">{p.desc}</p>
            </Link>
          ))}
        </div>
        <div className="mt-10 flex items-center gap-5 text-[14px] text-white/50">
          <ResetButton />
          <span>Prototype v0.3, Algotech Labs, November 2026</span>
        </div>
      </div>
    </div>
  );
}
