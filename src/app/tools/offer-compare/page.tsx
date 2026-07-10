import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeading } from "@/components/page-heading";
import { OfferCompare } from "@/components/tools/offer-compare";
import { getReferenceCurrencyRates } from "@/lib/currency/repository";

export const metadata: Metadata = {
  title: "Offer compare",
  description:
    "Compare two offers across currencies, pay periods, benefits, work costs and contract terms using explicit inputs.",
  alternates: { canonical: "/tools/offer-compare" },
};

export default async function OfferComparePage() {
  const referenceRates = await getReferenceCurrencyRates();
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
        description="Normalize two offers through the AfroTools API without hiding FX assumptions, benefit values, personal work costs or contract differences."
      />
      <OfferCompare referenceRates={referenceRates} />
    </div>
  );
}
