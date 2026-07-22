import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JobCard } from "@/components/jobs/job-card";
import { JobFeedNotice } from "@/components/jobs/job-feed-notice";
import { JsonLd } from "@/components/json-ld";
import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { getReferenceCurrencyRates } from "@/lib/currency/repository";
import { getAppOrigin } from "@/lib/env";
import { estimateNairaTakeHome } from "@/lib/jobs/naira-take-home";
import { getLiveJobFeed } from "@/lib/jobs/repository";
import { diversifyJobResults } from "@/lib/jobs/search";
import { getJobLandingMetricsResult } from "@/lib/seo/job-landing-repository";
import {
  evaluateJobLandingIndexability,
  getJobLandingDefinition,
  matchesJobLanding,
  type JobLandingDefinition,
  type JobLandingKey,
  type JobLandingMetrics,
} from "@/lib/seo/job-landing-pages";
import { canIndexJobDetail } from "@/lib/seo/job-posting";
import { buildSocialImageMetadata } from "@/lib/seo/open-graph";
import { buildBreadcrumbStructuredData } from "@/lib/seo/structured-data";
import { countryAlternates } from "@/lib/country-packs/routing";

function landingDecision(
  definition: JobLandingDefinition,
  metrics: JobLandingMetrics | null,
) {
  return metrics
    ? evaluateJobLandingIndexability(definition, metrics)
    : {
        indexable: false,
        reasons: ["landing_metrics_unavailable"],
        summary:
          "Indexing evidence is temporarily unavailable. This page remains visible to people and excluded from search indexes until current volume and diversity metrics can be verified.",
      };
}

export async function buildJobLandingMetadata(
  key: JobLandingKey,
): Promise<Metadata> {
  const definition = getJobLandingDefinition(key);
  if (!definition) return { title: "Job page unavailable", robots: "noindex" };
  const metrics = (await getJobLandingMetricsResult(key)).data;
  const decision = landingDecision(definition, metrics);
  const socialImage = buildSocialImageMetadata(
    "/jobs/opengraph-image.png",
    `${definition.title} on SalaryPadi`,
  );
  return {
    title: definition.title,
    description: definition.description,
    alternates: {
      canonical: definition.path,
      languages: countryAlternates(getAppOrigin(), definition.path).languages,
    },
    robots: { index: decision.indexable, follow: true },
    openGraph: {
      title: definition.title,
      description: definition.description,
      type: "website",
      url: definition.path,
      images: socialImage.openGraphImages,
    },
    twitter: {
      card: "summary_large_image",
      title: definition.title,
      description: definition.description,
      images: socialImage.twitterImages,
    },
  };
}

export async function JobLandingPage({
  landingKey,
}: {
  landingKey: JobLandingKey;
}) {
  const definition = getJobLandingDefinition(landingKey);
  if (!definition) return null;
  const [metricsResult, feed, currencyRates] = await Promise.all([
    getJobLandingMetricsResult(landingKey),
    getLiveJobFeed(),
    getReferenceCurrencyRates(),
  ]);
  const metrics = metricsResult.data;
  const decision = landingDecision(definition, metrics);
  const matching = feed.jobs.filter((job) =>
    matchesJobLanding(job, landingKey),
  );
  const policyIndexable = matching.filter((job) => canIndexJobDetail(job));
  const displayed = diversifyJobResults(
    decision.indexable ? policyIndexable : matching,
  ).slice(0, 20);
  const nonce = (await headers()).get("x-nonce");
  const canonicalUrl = new URL(definition.path, getAppOrigin()).toString();

  return (
    <div className="site-shell stack-lg">
      <JsonLd
        nonce={nonce}
        data={buildBreadcrumbStructuredData([
          { name: "Home", url: getAppOrigin() },
          { name: "Jobs", url: new URL("/jobs", getAppOrigin()).toString() },
          { name: definition.heading, url: canonicalUrl },
        ])}
      />
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Jobs", href: "/jobs" },
          { label: definition.heading },
        ]}
      />
      <PageHeading
        eyebrow="Live job landing page"
        title={definition.heading}
        description={definition.description}
      />
      <RepositoryNotice
        resource="Landing-page indexing metrics"
        result={metricsResult}
      />
      <JobFeedNotice feed={feed} />
      <section
        className="surface surface-pad stack"
        aria-labelledby="coverage-heading"
      >
        <div>
          <p className="eyebrow">Deterministic coverage check</p>
          <h2 className="section-title" id="coverage-heading">
            What this page can prove
          </h2>
        </div>
        <p className="text-muted m-0">{decision.summary}</p>
        <dl className="data-list">
          <div>
            <dt>Active unique jobs</dt>
            <dd>
              {metrics
                ? `${metrics.activeUniqueJobs} / 20 required`
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Unique jobs seen in 90 days</dt>
            <dd>
              {metrics
                ? `${metrics.uniqueJobsSeen90Days} / 30 required`
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Companies</dt>
            <dd>
              {metrics ? `${metrics.companyCount} / 3 required` : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Search status</dt>
            <dd>{decision.indexable ? "Indexable" : "Noindex, follow"}</dd>
          </div>
        </dl>
        {!decision.indexable ? (
          <p className="notice m-0" role="status">
            This useful route remains out of search indexes until every volume,
            diversity, summary, link and demand gate passes. Visible
            supplemental jobs do not count toward the index gate unless their
            source permits indexing.
          </p>
        ) : null}
      </section>
      <section className="stack" aria-labelledby="landing-jobs-heading">
        <div className="results-heading">
          <div>
            <h2 className="section-title" id="landing-jobs-heading">
              Current matching jobs
            </h2>
            <p className="results-count">
              {displayed.length} currently visible; closed and missing records
              disappear on the next live query.
            </p>
          </div>
          <Link className="button button-secondary" href="/jobs">
            Search all jobs
          </Link>
        </div>
        {displayed.length > 0 ? (
          <div className="job-list">
            {displayed.map((job) => (
              <JobCard
                job={job}
                key={job.id}
                nairaEstimate={estimateNairaTakeHome(job.salary, currencyRates)}
              />
            ))}
          </div>
        ) : feed.state !== "unavailable" && feed.state !== "disabled" ? (
          <div className="empty-state">
            <h3 className="m-0 text-xl font-bold">
              No matching jobs right now
            </h3>
            <p className="text-muted mt-2 mb-0 max-w-2xl">
              SalaryPadi does not invent listings or broaden vague eligibility
              to fill this page. Check the full directory or return after the
              next source refresh.
            </p>
          </div>
        ) : null}
      </section>
      <nav className="surface surface-pad stack" aria-label="Related job paths">
        <h2 className="text-lg font-bold">Continue exploring</h2>
        <div className="cluster">
          {definition.relatedPaths.map((path) => (
            <Link className="text-link" href={path} key={path}>
              {path === "/methodology"
                ? "How evidence works"
                : path.replaceAll("/", " ").trim()}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
