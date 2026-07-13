import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";

import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { SalaryAggregateCard } from "@/components/salaries/salary-aggregate-card";
import { SalaryContributionCta } from "@/components/salaries/salary-contribution-cta";
import { SalaryProgress } from "@/components/salaries/salary-progress";
import {
  getSalaryCellProgressResult,
  searchSalaryAggregatesResult,
} from "@/lib/salaries/repository";
import { sliceSearchParam } from "@/lib/search-params";
import { canIndexSalaryHub } from "@/lib/seo/indexability";

const getSalaryHubResult = cache(() => searchSalaryAggregatesResult({}));

export async function generateMetadata(): Promise<Metadata> {
  const result = await getSalaryHubResult();
  return {
    title: "Salary intelligence",
    description:
      "Search privacy-thresholded, confidence-labelled salary evidence by role, company and country.",
    alternates: { canonical: "/salaries" },
    robots: { index: canIndexSalaryHub(result), follow: true },
  };
}

export default async function SalariesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const role = sliceSearchParam(input.role, 120);
  const country = sliceSearchParam(input.country, 2, "NG");
  const company = sliceSearchParam(input.company, 120);
  const hasSearch = Boolean(role || company);
  const result = hasSearch
    ? await searchSalaryAggregatesResult({ role, country, company })
    : await getSalaryHubResult();
  const results = result.data;
  const progressResult =
    result.state === "ready" &&
    results.length === 0 &&
    Boolean(role) &&
    !company
      ? await getSalaryCellProgressResult({ role, country })
      : null;
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Salary intelligence"
        title="Compare pay without exposing a person"
        description="Search approved aggregates. Original currency, pay period, location, sample size, date range and confidence stay visible."
      />
      <form
        className="home-search"
        action="/salaries"
        method="get"
        role="search"
      >
        <div className="field">
          <label htmlFor="salary-role">Role</label>
          <input
            className="input"
            id="salary-role"
            name="role"
            defaultValue={role}
            placeholder="e.g. product manager"
          />
        </div>
        <div className="field">
          <label htmlFor="salary-company">Company (optional)</label>
          <input
            className="input"
            id="salary-company"
            name="company"
            defaultValue={company}
          />
        </div>
        <div className="field">
          <label htmlFor="salary-country">Country</label>
          <select
            className="select"
            id="salary-country"
            name="country"
            defaultValue={country}
          >
            <option value="NG">Nigeria</option>
            <option value="GH">Ghana</option>
            <option value="KE">Kenya</option>
            <option value="ZA">South Africa</option>
          </select>
        </div>
        <button className="button" type="submit">
          Search salaries
        </button>
      </form>
      <RepositoryNotice result={result} resource="Salary aggregates" />
      {results.length > 0 ? (
        <section className="stack" aria-labelledby="salary-results">
          <h2 className="section-title" id="salary-results">
            Published aggregates
          </h2>
          <div className="aggregate-grid">
            {results.map((aggregate) => (
              <SalaryAggregateCard aggregate={aggregate} key={aggregate.id} />
            ))}
          </div>
        </section>
      ) : result.state === "ready" ? (
        <section className="empty-state">
          <h2 className="section-title">
            {hasSearch
              ? "No safe aggregate matches yet"
              : "No safe aggregate is published yet"}
          </h2>
          <p>
            {hasSearch
              ? "The data may be too sparse, still pending moderation, or absent. SalaryPadi does not invent a market number."
              : "Employer-role-country cells require at least three sufficiently similar approved contributions from distinct accounts. SalaryPadi does not invent a market number."}
          </p>
          {progressResult?.state === "ready" && progressResult.data ? (
            <SalaryProgress progress={progressResult.data} />
          ) : null}
          {company ? (
            <p className="text-muted m-0 text-sm">
              Company-level sub-threshold counts are never exposed because they
              could identify a contributor.
            </p>
          ) : null}
          <SalaryContributionCta
            company={company}
            role={role}
            country={country}
          />
          <div className="cluster">
            <Link className="button button-secondary" href="/methodology">
              Read the methodology
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
