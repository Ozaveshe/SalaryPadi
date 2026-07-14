import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { SalaryAggregateCard } from "@/components/salaries/salary-aggregate-card";
import { SalaryContributionCta } from "@/components/salaries/salary-contribution-cta";
import { SalaryProgress } from "@/components/salaries/salary-progress";
import {
  getCountryPack,
  isCountryPackPublic,
} from "@/lib/country-packs/registry";
import { countryAlternates } from "@/lib/country-packs/routing";
import { getAppOrigin } from "@/lib/env";
import {
  getSalaryCellProgressResult,
  searchSalaryAggregatesResult,
} from "@/lib/salaries/repository";
import { canIndexSalaryDetail } from "@/lib/seo/indexability";
import { buildSocialImageMetadata } from "@/lib/seo/open-graph";
import { buildBreadcrumbStructuredData } from "@/lib/seo/structured-data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string; role: string }>;
}): Promise<Metadata> {
  const { country, role } = await params;
  const countryPack = getCountryPack(country);
  if (!countryPack || !isCountryPackPublic(countryPack)) {
    return {
      title: "Salary page unavailable",
      robots: { index: false, follow: true },
    };
  }
  const result = await searchSalaryAggregatesResult({
    country,
    role: role.replace(/-/g, " "),
  });
  const roleName = role.replace(/-/g, " ");
  const title = `${roleName} salary in ${country.toUpperCase()}`;
  const description = `Privacy-thresholded ${roleName} salary aggregates for ${country.toUpperCase()} on SalaryPadi.`;
  const socialImage = buildSocialImageMetadata(
    `/salaries/${country.toLowerCase()}/${role.toLowerCase()}/opengraph-image`,
    `${title} on SalaryPadi`,
  );
  return {
    title,
    description,
    alternates: {
      canonical: `/salaries/${country.toLowerCase()}/${role.toLowerCase()}`,
      languages: countryAlternates(
        getAppOrigin(),
        `/salaries/${country.toLowerCase()}/${role.toLowerCase()}`,
      ).languages,
    },
    robots: {
      index: canIndexSalaryDetail(result),
      follow: true,
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: socialImage.openGraphImages,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: socialImage.twitterImages,
    },
  };
}

export default async function SalaryRolePage({
  params,
}: {
  params: Promise<{ country: string; role: string }>;
}) {
  const { country, role } = await params;
  const countryPack = getCountryPack(country);
  if (!countryPack || !isCountryPackPublic(countryPack)) notFound();
  if (!/^[a-z]{2}$/i.test(country) || !/^[a-z0-9-]{2,100}$/i.test(role))
    notFound();
  const roleName = role.replace(/-/g, " ");
  const [result, progressResult] = await Promise.all([
    searchSalaryAggregatesResult({ country, role: roleName }),
    getSalaryCellProgressResult({ country, role }),
  ]);
  const results = result.data;
  const canonicalUrl = new URL(
    `/salaries/${country.toLowerCase()}/${role.toLowerCase()}`,
    getAppOrigin(),
  ).toString();
  return (
    <div className="site-shell stack-lg">
      <JsonLd
        nonce={(await headers()).get("x-nonce")}
        data={buildBreadcrumbStructuredData([
          { name: "Home", url: getAppOrigin() },
          {
            name: "Salaries",
            url: new URL("/salaries", getAppOrigin()).toString(),
          },
          {
            name: `${roleName} salary in ${country.toUpperCase()}`,
            url: canonicalUrl,
          },
        ])}
      />
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Salaries", href: "/salaries" },
          { label: roleName },
        ]}
      />
      <PageHeading
        eyebrow="Salary aggregate"
        title={`${roleName} pay in ${country.toUpperCase()}`}
        description="Only approved, sufficiently similar contributions are represented. Values are estimates, not individual records."
      />
      <RepositoryNotice result={result} resource="Salary aggregates" />
      {results.length > 0 ? (
        <div className="aggregate-grid">
          {results.map((aggregate) => (
            <SalaryAggregateCard aggregate={aggregate} key={aggregate.id} />
          ))}
        </div>
      ) : result.state === "ready" ? (
        <section
          className="empty-state stack"
          aria-labelledby="salary-progress"
        >
          <h2 className="section-title" id="salary-progress">
            No safe aggregate is published yet
          </h2>
          {progressResult.state === "ready" && progressResult.data ? (
            <SalaryProgress progress={progressResult.data} />
          ) : null}
          <RepositoryNotice
            result={progressResult}
            resource="Salary publication progress"
          />
          <SalaryContributionCta
            role={roleName}
            country={country}
            description="Add your own salary evidence. Exact sub-threshold counts and individual values remain private."
          />
        </section>
      ) : null}
    </div>
  );
}
