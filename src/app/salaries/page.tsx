import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";

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
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Salary intelligence"
        title="Compare pay with the evidence attached"
        description="Community contributions and verified online benchmarks stay in separate, clearly labelled lanes. Original currency, period, geography, source, date range and confidence remain visible."
      />
      <section className="feature-grid" aria-label="Salary evidence methods">
        <article className="surface surface-pad stack-sm">
          <p className="eyebrow">Method 1</p>
          <h2 className="m-0 text-lg font-bold">Community salary evidence</h2>
          <p className="text-muted m-0 text-sm">
            People submit their own pay privately. Only moderated,
            privacy-thresholded cohorts become public; individual records never
            do.
          </p>
          <Link className="text-link" href="/contribute/salary">
            Add your salary
          </Link>
        </article>
        <article className="surface surface-pad stack-sm">
          <p className="eyebrow">Method 2</p>
          <h2 className="m-0 text-lg font-bold">Verified online benchmarks</h2>
          <p className="text-muted m-0 text-sm">
            Official or licensed datasets retain their publisher, methodology,
            source period and normalization assumptions. They are never
            relabelled as company submissions.
          </p>
          <Link className="text-link" href="/methodology">
            See the evidence rules
          </Link>
        </article>
      </section>
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
      {benchmarkReferences.map(({ code, label, result: reference }) =>
        reference.data.length > 0 ? (
          <section
            className="stack"
            aria-labelledby={`remote-benchmark-reference-${code}`}
            key={code}
          >
            <h2
              className="section-title"
              id={`remote-benchmark-reference-${code}`}
            >
              Remote benchmark reference — {label}
            </h2>
            <p className="text-muted m-0 max-w-2xl text-sm">
              Official {label} statistics for roles commonly hired remotely.
              These are reference points for evaluating remote offers in their
              original currency — they are not Nigerian pay evidence and are
              never mixed into local cohorts.
            </p>
            <div className="aggregate-grid">
              {reference.data.map((aggregate) => (
                <SalaryAggregateCard aggregate={aggregate} key={aggregate.id} />
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}
