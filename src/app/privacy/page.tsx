import type { Metadata } from "next";

import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What SalaryPadi collects, why it is used, what is never sent to analytics, and user data choices.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      eyebrow="Privacy notice"
      title="Your career data is not advertising inventory"
      description="This product is designed for data minimisation and account-linked moderation without public identity disclosure. This notice is an operational draft for legal review before launch."
    >
      <p>
        <strong>Last updated:</strong> 10 July 2026.
      </p>
      <h2>Data we need</h2>
      <p>
        Account identity and session data support sign-in, ownership and abuse
        prevention. Saved jobs, application notes, alert settings and
        contribution drafts are private. Submitted reviews, salary information
        and interview experiences are retained for moderation and, only after
        approval, used in redacted publications or aggregates.
      </p>
      <h2>Public anonymity</h2>
      <p>
        Community contributions may be publicly anonymous, but they remain
        privately linked to an account for moderation, deletion and manipulation
        controls. Employers and other users do not receive that identity link.
      </p>
      <h2>Analytics boundaries</h2>
      <p>
        Salary amounts, review or interview text, private notes, email
        addresses, CV content, identity documents and other personal data are
        prohibited from analytics events. Analytics is disabled until a reviewed
        provider is configured.
      </p>
      <h2>Your choices</h2>
      <p>
        Authenticated users can request data export, correction, contribution
        deletion and account deletion. Some narrowly scoped audit or abuse
        records may be retained when a documented legal or safety reason
        applies. Retention periods and the production contact must be approved
        before launch.
      </p>
      <h2>Hosting and processors</h2>
      <p>
        The planned backend is a dedicated Supabase project. Deployment, email,
        currency and analytics providers are not yet selected. Their locations,
        contracts and subprocessor terms require privacy review before
        production.
      </p>
      <p>
        These controls are designed around the Nigeria Data Protection Act and
        future multi-country needs, but a design or policy page is not itself a
        claim of legal compliance.
      </p>
    </PolicyPage>
  );
}
