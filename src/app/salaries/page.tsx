import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";

import { JobCard } from "@/components/jobs/job-card";
import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { SalaryAggregateCard } from "@/components/salaries/salary-aggregate-card";
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
  // Both lanes load unconditionally: a role search must never make the
  // international benchmark lane disappear.
  const [benchmarkReferences, roleFamilies] = await Promise.all([
    getRemoteBenchmarkReferences(),
    getRoleFamiliesResult().then((familyResult) => familyResult.data),
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

  // Lane 3 for a role search: only the benchmarks that match the searched
  // role, capped. The full catalogue is never dumped.
  const MATCHED_BENCHMARK_LIMIT = 4;

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

  // Only benchmarks whose role family matches the search, capped. With no
  // search this stays empty and the lane shows its reference-count state
  // rather than dumping the catalogue.
  const allBenchmarks = benchmarkReferences.flatMap(
    (entry) => entry.result.data,
  );
  const matchedBenchmarks = roleQuery
    ? allBenchmarks
        .filter((aggregate) =>
          `${aggregate.roleFamily} ${aggregate.sourceRoleLabel ?? ""}`
            .toLowerCase()
            .includes(roleQuery),
        )
        .slice(0, MATCHED_BENCHMARK_LIMIT)
    : [];

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

      {/* Lane 1 — Local salary evidence. Always present, so the information
          architecture does not change shape between searches. */}
      <section
        className="stack salary-lane"
        aria-labelledby="salary-lane-local"
      >
        <h2 className="section-title" id="salary-lane-local">
          Local salary evidence
        </h2>
        <p className="text-muted m-0 max-w-2xl text-sm">
          What people doing this work in {countryPack?.name ?? "this market"}{" "}
          report earning. Published only when at least three similar approved
          contributions from different people form a cohort; individual figures
          are never shown.
        </p>
        {results.length > 0 ? (
          <div className="aggregate-grid">
            {results.map((aggregate) => (
              <SalaryAggregateCard aggregate={aggregate} key={aggregate.id} />
            ))}
          </div>
        ) : (
          <div className="surface surface-pad stack-sm">
            <p className="m-0">
              {!countryAvailable
                ? `${countryPack?.name ?? "This country"} is not live yet.`
                : hasSearch
                  ? "Not enough contributions yet for this search."
                  : "Salary information is still limited."}
            </p>
            {progressResult?.state === "ready" && progressResult.data ? (
              <SalaryProgress progress={progressResult.data} />
            ) : null}
            <Link
              className="button button-secondary w-fit"
              href={`/contribute/salary${role ? `?role=${encodeURIComponent(role)}` : ""}`}
            >
              Share your salary anonymously
            </Link>
          </div>
        )}
      </section>

      {/* Lane 2 — Jobs with disclosed pay. */}
      <section
        className="stack salary-lane"
        aria-labelledby="salary-lane-disclosed"
      >
        <h2 className="section-title" id="salary-lane-disclosed">
          Jobs with disclosed pay
        </h2>
        <p className="text-muted m-0 max-w-2xl text-sm">
          Current vacancies whose source states a salary — what employers are
          offering right now. Kept separate from community evidence and never
          merged into an aggregate.
        </p>
        {disclosedPayJobs.length > 0 ? (
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
        ) : (
          <div className="surface surface-pad stack-sm">
            <p className="m-0">
              {hasSearch
                ? "No live vacancy states a salary for this search right now."
                : "Search a role to see live vacancies that state their pay."}
            </p>
            <Link className="text-link" href="/jobs?salaryDisclosed=true">
              Browse all jobs with disclosed pay
            </Link>
          </div>
        )}
      </section>

      {/* Lane 3 — International remote benchmarks. Present for a search too:
          the relevant role benchmark, the closest role family, or an honest
          no-match. Never the full catalogue. */}
      <section
        className="stack salary-lane"
        aria-labelledby="salary-lane-benchmarks"
      >
        <h2 className="section-title" id="salary-lane-benchmarks">
          International remote benchmarks
        </h2>
        <p className="text-muted m-0 max-w-2xl text-sm">
          Official{" "}
          {benchmarkSummary.labels.length > 0
            ? benchmarkSummary.labels.join(" and ")
            : "international"}{" "}
          statistics for roles commonly hired remotely, to judge a remote offer
          in its own currency. They are not {countryPack?.name ?? "local"} pay
          evidence and are never mixed into local cohorts.
        </p>
        {matchedBenchmarks.length > 0 ? (
          <div className="aggregate-grid">
            {matchedBenchmarks.map((aggregate) => (
              <SalaryAggregateCard aggregate={aggregate} key={aggregate.id} />
            ))}
          </div>
        ) : searchedFamily ? (
          <div className="surface surface-pad stack-sm">
            <p className="m-0">
              No international benchmark matches “{role}” directly. The closest
              role family is {searchedFamily.name}.
            </p>
            <Link
              className="button button-secondary w-fit"
              href={`/salaries/ng/${searchedFamily.slug}`}
            >
              Open the {searchedFamily.name} salary page
            </Link>
          </div>
        ) : (
          <div className="surface surface-pad stack-sm">
            <p className="m-0">
              {hasSearch
                ? `No international benchmark matches “${role}”.`
                : `${benchmarkSummary.total} reference points are available. Search a role, or open a role page, to see the benchmark that applies to it.`}
            </p>
          </div>
        )}
      </section>

      {roleFamilies && roleFamilies.length > 0 ? (
        <section className="stack" aria-labelledby="salary-role-directory">
          <h2 className="section-title" id="salary-role-directory">
            Salary pages by role — Nigeria
          </h2>
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
