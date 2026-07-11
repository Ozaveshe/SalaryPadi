import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeading } from "@/components/page-heading";
import { SalaryConverter } from "@/components/tools/salary-converter";

export const metadata: Metadata = {
  title: "Salary currency converter",
  description:
    "Convert a monthly or annual salary using a source-labelled AfroTools FX rate.",
  alternates: { canonical: "/tools/salary-converter" },
};

export default function SalaryConverterPage() {
  return (
    <div className="site-shell stack-lg">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Tools", href: "/tools" },
          { label: "Salary converter" },
        ]}
      />
      <PageHeading
        eyebrow="AfroTools FX"
        title="Convert a salary with visible rate evidence"
        description="SalaryPadi fetches only a unit currency rate, applies it locally, and refuses rates older than 30 days."
      />
      <SalaryConverter />
    </div>
  );
}
