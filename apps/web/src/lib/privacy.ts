/**
 * The facts the privacy notice (/privacy) states about Algotech that only Algotech can confirm. Each `confirm` line
 * must be checked before applications open (backend-plan.md, M1.5); the page reads everything else from what the
 * platform does.
 */
export const PRIVACY = {
  /** When the notice last changed; bump it with every change to the page. */
  updated: "12 November 2026",
  /** confirm: the registered company name */
  operator: "Algotech",
  /** confirm: the mailbox that answers privacy requests */
  contact: "privacy@algotech.co.ke",
  /** confirm: once the hosting region is chosen (D6); say the country, and the safeguards if outside Kenya */
  hosting: "Our servers, database and backups are run by a hosting provider under contract with us. If any of it is kept outside Kenya, we put in place the safeguards the Act requires for transfers and name the country here.",
  /** confirm: the ODPC registration number, once issued */
  registration: "Algotech is registering with the Office of the Data Protection Commissioner as a data controller and processor.",
} as const;
