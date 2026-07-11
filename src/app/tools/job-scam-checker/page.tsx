import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeading } from "@/components/page-heading";
import { ScamChecker } from "@/components/tools/scam-checker";

export const metadata: Metadata = {
  title: "Job scam checker",
  description:
    "Screen pasted vacancy text and structured answers for explainable warning signs without fetching URLs.",
  alternates: { canonical: "/tools/job-scam-checker" },
};

export default function ScamCheckerPage() {
  return (
    <div className="site-shell stack-lg">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Tools", href: "/tools" },
          { label: "Job scam checker" },
        ]}
      />
      <PageHeading
        eyebrow="Cautious safety tool"
        title="Slow down a suspicious job message"
        description="Run SalaryPadi's deterministic warning-sign checks locally to see what triggered, why it matters and what to verify next. Submitted links are never opened, and the result never declares an employer fraudulent with certainty."
      />
      <ScamChecker />
    </div>
  );
}
