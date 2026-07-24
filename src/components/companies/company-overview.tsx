import Link from "next/link";

import type { CompanySummary } from "@/lib/companies/repository";
import { publicLocation } from "@/lib/presentation/public-field";

/**
 * The decision-first company overview: what a candidate needs to judge an
 * employer, in priority order. Identity and logo live in the heading; this
 * covers description, headquarters, where the company is hiring, and a
 * summary of each evidence lane with a link to its tab.
 *
 * Every field is omitted when absent — no null-state labels, no rows that
 * exist only to report missing information.
 */

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
    // Keep short, clean location labels only; long enumerations and prose
    // are source noise, not a useful "where they hire" signal.
    const cleaned = location.split(/[.<]/, 1)[0]?.trim() ?? "";
    if (cleaned && cleaned.length <= 40) seen.add(cleaned);
  }
  return [...seen].slice(0, 8);
}

/** One evidence lane summary: count, plain-language state, link to its tab. */
function LaneSummary({
  label,
  count,
  href,
  emptyAction,
  detail,
}: {
  label: string;
  count: number;
  href: string;
  emptyAction: { label: string; href: string };
  detail?: string;
}) {
  return (
    <article className="surface surface-pad stack-sm">
      <p className="eyebrow">{label}</p>
      {count > 0 ? (
        <>
          <p className="m-0 text-2xl font-bold">
            {count.toLocaleString("en-NG")}
          </p>
          {detail ? <p className="text-muted m-0 text-sm">{detail}</p> : null}
          <Link className="text-link" href={href}>
            View {label.toLowerCase()}
          </Link>
        </>
      ) : (
        <>
          <p className="text-muted m-0 text-sm">
            Nothing published yet. SalaryPadi does not estimate this.
          </p>
          <Link className="text-link" href={emptyAction.href}>
            {emptyAction.label}
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
        aria-labelledby="company-evidence"
      >
        <h2 className="section-title" id="company-evidence">
          What people report about working here
        </h2>
        <div className="feature-grid">
          <LaneSummary
            label="Open jobs"
            count={counts.jobs}
            href={`/companies/${slug}/jobs`}
            emptyAction={{ label: "Browse all jobs", href: "/jobs" }}
          />
          <LaneSummary
            label="Salaries"
            count={counts.salaries}
            href={`/companies/${slug}/salaries`}
            emptyAction={{
              label: "Share your salary anonymously",
              href: `/contribute/salary?company=${slug}`,
            }}
          />
          <LaneSummary
            label="Reviews"
            count={counts.reviews}
            href={`/companies/${slug}/reviews`}
            detail={
              counts.rating
                ? `${counts.rating.value.toFixed(1)} / 5 from ${counts.rating.sample} approved reviews`
                : undefined
            }
            emptyAction={{
              label: "Share a workplace experience",
              href: `/contribute/review?company=${slug}`,
            }}
          />
          <LaneSummary
            label="Benefits"
            count={counts.benefits}
            href={`/companies/${slug}/benefits`}
            emptyAction={{
              label: "Add benefits evidence",
              href: `/contribute/benefits?company=${slug}`,
            }}
          />
          <LaneSummary
            label="Interviews"
            count={counts.interviews}
            href={`/companies/${slug}/interviews`}
            emptyAction={{
              label: "Share an interview experience",
              href: `/contribute/interview?company=${slug}`,
            }}
          />
        </div>
      </section>
    </>
  );
}
