import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";

export const metadata: Metadata = {
  title: "Second factor required",
  robots: { index: false, follow: false },
};

export default function MfaRequiredPage() {
  return (
    <div className="reading-shell stack-lg">
      <PageHeading
        eyebrow="Admin security"
        title="A second factor is required"
        description="SalaryPadi requires an AAL2 session before moderation, role, source or privacy operations. Your current session is signed in but not strongly authenticated."
      />
      <div className="notice notice-warning">
        MFA enrolment and challenge depend on the dedicated SalaryPadi Supabase
        project. Configure an approved factor there, then start a new AAL2
        session. The database also enforces this requirement.
      </div>
      <Link className="button button-secondary w-fit" href="/">
        Return home
      </Link>
    </div>
  );
}
