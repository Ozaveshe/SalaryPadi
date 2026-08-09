import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { BrandArt } from "@/components/media/brand-art";
import { PageHeading } from "@/components/page-heading";
import { JobContextBanner } from "@/components/product/job-context-banner";
import { ScamChecker } from "@/components/tools/scam-checker";
import { readJobContext } from "@/lib/product/job-context";

export const metadata: Metadata = {
  title: "Job scam checker",
  description:
    "Screen pasted vacancy text and structured answers for explainable warning signs without fetching URLs.",
  alternates: { canonical: "/tools/job-scam-checker" },
};

export default async function ScamCheckerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = readJobContext(await searchParams);
  return (
    <div className="site-shell stack-lg">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Tools", href: "/tools" },
          { label: "Job scam checker" },
        ]}
      />
      {context ? (
        <JobContextBanner
          action="Checking warning signs for"
          context={context}
        />
      ) : null}
      <PageHeading
        eyebrow="Cautious safety tool"
        title="Slow down a suspicious job message"
        description="Run SalaryPadi's deterministic warning-sign checks locally to see what triggered, why it matters and what to verify next. Submitted links are never opened, and the result never declares an employer fraudulent with certainty."
      />
      <BrandArt className="page-art" id="tool-job-scam-checker" />
      <ScamChecker />
    </div>
  );
}
