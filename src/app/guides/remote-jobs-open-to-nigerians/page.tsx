import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

import { JobCard } from "@/components/jobs/job-card";
import { JsonLd } from "@/components/json-ld";
import { PageHeading } from "@/components/page-heading";
import { REMOTE_JOBS_GUIDE } from "@/lib/editorial/repository";
import { getAppOrigin } from "@/lib/env";
import { getLiveJobFeed } from "@/lib/jobs/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Remote jobs open to Nigerians",
  description: REMOTE_JOBS_GUIDE.description,
  alternates: { canonical: "/guides/remote-jobs-open-to-nigerians" },
  robots: { index: true, follow: true },
};

export default async function RemoteJobsOpenToNigeriansGuide() {
  const [feed, requestHeaders] = await Promise.all([
    getLiveJobFeed(),
    headers(),
  ]);
  const checkedAt = Date.parse(feed.checkedAt);
  const jobs = feed.jobs
    .filter(
      (job) =>
        job.status === "open" &&
        job.workMode === "remote" &&
        job.eligibility.nigeria === "eligible" &&
        job.source.canIndex &&
        (!job.validThrough || Date.parse(job.validThrough) > checkedAt),
    )
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))
    .slice(0, 12);
  const url = `${getAppOrigin()}/guides/${REMOTE_JOBS_GUIDE.slug}`;

  return (
    <div className="site-shell stack-lg">
      <JsonLd
        nonce={requestHeaders.get("x-nonce")}
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: REMOTE_JOBS_GUIDE.title,
          description: REMOTE_JOBS_GUIDE.description,
          url,
          mainEntityOfPage: url,
          datePublished: REMOTE_JOBS_GUIDE.published_at,
          dateModified: REMOTE_JOBS_GUIDE.updated_at,
          author: { "@type": "Organization", name: "SalaryPadi" },
          publisher: {
            "@type": "Organization",
            name: "SalaryPadi",
            url: getAppOrigin(),
          },
        }}
      />
      <PageHeading
        eyebrow="Evergreen guide and live data"
        title="Remote jobs open to Nigerians"
        description="The guidance on this page stays evergreen. The job block is rebuilt from active records and shows a role only when its source permits indexing and its eligibility evidence explicitly supports Nigeria."
      />
      <section className="rule-section stack" aria-labelledby="what-counts">
        <h2 className="section-title" id="what-counts">
          What counts as open to Nigerians
        </h2>
        <p>
          “Remote” alone is not enough. SalaryPadi requires source-provided or
          manually verified evidence naming Nigeria, Africa, Worldwide, or an
          explicit country list that includes Nigeria. Broad or ambiguous
          regions stay unclear.
        </p>
        <p>
          Read the full <Link href="/methodology">eligibility methodology</Link>
          , compare evidence on the{" "}
          <Link href="/jobs/remote">remote jobs route</Link>, and use the{" "}
          <Link href="/tools/job-scam-checker">job scam checker</Link>
          before sharing personal information.
        </p>
      </section>
      <section className="stack" aria-labelledby="live-roles">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Dynamic live-job block</p>
            <h2 className="section-title" id="live-roles">
              Active roles with explicit Nigeria evidence
            </h2>
          </div>
          <p className="text-muted text-sm">
            Last checked{" "}
            {new Date(feed.checkedAt).toLocaleString("en-NG", {
              timeZone: "Africa/Lagos",
            })}{" "}
            WAT
          </p>
        </div>
        {jobs.length > 0 ? (
          <div className="job-list">
            {jobs.map((job) => (
              <JobCard job={job} key={job.id} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No indexable roles meet the evidence gate right now</h3>
            <p>
              This honest empty state will update from active records.
              SalaryPadi does not insert demo vacancies or relabel generic
              remote roles.
            </p>
          </div>
        )}
      </section>
      <section className="rule-section stack" aria-labelledby="next-steps">
        <h2 className="section-title" id="next-steps">
          Research the complete offer
        </h2>
        <p>
          Check the employer in <Link href="/companies">company profiles</Link>,
          review available <Link href="/salaries">salary evidence</Link>, and
          compare compensation with the{" "}
          <Link href="/tools/offer-compare">offer comparison tool</Link>.
          Unknown pay, eligibility, or company facts stay unknown until evidence
          is available.
        </p>
      </section>
    </div>
  );
}
