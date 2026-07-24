import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";

import { JobCard } from "@/components/jobs/job-card";
import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { SalaryAggregateCard } from "@/components/salaries/salary-aggregate-card";
import { SalaryContributionCta } from "@/components/salaries/salary-contribution-cta";
import { SalaryProgress } from "@/components/salaries/salary-progress";
import {
  COUNTRY_PACKS,
  getCountryPack,
  isCountryPackPublic,
} from "@/lib/country-packs/registry";
import { countryAlternates } from "@/lib/country-packs/routing";
import { repositoryReady } from "@/lib/data/repository-result";
import { getAppOrigin } from "@/lib/env";
import { getReferenceCurrencyRates } from "@/lib/currency/repository";
import { estimateNairaTakeHome } from "@/lib/jobs/naira-take-home";
import { getLiveJobFeed } from "@/lib/jobs/repository";
import { getBenchmarkReferences } from "@/lib/salaries/benchmark-references";
import {
  getSalaryCellProgressResult,
  searchSalaryAggregatesResult,
} from "@/lib/salaries/repository";
import { getRoleFamiliesResult } from "@/lib/salaries/role-directory";
import { sliceSearchParam } from "@/lib/search-params";
import { canIndexSalaryHub } from "@/lib/seo/indexability";

const getSalaryHubResult = cache(() =>
  searchSalaryAggregatesResult({ country: "NG" }),
);

const getRemoteBenchmarkReferences = cache(() => getBenchmarkReferences());

