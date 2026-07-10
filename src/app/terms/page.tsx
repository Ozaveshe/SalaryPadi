import type { Metadata } from "next";

import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "Core terms for using SalaryPadi job and career information.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PolicyPage
      eyebrow="Terms of use"
      title="Use the evidence; verify the decision"
      description="These launch-draft terms explain the product boundaries. They require legal review and a named operating entity before production."
    >
      <p>
        <strong>Last updated:</strong> 10 July 2026.
      </p>
      <h2>Information, not a guarantee</h2>
      <p>
        SalaryPadi provides source-attributed job information, community
        evidence and estimates. We do not guarantee employment, employer
        conduct, vacancy safety, tax outcomes, currency value or the
        completeness of third-party information. Verify material decisions with
        the original employer and an appropriate professional.
      </p>
      <h2>Applications and external sites</h2>
      <p>
        MVP applications happen on external employer or permitted-source pages.
        Their terms and privacy practices apply. Never pay SalaryPadi or a
        recruiter to bypass moderation or secure a job.
      </p>
      <h2>Contributions</h2>
      <p>
        Submit only information you are authorised to share. Do not identify
        private individuals, disclose confidential material, impersonate another
        person, manipulate aggregates, harass others or submit unlawful content.
        Contributions may be moderated, redacted, merged, rejected or removed.
      </p>
      <h2>Source rights</h2>
      <p>
        Job content is displayed only under a recorded source policy. Source
        attribution and required destination links must remain intact. Automated
        extraction, republishing or submission to third-party job platforms may
        violate those source terms and is not authorised by SalaryPadi.
      </p>
      <h2>Changes and availability</h2>
      <p>
        Jobs expire, rules change and sources can withdraw access. We may update
        or remove information to reflect those changes, respond to reports or
        protect users. Material production-term changes will receive an
        effective date and appropriate notice.
      </p>
    </PolicyPage>
  );
}
