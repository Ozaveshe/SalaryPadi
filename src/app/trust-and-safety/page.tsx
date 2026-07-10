import type { Metadata } from "next";
import Link from "next/link";

import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Trust and safety",
  description:
    "SalaryPadi moderation, vacancy reporting, correction and contributor safety principles.",
  alternates: { canonical: "/trust-and-safety" },
};

export default function TrustAndSafetyPage() {
  return (
    <PolicyPage
      eyebrow="Trust & safety"
      title="Useful evidence, with careful boundaries"
      description="A verification badge explains what was checked. It never guarantees that a vacancy, employer or application process is safe."
    >
      <h2>What we check</h2>
      <p>
        SalaryPadi records original source, employer or agency status,
        publication and check dates, eligibility evidence, application
        destination, reports and explainable warning indicators. We do not
        accept payment to bypass moderation or change trust decisions.
      </p>
      <h2>Community contributions</h2>
      <p>
        Salary, review and interview submissions are privately linked to an
        authenticated account for moderation and deletion. Employers and other
        users never receive contributor identities. Contributions remain pending
        until a moderator approves and, where necessary, redacts them.
      </p>
      <p>
        Do not name ordinary managers, coworkers or private individuals. Do not
        share confidential test answers, identity documents, banking credentials
        or information that could identify another contributor.
      </p>
      <h2>Moderation and appeals</h2>
      <p>
        Moderators may approve, redact, reject, request revision, escalate,
        merge, remove or restore content. Every action records actor, reason,
        timestamp and state change. Employers may request a factual correction
        but cannot suppress genuine criticism or obtain reviewer identity.
      </p>
      <h2>When a job looks suspicious</h2>
      <ul>
        <li>Do not pay application, training, equipment or processing fees.</li>
        <li>Verify the domain and role on the employer’s own careers page.</li>
        <li>
          Do not send banking credentials or unnecessary identity documents.
        </li>
        <li>
          Pause if the process uses pressure, messaging-only interviews or
          cryptocurrency.
        </li>
      </ul>
      <p>
        Use the <Link href="/tools/job-scam-checker">job scam checker</Link> for
        an explainable screening result. It cannot declare fraud with certainty.
      </p>
    </PolicyPage>
  );
}