export async function generateMetadata(): Promise<Metadata> {
  const result = await getSalaryHubResult();
  return {
    title: "Salary intelligence",
    description:
      "Search privacy-thresholded, confidence-labelled salary evidence by role, company and country.",
    alternates: {
      canonical: "/salaries",
      languages: countryAlternates(getAppOrigin(), "/salaries").languages,
    },
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
  const countryPack = getCountryPack(country);
  const countryAvailable = Boolean(
    countryPack && isCountryPackPublic(countryPack),
  );
  const result = !countryAvailable
    ? repositoryReady<
        Awaited<ReturnType<typeof searchSalaryAggregatesResult>>["data"]
      >([])
    : hasSearch
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
  const [benchmarkReferences, roleFamilies] = await Promise.all([
    hasSearch ? Promise.resolve([]) : getRemoteBenchmarkReferences(),
    hasSearch
      ? Promise.resolve(null)
      : getRoleFamiliesResult().then((familyResult) => familyResult.data),
  ]);

  // Lane 3 is summarised, not dumped: rendering the whole US/UK catalogue as
  // the default continuation of this page buried the local lanes.
  const benchmarkSummary = {
    total: benchmarkReferences.reduce(
      (sum, entry) => sum + entry.result.data.length,
      0,
    ),
    labels: benchmarkReferences
      .filter((entry) => entry.result.data.length > 0)
      .map((entry) => entry.label),
  };

  // Lane 2 of a role search: live vacancies that state pay for this role.
  // Rendered only for a role query — real disclosed salaries, never modelled.
  const roleQuery = role.trim().toLowerCase();
  const [disclosedPayJobs, currencyRates, searchedFamily] =
    hasSearch && roleQuery
      ? await Promise.all([
          getLiveJobFeed().then((feed) =>
            feed.jobs
              .filter(
                (job) =>
                  job.salary !== null &&
                  (job.title.toLowerCase().includes(roleQuery) ||
                    (job.category ?? "").toLowerCase().includes(roleQuery)),
              )
              .slice(0, 6),
          ),
          getReferenceCurrencyRates(),
          getRoleFamiliesResult().then(
            (familyResult) =>
              familyResult.data?.find(
                (family) =>
                  family.name.toLowerCase().includes(roleQuery) ||
                  roleQuery.includes(family.name.toLowerCase()),
              ) ?? null,
          ),
        ])
      : [[], null, null];
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Salary intelligence"
        title="Compare pay with the evidence attached"
        description="Community contributions and verified online benchmarks stay in separate, clearly labelled lanes. Original currency, period, geography, source, date range and confidence remain visible."
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
            autoComplete="off"
            placeholder="e.g. product manager…"
            spellCheck={false}
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
            {COUNTRY_PACKS.map((pack) => {
              const available = isCountryPackPublic(pack);
              return (
                <option
                  disabled={!available}
                  key={pack.countryCode}
                  value={pack.countryCode}
                >
                  {pack.name}
                  {available ? "" : " (not live)"}
                </option>
              );
            })}
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
            Lane 1 — Local salary evidence
          </h2>
          <p className="text-muted m-0 max-w-2xl text-sm">
            Published only when at least three similar approved contributions
            from different people form a cohort. Individual figures are never
            shown.
          </p>
          <div className="aggregate-grid">
            {results.map((aggregate) => (
              <SalaryAggregateCard aggregate={aggregate} key={aggregate.id} />
            ))}
          </div>
        </section>
      ) : result.state === "ready" ? (
        <section className="empty-state">
          <h2 className="section-title">
            {!countryAvailable
              ? `${countryPack?.name ?? "This country"} is not live yet`
              : hasSearch
                ? "No safe aggregate matches yet"
                : "No safe aggregate is published yet"}
          </h2>
          <p>
            {!countryAvailable
              ? "This country pack remains private until authorized supply, reviewed rules, unique local content, moderation readiness, and first-party evidence pass the activation gates."
              : hasSearch
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
      {disclosedPayJobs.length > 0 ? (
        <section className="stack" aria-labelledby="disclosed-pay-lane">
          <h2 className="section-title" id="disclosed-pay-lane">
            Lane 2 — Jobs with disclosed pay for “{role}”
          </h2>
          <p className="text-muted m-0 max-w-2xl text-sm">
            Current vacancies whose source states a salary. This is what the
            market is offering right now — a separate lane from community
            evidence, never merged into an aggregate.
          </p>
          <div className="job-list">
            {disclosedPayJobs.map((job) => (
              <JobCard
                job={job}
                key={job.id}
                nairaEstimate={estimateNairaTakeHome(
                  job.salary,
                  currencyRates ?? [],
                )}
              />
            ))}
          </div>
        </section>
      ) : null}
      {searchedFamily ? (
        <section className="stack" aria-labelledby="role-family-lane">
          <h2 className="section-title" id="role-family-lane">
            Full role page: {searchedFamily.name}
          </h2>
          <p className="text-muted m-0 max-w-2xl text-sm">
            The dedicated role page collects the local aggregate (when the
            privacy threshold is met), live disclosed-pay vacancies and official
            international benchmark references in one place.
          </p>
          <Link
            className="button button-secondary w-fit"
            href={`/salaries/ng/${searchedFamily.slug}`}
          >
            Open the {searchedFamily.name} salary page
          </Link>
        </section>
      ) : null}
      {roleFamilies && roleFamilies.length > 0 ? (
        <section className="stack" aria-labelledby="salary-role-directory">
          <h2 className="section-title" id="salary-role-directory">
            Salary pages by role — Nigeria
          </h2>
          <p className="text-muted m-0 max-w-2xl text-sm">
            Each role page collects the local aggregate (when the privacy
            threshold is met), live vacancies with disclosed pay, and official
            remote benchmark references.
          </p>
          <div className="home-entry-grid">
            {roleFamilies.map((family) => (
              <Link href={`/salaries/ng/${family.slug}`} key={family.slug}>
                <strong>{family.name}</strong>
                <span>Salary evidence and live disclosed pay</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {benchmarkSummary.total > 0 ? (
        <section className="stack" aria-labelledby="international-lane">
          <h2 className="section-title" id="international-lane">
            Lane 3 — International remote benchmarks
          </h2>
          <p className="text-muted m-0 max-w-2xl text-sm">
            Official {benchmarkSummary.labels.join(" and ")} statistics for
            roles commonly hired remotely — {benchmarkSummary.total} reference
            points. They help you judge a remote offer in its own currency. They
            are not Nigerian pay evidence and are never mixed into local
            cohorts.
          </p>
          <p className="text-muted m-0 max-w-2xl text-sm">
            Search a role above, or open a role page, to see the benchmark that
            applies to it instead of the whole catalogue.
          </p>
        </section>
      ) : null}
      <details className="evidence-details">
        <summary>How SalaryPadi builds these numbers</summary>
        <div className="stack">
          <p className="text-muted m-0 text-sm">
            Local evidence is published only when at least three sufficiently
            similar approved contributions from distinct accounts form a cohort;
            individual submissions are never shown and sub-threshold counts are
            never exposed. Disclosed-pay jobs quote the employer&apos;s own
            stated figure in its original currency and period. International
            benchmarks retain their publisher, dataset reference period and
            normalisation assumptions.
          </p>
          <Link className="text-link" href="/methodology">
            Read the full methodology
          </Link>
        </div>
      </details>
    </div>
  );
}
