import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeading } from "@/components/page-heading";
import { TakeHomeCalculator } from "@/components/tools/take-home-calculator";

export const metadata: Metadata = {
  title: "Nigeria take-home pay calculator",
  description:
    "Convert Nigeria gross pay to net pay, or net pay to gross pay, using versioned AfroTools PAYE data.",
  alternates: { canonical: "/tools/take-home-pay" },
};

export default function TakeHomePayPage() {
  return (
    <div className="site-shell stack-lg">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Tools", href: "/tools" },
          { label: "Take-home pay" },
        ]}
      />
      <PageHeading
        eyebrow="Nigeria payroll tool"
        title="See where gross pay goes"
        description="Run gross-to-net or net-to-gross calculations against versioned AfroTools PAYE data. If rules or responses cannot be verified, SalaryPadi shows no result."
      />
      <TakeHomeCalculator />
    </div>
  );
}
