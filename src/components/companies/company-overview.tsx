import Link from "next/link";

import { JobCard } from "@/components/jobs/job-card";
import type { CompanySummary } from "@/lib/companies/repository";
import { publicLocation } from "@/lib/presentation/public-field";

/**
 * The decision-first company overview. It answers, in order: what does this
 * company do, where is it based, where is it hiring, what jobs are open, and
 * what evidence exists about working there.
 *
 * It deliberately does NOT render full interview, benefits or community
 * content — each has a dedicated tab. The overview carries a concise jobs
 * preview and exactly one summary per evidence lane, so a candidate is never
 * shown the same content twice or the same empty state twice.
 */

const JOBS_PREVIEW_COUNT = 3;

export interface CompanyEvidenceCounts {
  jobs: number;
  salaries: number;
  reviews: number;
  benefits: number;
  interviews: number;
  rating: { value: number; sample: number } | null;
}

function hiringLocations(company: CompanySummary): string[] {
  const seen = new Set<string>();
  for (const job of company.activeJobs) {
    const location = publicLocation(job);
    if (!location) continue;
    // Short, clean labels only; appended prose is source noise, not a useful
    // "where they hire" signal.
    const cleaned = location.split(/[.<]/, 1)[0]?.trim() ?? "";
    if (cleaned && cleaned.length <= 40) seen.add(cleaned);
  }
  return [...seen].slice(0, 8);
}

interface LaneCopy {
  label: string;
  /** Shown when the lane has data. */
  href: string;
  /** One concise, action-oriented sentence plus its action. */
  emptyMessage: string;
  actionLabel: string;
  actionHref: string;
}

/** One evidence lane: a count and a link, or one honest action-oriented state. */
function LaneSummary({
  lane,
  count,
  detail,
}: {
  lane: LaneCopy;
  count: number;
  detail?: string;
}) {
  return (
    <article className="surface surface-pad stack-sm">
      <p className="eyebrow">{lane.label}</p>
      {count > 0 ? (
        <>
          <p className="m-0 text-2xl font-bold">
            {count.toLocaleString("en-NG")}
          </p>
          {detail ? <p className="text-muted m-0 text-sm">{detail}</p> : null}
          <Link className="text-link" href={lane.href}>
            View {lane.label.toLowerCase()}
          </Link>
        </>
      ) : (
        <>
          <p className="text-muted m-0 text-sm">{lane.emptyMessage}</p>
          <Link className="text-link" href={lane.actionHref}>
            {lane.actionLabel}
          </Link>
        </>
      )}
    </article>
  );
}

export function CompanyOverview({
  company,
  counts,
}: {
  company: CompanySummary;
  counts: CompanyEvidenceCounts;
}) {
  const locations = hiringLocations(company);
  const slug = company.slug;
  const previewJobs = company.activeJobs.slice(0, JOBS_PREVIEW_COUNT);

  const lanes: Array<{ lane: LaneCopy; count: number; detail?: string }> = [
    {
      lane: {
        label: "Salaries",
        href: `/companies/${slug}/salaries`,
        emptyMessage: "Salary information is still limited.",
        actionLabel: "Share your salary anonymously",
        actionHref: `/contribute/salary?company=${slug}`,
      },
      count: counts.salaries,
    },
    {
      lane: {
        label: "Reviews",
        href: `/companies/${slug}/reviews`,
        emptyMessage: "No review has been published.",
        actionLabel: "Share a workplace experience",
        actionHref: `/contribute/review?company=${slug}`,
      },
      count: counts.reviews,
      detail: counts.rating
        ? `${counts.rating.value.toFixed(1)} / 5 from ${counts.rating.sample} approved reviews`
        : undefined,
    },
    {
      lane: {
        label: "Benefits",
        href: `/companies/${slug}/benefits`,
        emptyMessage: "No benefits have been published.",
        actionLabel: "Add benefits evidence",
        actionHref: `/contribute/benefits?company=${slug}`,
      },
      count: counts.benefits,
    },
    {
      lane: {
        label: "Interviews",
        href: `/companies/${slug}/interviews`,
        emptyMessage: "No interview experience has been published.",
        actionLabel: "Share an interview experience",
        actionHref: `/contribute/interview?company=${slug}`,
      },
      count: counts.interviews,
    },
  ];

  return (
    <>
      {company.description ||
      company.headquartersCountry ||
      company.industry ||
      locations.length > 0 ? (
        <section className="rule-section stack" aria-labelledby="company-about">
          <h2 className="section-title" id="company-about">
            About {company.name}
          </h2>
          {company.description ? (
            <p className="description-copy">{company.description}</p>
          ) : null}
          <dl className="quick-facts">
            {company.headquartersCountry ? (
              <div>
                <dt>Headquarters</dt>
                <dd>{company.headquartersCountry}</dd>
              </div>
            ) : null}
            {company.industry ? (
              <div>
                <dt>Industry</dt>
                <dd>{company.industry}</dd>
              </div>
            ) : null}
            {locations.length > 0 ? (
              <div>
                <dt>Hiring now in</dt>
                <dd>{locations.join(" · ")}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section
        className="rule-section stack"
        aria-labelledby="company-open-jobs"
      >
        <div className="split">
          <h2 className="section-title" id="company-open-jobs">
            Open jobs
          </h2>
          {counts.jobs > 0 ? (
            <Link className="text-link" href={`/companies/${slug}/jobs`}>
              {counts.jobs === 1
                ? "View the open job"
                : `View all ${counts.jobs} open jobs`}
            </Link>
          ) : null}
        </div>
        {previewJobs.length > 0 ? (
          <div className="job-list">
            {previewJobs.map((job) => (
              <JobCard job={job} key={job.id} />
            ))}
          </div>
        ) : (
          <div className="surface surface-pad stack-sm">
            <p className="text-muted m-0 text-sm">
              No open roles from this employer right now.
            </p>
            <div className="cluster">
              <Link className="text-link" href="/jobs">
                Browse all open jobs
              </Link>
              <Link className="text-link" href="/alerts">
                Get alerted when they post
              </Link>
            </div>
          </div>
        )}
      </section>

      <section
        className="rule-section stack"
        aria-labelledby="company-evidence"
      >
        <div>
          <h2 className="section-title" id="company-evidence">
            Explore this company
          </h2>
          <p className="text-muted m-0 text-sm">
            Pay, workplace and interview evidence contributed by people who have
            worked or interviewed here.
          </p>
        </div>
        <div className="feature-grid">
          {lanes.map((entry) => (
            <LaneSummary
              key={entry.lane.label}
              lane={entry.lane}
              count={entry.count}
              detail={entry.detail}
            />
          ))}
        </div>
      </section>
    </>
  );
}
