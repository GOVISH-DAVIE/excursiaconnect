import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui";
import { PRIVACY } from "@/lib/privacy";

/**
 * The privacy notice (Kenya Data Protection Act 2019; backend-plan.md, M1.5): what the platform collects, why, who
 * sees it, how long it keeps it and what people can ask for. Every period and safeguard here is one the platform
 * enforces; the facts only Algotech can confirm come from lib/privacy.ts.
 */
export const metadata: Metadata = {
  title: "Privacy notice · ExcursiaConnect",
  description: "How ExcursiaConnect and the organisers who use it handle your personal data, and how to ask for a copy, a correction or deletion.",
};

const SECTIONS = [
  ["who", "Who we are"],
  ["what", "What we collect"],
  ["why", "Why we use it"],
  ["who-sees", "Who sees it"],
  ["how-long", "How long we keep it"],
  ["security", "How we protect it"],
  ["rights", "Your rights"],
  ["contact", "Contact and complaints"],
] as const;

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="nav nav--static">
        <div className="wrap nav__bar">
          <Link href="/" aria-label="ExcursiaConnect home">
            <Wordmark />
          </Link>
        </div>
      </header>

      <main className="wrap wrap--narrow py-10 sm:py-14">
        <h1 className="h1">Privacy notice</h1>
        <p className="mt-2 text-[15px] text-slate">Last updated {PRIVACY.updated}</p>
        <p className="mt-6 text-[16px] leading-relaxed">
          ExcursiaConnect is the platform event organisers use for registration, badges and the Deal Room, where businesses, investors, partners and
          institutions apply to meet. This notice says what personal data it holds about you, why, who sees it, how long it is kept, and what you can
          ask for. It follows Kenya&rsquo;s Data Protection Act, 2019.
        </p>

        <nav aria-label="On this page" className="mt-8 border-y border-line py-4">
          <ol className="grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-2">
            {SECTIONS.map(([id, label], i) => (
              <li key={id}>
                <a href={`#${id}`} className="underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                  {i + 1}. {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <Section id="who" title="1. Who we are">
          <p>
            {PRIVACY.operator} runs ExcursiaConnect. For each event, the organiser decides what its forms ask and what happens to applications: the
            organiser is the data controller for its event, and {PRIVACY.operator} processes the data for it. For your account itself (your email, how you
            sign in) and for running the platform safely, {PRIVACY.operator} is the controller.
          </p>
          <p>{PRIVACY.registration}</p>
        </Section>

        <Section id="what" title="2. What we collect">
          <List
            items={[
              ["Your account", "your email address, and your name and phone number if you give them. Staff accounts also hold a password (stored only as a hash) and an authenticator app's secret."],
              ["A Deal Room application", "your organisation's details, what you are raising or offering, the decision-maker's name, title, email and phone, your answers to the team's questions, and the documents you upload (pitch deck, financial statements, registration certificate and others)."],
              ["Organisers' KYC", "the organisation's registration and tax details, address and payout account, its signatory, and the registration certificate, tax PIN certificate and signatory's ID."],
              ["Records of what happens", "when you sign in, what changes on an application and by whom, who opened which document, and each email we send you (its subject and when it was sent)."],
              ["Visits to the site", "on the demonstration site only: your IP address, browser, the pages opened and the time on each, clicks, and a replay of the screen with every input field hidden."],
            ]}
          />
          <p>We don&rsquo;t use advertising or tracking cookies. The only cookie we set is the one that keeps you signed in.</p>
        </Section>

        <Section id="why" title="3. Why we use it">
          <List
            items={[
              ["To run what you asked for", "to review your application, match you with counterparties, arrange meetings and keep you informed. This is needed to provide the service you applied for."],
              ["To keep the platform safe", "to sign you in, stop abuse, scan uploads for viruses and keep an audit trail. These are our legitimate interests and legal obligations."],
              ["To check organisers", "KYC on organisers before they take payments, as the law on payments requires."],
              ["When you agree", "sharing a document with a particular investor or partner happens only with your consent, document by document, and you can withdraw it."],
            ]}
          />
          <p>We don&rsquo;t sell personal data, and we don&rsquo;t use it for marketing without your consent.</p>
        </Section>

        <Section id="who-sees" title="4. Who sees it">
          <List
            items={[
              ["The event's Deal Room team", "the people the organiser names to review applications and run the Deal Room. They see the applications they work on, and every time they open a document it is recorded."],
              ["Investors, partners and institutions", "before an introduction, only an anonymous summary you approve. Your documents only with your consent, per document and per counterparty, and you can see who opened what."],
              ["The organiser's oversight", "reports and figures, never your files."],
              [`${PRIVACY.operator}'s team`, "to run the platform, check organisers' KYC and help when something goes wrong. Support access to a Deal Room is granted by its lead, limited in time and recorded."],
              ["Our service providers", "the company that hosts the platform, Zoho for sending email, and, when a fee is paid, Safaricom (M-Pesa) or the card payment provider. Each sees only what its part needs."],
            ]}
          />
          <p>{PRIVACY.hosting}</p>
        </Section>

        <Section id="how-long" title="5. How long we keep it">
          <List
            items={[
              ["Deal Room documents", "until 12 months after the Deal Room's follow-up period ends, unless the Deal Room's lead extends it and records why. Then the files are deleted."],
              ["A file that fails the virus check", "deleted at once."],
              ["Applications and their records", "for the Deal Room's follow-up period, then archived with the event. Ask us if you want yours deleted sooner."],
              ["Organisers' KYC", "while the organiser works with us, then for as long as the law on payment records requires."],
              ["Sign-in", "a sign-in code works once, for 10 minutes. You stay signed in for up to 30 days as an applicant, or 12 hours as staff."],
              ["Visits to the demonstration site", "deleted after 90 days."],
              ["Backups", "kept for 30 days, then deleted. Something deleted from the platform is gone from the backups within 30 days."],
            ]}
          />
        </Section>

        <Section id="security" title="6. How we protect it">
          <p>
            Everything travels over an encrypted connection. Staff sign in with a password and an authenticator app. Every upload is checked for viruses
            before anyone can open it, and a document opens only through a link that works for two minutes. The platform records who opened what and who
            changed what, and those records can&rsquo;t be edited. If a breach puts your data at risk, we tell the Data Protection Commissioner within 72
            hours, and you too if it affects you.
          </p>
        </Section>

        <Section id="rights" title="7. Your rights">
          <p>Under the Act you may:</p>
          <List
            items={[
              ["Be told", "how your data is used, as this notice does."],
              ["See it", "get a copy of the personal data we hold about you."],
              ["Correct it", "have wrong or misleading data put right. Much of it you can change yourself, on your application before you submit it."],
              ["Have it deleted", "where it is no longer needed, or was wrongly processed."],
              ["Object", "to our using it, including where we rely on our legitimate interests."],
              ["Take it with you", "receive your data in a common electronic format."],
              ["Withdraw consent", "for a document you shared, at any time; access stops at once."],
            ]}
          />
          <p>Some data we must keep for legal reasons, such as payment records; if so, we say which and why.</p>
        </Section>

        <Section id="contact" title="8. Contact and complaints">
          <p>
            To ask for any of the above, or with a question about this notice, write to{" "}
            <a className="underline underline-offset-4" href={`mailto:${PRIVACY.contact}`}>
              {PRIVACY.contact}
            </a>{" "}
            from the email you use on the platform, so we know the request is yours. For an event&rsquo;s own data, we pass your request to its organiser
            as well.
          </p>
          <p>
            If you are unhappy with our answer, you can complain to the Office of the Data Protection Commissioner,{" "}
            <a className="underline underline-offset-4" href="https://www.odpc.go.ke" rel="noopener">
              odpc.go.ke
            </a>
            .
          </p>
          <p>When this notice changes, the date at the top changes too, and we tell you by email if the change affects how your data is used.</p>
        </Section>
      </main>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-10 scroll-mt-6 space-y-3 text-[16px] leading-relaxed">
      <h2 id={`${id}-title`} className="h2 !text-[20px]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function List({ items }: { items: [string, string][] }) {
  return (
    <ul className="space-y-2">
      {items.map(([head, text]) => (
        <li key={head} className="grid gap-x-4 sm:grid-cols-[200px_1fr]">
          <span className="font-medium">{head}</span>
          <span>{text.charAt(0).toUpperCase() + text.slice(1)}</span>
        </li>
      ))}
    </ul>
  );
}
