import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeading } from "@/components/page-heading";
import { OfferCompare } from "@/components/tools/offer-compare";

export const metadata: Metadata = {
  title: "Offer compare",
  description:
    "Compare two offers across currencies, pay periods, benefits, work costs and contract terms using explicit inputs.",
  alternates: { canonical: "/tools/offer-compare" },
};

export default function OfferComparePage() {
  return (
    <div className="site-shell stack-lg">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Tools", href: "/tools" },
          { label: "Offer compare" },
        ]}
      />
      <PageHeading
        eyebrow="Compensation decision tool"
        title="Compare the value you will actually feel"
        description="SalaryPadi compares the offers deterministically. Only the required currency pairs are requested from AfroTools; offer amounts and terms stay out of that provider request."
      />
      <OfferCompare />
    </div>
  );
}
