import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { BrandArt } from "@/components/media/brand-art";
import { PageHeading } from "@/components/page-heading";
import { JobContextBanner } from "@/components/product/job-context-banner";
import { SalaryConverter } from "@/components/tools/salary-converter";
import {
  contextPeriodFitsCalculator,
  readJobContext,
} from "@/lib/product/job-context";

export const metadata: Metadata = {
  title: "Salary currency converter",
  description:
    "Convert a monthly or annual salary using a source-labelled AfroTools FX rate.",
  alternates: { canonical: "/tools/salary-converter" },
};

export default async function SalaryConverterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = readJobContext(await searchParams);
  // The converter reasons about monthly or annual amounts; an hourly or
  // weekly rate is not carried over, because a prefilled rate presented as a
  // monthly salary would misstate the conversion.
  const prefills = context !== null && contextPeriodFitsCalculator(context);

  return (
    <div className="site-shell stack-lg">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Tools", href: "/tools" },
          { label: "Salary converter" },
        ]}
      />
      {context ? (
        <JobContextBanner action="Converting pay for" context={context} />
      ) : null}
      <PageHeading
        eyebrow="AfroTools FX"
        title="Convert a salary with visible rate evidence"
        description="SalaryPadi fetches only a unit currency rate, applies it locally, and refuses rates older than 30 days."
      />
      <BrandArt className="page-art" id="tool-salary-converter" />
      <SalaryConverter
        defaults={
          prefills
            ? {
                amount: context?.amount ?? undefined,
                from: context?.currency ?? undefined,
                period:
                  context?.period === "annual"
                    ? "annual"
                    : context?.period === "monthly"
                      ? "monthly"
                      : undefined,
              }
            : undefined
        }
      />
    </div>
  );
}
