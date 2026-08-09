import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { BrandArt } from "@/components/media/brand-art";
import { PageHeading } from "@/components/page-heading";
import { JobContextBanner } from "@/components/product/job-context-banner";
import { TakeHomeCalculator } from "@/components/tools/take-home-calculator";
import {
  contextIsNairaPaye,
  contextPeriodFitsCalculator,
  readJobContext,
  withJobContext,
} from "@/lib/product/job-context";

export const metadata: Metadata = {
  title: "Nigeria take-home pay calculator",
  description:
    "Convert Nigeria gross pay to net pay, or net pay to gross pay, using versioned AfroTools PAYE data.",
  alternates: { canonical: "/tools/take-home-pay" },
};

export default async function TakeHomePayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = readJobContext(await searchParams);
  // A role advertised in dollars can still prefill the amount, but the naira
  // PAYE result would not describe that pay, so the figure is not carried
  // over. Likewise an hourly/daily/weekly rate: this calculator reasons about
  // monthly or annual pay, and prefilling a weekly rate as a monthly salary
  // would misstate the tax outcome.
  const prefillsAmount =
    context !== null &&
    contextIsNairaPaye(context) &&
    contextPeriodFitsCalculator(context);

  return (
    <div className="site-shell stack-lg">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Pay & Offers", href: "/salaries" },
          { label: "Take-home pay" },
        ]}
      />
      {context ? (
        <JobContextBanner
          action="Working out take-home pay for"
          context={context}
        />
      ) : null}
      <PageHeading
        eyebrow="Nigeria payroll tool"
        title="See where gross pay goes"
        description="Run gross-to-net or net-to-gross calculations against versioned AfroTools PAYE data. If rules or responses cannot be verified, SalaryPadi shows no result."
      />
      {context && !prefillsAmount ? (
        contextIsNairaPaye(context) ? (
          <p className="field-help">
            This role advertises {context.period ?? "non-monthly"} pay. The
            calculator reasons about monthly or annual naira pay, so the
            advertised rate has not been carried over.
          </p>
        ) : (
          <p className="field-help">
            This role advertises pay in {context.currency}. The calculator
            covers Nigerian PAYE on naira pay, so the advertised amount has not
            been carried over — convert it first with the{" "}
            <a href={withJobContext("/tools/salary-converter", context)}>
              salary converter
            </a>
            .
          </p>
        )
      ) : null}
      <BrandArt className="page-art" id="tool-take-home-pay" />
      <TakeHomeCalculator
        defaultAmount={
          prefillsAmount && context?.amount ? context.amount : undefined
        }
        defaultPeriod={context?.period === "annual" ? "annual" : undefined}
      />
    </div>
  );
}
