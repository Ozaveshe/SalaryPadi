import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { BrandArt } from "@/components/media/brand-art";
import { PageHeading } from "@/components/page-heading";
import { JobContextBanner } from "@/components/product/job-context-banner";
import { OfferCompare } from "@/components/tools/offer-compare";
import { readJobContext } from "@/lib/product/job-context";

export const metadata: Metadata = {
  title: "Offer compare",
  description:
    "Compare two offers across currencies, pay periods, benefits, work costs and contract terms using explicit inputs.",
  alternates: { canonical: "/tools/offer-compare" },
};

export default async function OfferComparePage({
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
          { label: "Pay & Offers", href: "/salaries" },
          { label: "Offer compare" },
        ]}
      />
      {context ? (
        <JobContextBanner action="Comparing an offer for" context={context} />
      ) : null}
      <PageHeading
        eyebrow="Compensation decision tool"
        title="Compare the value you will actually feel"
        description="SalaryPadi compares the offers deterministically. Only the required currency pairs are requested from AfroTools; offer amounts and terms stay out of that provider request."
      />
      <BrandArt className="page-art" id="tool-offer-compare" />
      <OfferCompare
        offerA={
          context
            ? {
                label: `${context.title} — ${context.company}`,
                base: context.amount ?? undefined,
                currency: context.currency ?? undefined,
                period: context.period ?? undefined,
              }
            : undefined
        }
      />
    </div>
  );
}
