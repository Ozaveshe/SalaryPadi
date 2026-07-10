import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeading } from "@/components/page-heading";
import { TakeHomeCalculator } from "@/components/tools/take-home-calculator";

export const metadata: Metadata = {
  title: "Nigeria take-home pay calculator",
  description:
    "Estimate Nigeria PAYE, pension, NHF and take-home pay with versioned rules effective from 1 January 2026.",
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
        description="Use explicit pension, NHF and health inputs. Statutory PAYE runs through the AfroTools API with a verified SalaryPadi fallback; the calculator does not carry the repealed consolidated relief allowance into 2026 rules."
      />
      <TakeHomeCalculator defaultDate={new Date().toISOString().slice(0, 10)} />
    </div>
  );
}
