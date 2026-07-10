import type { Metadata } from "next";
import Link from "next/link";

import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How SalaryPadi classifies eligibility, normalizes jobs and compensation, publishes aggregates and communicates confidence.",
  alternates: { canonical: "/methodology" },
};

export default function MethodologyPage() {
  return (
    <PolicyPage
      eyebrow="Evidence rules"
      title="How SalaryPadi reaches a careful answer"
      description="Every useful label needs a source, a date and a rule. Where the evidence is incomplete, we say so."
    >
      <h2>Remote eligibility</h2>
      <p>
        “Remote” describes where work happens; it does not identify who may be
        hired. We classify worldwide, Africa, EMEA, Nigeria, named-country,
        restricted and unclear eligibility separately. The exact source wording,
        provenance and verification date remain attached to the classification.
      </p>
      <p>
        We mark Nigeria eligible automatically only when a source explicitly
        says Worldwide, Nigeria, Africa, or names Nigeria in an included-country
        list. EMEA and ambiguous free text remain unclear until reviewed.
      </p>
      <h2>Source and vacancy freshness</h2>
      <p>
        Each source has a policy record describing its terms, attribution,
        storage, indexing, structured-data and destination requirements. Imports
        are idempotent. Jobs store first-seen, last-seen, last-checked and
        expiry dates. A missing record is not expired until a successful refresh
        provides enough evidence.
      </p>
      <h2>Salary publication</h2>
      <p>
        Original currency, pay period and gross/net status are preserved. Public
        employer-role-country figures require at least three sufficiently
        similar approved contributions from distinct accounts. Smaller cells are
        broadened or suppressed; individual salary submissions are never public.
      </p>
      <h2>Confidence</h2>
      <p>
        Confidence reflects sample size, similarity, freshness and verification.
        It is not a promise that a company, job or estimate is correct or safe.
        Ratings are withheld until their separate minimum review threshold is
        met.
      </p>
      <h2>Calculators</h2>
      <p>
        Payroll rules are versioned with effective dates and official links. The
        calculator uses the Nigeria Tax Act 2025 rules effective 1 January 2026
        and exposes assumptions rather than hiding them. Currency conversions
        are labelled estimates with a rate and timestamp.
      </p>
      <h2 id="data-environments">Data environments</h2>
      <p>
        Production requires a dedicated SalaryPadi Supabase project. Local code
        never falls back to another product’s database. Development fixtures are
        opt-in, visibly labelled and refused in production. Without credentials,
        private features fail closed rather than storing sensitive data in the
        browser.
      </p>
      <p>
        Technical decisions and phase evidence live in the repository’s product
        plan. Questions or corrections can be submitted through the{" "}
        <Link href="/trust-and-safety">trust and safety process</Link>.
      </p>
    </PolicyPage>
  );
}
