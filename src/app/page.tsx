import { SALARYPADI_TIME_ZONE } from "@/lib/time/zone";
import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeDollarSign,
  BriefcaseBusiness,
  Building2,
  Clock3,
  DatabaseZap,
  FilePlus2,
  Globe2,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { JobCard } from "@/components/jobs/job-card";
import { JobFeedNotice } from "@/components/jobs/job-feed-notice";
import { getLiveJobFeed } from "@/lib/jobs/repository";
import { filterAndSortJobs, parseJobSearch } from "@/lib/jobs/search";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const toolLinks = [
  {
    href: "/tools/take-home-pay",
    label: "Understand your Nigeria take-home pay",
    description: "See tax and deductions with effective-dated rules.",
    icon: BadgeDollarSign,
  },
  {
    href: "/tools/offer-compare",
    label: "Compare the practical value of two offers",
    description: "Keep benefits, work costs and assumptions visible.",
    icon: BriefcaseBusiness,
  },
  {
    href: "/tools/job-scam-checker",
    label: "Check a vacancy for warning signs",
    description: "Get explainable flags without uploading the vacancy.",
    icon: ShieldCheck,
  },
] as const;

export default async function HomePage() {
  const feed = await getLiveJobFeed();
  const remoteJobs = filterAndSortJobs(
    feed.jobs,
    parseJobSearch({ path: "remote_africa", sort: "newest" }),
  );
  const recentJobs = remoteJobs
    .filter(
      (job, index, sorted) =>
        sorted.findIndex((other) => other.company.slug === job.company.slug) ===
        index,
    )
    .slice(0, 4);
  const countrySpecificJobs = remoteJobs.filter(
    (job) =>
      job.eligibility.scope === "named_countries" ||
      job.eligibility.scope === "nigeria",
  );
  const employerCounts = new Map<
    string,
    { slug: string; name: string; roles: number }
  >();
  for (const job of remoteJobs) {
    if (job.source.type !== "employer") continue;
    const existing = employerCounts.get(job.company.slug);
    if (existing) existing.roles += 1;
    else
      employerCounts.set(job.company.slug, {
        slug: job.company.slug,
        name: job.company.name,
        roles: 1,
      });
  }
  const hiringEmployers = [...employerCounts.values()]
    .toSorted((a, b) => b.roles - a.roles)
    .slice(0, 6);
  const checkedAt = new Date(feed.checkedAt);
  const checkedLabel = Number.isNaN(checkedAt.valueOf())
    ? "Freshness unavailable"
    : // Both halves must use the same zone. The date was rendered in the
      // server's local zone while the time beside it was pinned to UTC, so
      // near midnight the freshness claim contradicted itself by a day.
      `Checked ${checkedAt.toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
        timeZone: SALARYPADI_TIME_ZONE,
      })}, ${checkedAt.toLocaleTimeString("en-NG", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: SALARYPADI_TIME_ZONE,
        timeZoneName: "short",
      })}`;
  const healthySources = feed.sources.filter(
    (source) => source.state === "live",
  );
  const feedIsConclusive = feed.state === "live";
  /*
   * Counts, and the one place the feed's condition is stated.
   *
   * Every value used to carry its own "(partial)" suffix, so a degraded read
   * printed the word six times on one screen and pushed each number onto three
   * wrapped lines. A condition belongs to the reading, not to each number in
   * it: the chip says it once and the figures stay figures.
   */
  const coverage =
    feed.state === "unavailable"
      ? null
      : {
          openToRegion: remoteJobs.length,
          checked: feed.jobs.length,
          countrySpecific: countrySpecificJobs.length,
        };

  return (
    <div className="site-shell stack-lg">
      <section className="home-start" aria-labelledby="home-heading">
        <div className="home-hero-copy">
          <p className="home-kicker">
            <span className={`live-dot live-dot-${feed.state}`} />
            {/*
             * State the fact, not a claim about ourselves. "Job availability is
             * shown honestly" asks to be believed; naming what is actually
             * happening to the sources lets a reader judge for themselves, and
             * matches the chip on the coverage card word for word.
             */}
            {feed.state === "live"
              ? "Every source checked and current"
              : feed.state === "degraded"
                ? "A source is still being checked"
                : "A source check did not complete"}
          </p>
          <p className="eyebrow">Career decisions built for Africans</p>
          <h1 className="page-title" id="home-heading">
            Find remote jobs open to applicants in Africa.
          </h1>
          <p className="lede">
            Find work-from-home opportunities with country eligibility shown.
            Check where you can apply from, research the employer, and track
            your next step.
          </p>
        </div>

        <form
          className="home-search home-search-dominant"
          action="/jobs"
          method="get"
          role="search"
          aria-label="Search jobs"
        >
          <div className="field home-search-keyword">
            <label htmlFor="home-keyword">Role, skill or company</label>
            <input
              className="input"
              id="home-keyword"
              name="q"
              autoComplete="off"
              placeholder="e.g. data analyst…"
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label htmlFor="home-eligibility">Browse opportunities</label>
            <select
              className="select"
              id="home-eligibility"
              name="path"
              defaultValue="remote_africa"
            >
              <option value="remote_africa">Remote jobs open in Africa</option>
              <option value="remote_nigeria">
                Remote jobs open in Nigeria
              </option>
              <option value="all">All jobs, including local and hybrid</option>
            </select>
          </div>
          <button className="button" type="submit">
            Search jobs <ArrowRight aria-hidden="true" size={18} />
          </button>
          <p className="home-search-trust">
            <ShieldCheck aria-hidden="true" size={16} />
            Africa eligibility may cover specific countries. Check each role’s
            locations and restrictions; “remote” alone does not confirm
            eligibility.
          </p>
        </form>

        <JobFeedNotice feed={feed} />

        <aside className="home-proof" aria-label="Current SalaryPadi coverage">
          <div className="home-proof-heading">
            <div>
              <p className="eyebrow">What is available now</p>
              <h2>Current remote opportunities</h2>
            </div>
            <DatabaseZap aria-hidden="true" size={25} />
          </div>
          {coverage ? (
            <>
              {!feedIsConclusive ? (
                <p className="home-proof-state">
                  <span className={`live-dot live-dot-${feed.state}`} />
                  Counts are partial while a source finishes checking
                </p>
              ) : null}
              <p className="home-proof-lead">
                <span className="home-proof-lead-value">
                  {coverage.openToRegion.toLocaleString("en-NG")}
                </span>
                <span className="home-proof-lead-label">
                  remote roles open in at least one African country
                </span>
              </p>
              <dl className="home-proof-facts">
                <div>
                  <dt>Jobs in the full catalogue</dt>
                  <dd>{coverage.checked.toLocaleString("en-NG")}</dd>
                </div>
                <div>
                  <dt>Remote roles naming specific countries</dt>
                  <dd>{coverage.countrySpecific.toLocaleString("en-NG")}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="home-proof-state">
              <span className={`live-dot live-dot-${feed.state}`} />
              Counts are unavailable because a source check did not complete
            </p>
          )}
          {hiringEmployers.length > 0 ? (
            <div
              className="home-hiring-strip"
              aria-label="Employers hiring now"
            >
              <span className="home-hiring-label">Hiring now</span>
              {hiringEmployers.map((employer) => (
                <Link
                  className="home-hiring-employer"
                  href={`/companies/${employer.slug}`}
                  key={employer.slug}
                >
                  {employer.name}
                  <span>
                    {employer.roles} role{employer.roles === 1 ? "" : "s"}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
          <div className="home-proof-meta">
            <span>
              <Clock3 aria-hidden="true" size={16} />
              {checkedLabel}
            </span>
            <span>
              <Globe2 aria-hidden="true" size={16} />
              {healthySources.length > 0
                ? `${healthySources.length} permitted source check${healthySources.length === 1 ? "" : "s"} healthy`
                : "No permitted source check is currently healthy"}
            </span>
          </div>
          <Link className="text-link" href="/methodology">
            See what SalaryPadi verifies{" "}
            <ArrowRight aria-hidden="true" size={15} />
          </Link>
        </aside>

        <div className="home-entry-grid home-job-paths">
          <Link href="/jobs?path=remote_africa">
            <strong>Remote jobs open in Africa</strong>
            <span>
              See country-specific, regional and worldwide opportunities.
            </span>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link href="/jobs">
            <strong>Explore all jobs</strong>
            <span>Browse local, hybrid and remote opportunities.</span>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </section>

      <section className="rule-section stack" aria-labelledby="explore-heading">
        <div className="split">
          <div>
            <p className="eyebrow">One decision path</p>
            <h2 className="section-title" id="explore-heading">
              Continue beyond the listing
            </h2>
          </div>
        </div>
        <div className="home-entry-grid">
          <Link href="/salaries">
            <strong>Search salary evidence</strong>
            <span>
              Original currency, period, sample and confidence stay visible.
            </span>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link href="/companies">
            <strong>Inspect company truth</strong>
            <span>Separate official facts, jobs and community evidence.</span>
            <Building2 aria-hidden="true" size={18} />
          </Link>
          <Link href="/tools">
            <strong>Use career decision tools</strong>
            <span>Take-home pay, currency and practical comparisons.</span>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link href="/contribute">
            <strong>Add evidence or post a job</strong>
            <span>Salary, review, interview and employer paths.</span>
            <FilePlus2 aria-hidden="true" size={18} />
          </Link>
          <Link href="/saved">
            <strong>Save jobs and track applications</strong>
            <span>
              Keep roles, applications, interviews and offers in one private
              place.
            </span>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link href="/for-employers">
            <strong>Hire with a verified profile</strong>
            <span>
              Post roles and claim your company. Payment never buys trust.
            </span>
            <Building2 aria-hidden="true" size={18} />
          </Link>
        </div>
      </section>

      <section className="rule-section stack" aria-labelledby="tools-heading">
        <div className="split">
          <div>
            <p className="eyebrow">Decision tools</p>
            <h2 className="section-title" id="tools-heading">
              Turn an offer into a practical answer
            </h2>
          </div>
          <Link className="text-link" href="/tools">
            See all tools
          </Link>
        </div>
        <div className="tool-link-grid">
          {toolLinks.map(({ href, label, description, icon: Icon }) => (
            <Link href={href} key={href}>
              <Icon aria-hidden="true" size={23} />
              <strong>{label}</strong>
              <span>{description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rule-section stack" aria-labelledby="recent-heading">
        <div className="split">
          <div>
            <p className="eyebrow">Recently source-checked</p>
            <h2 className="section-title" id="recent-heading">
              Remote opportunities
            </h2>
          </div>
          <Link className="text-link" href="/jobs?path=remote_africa">
            Browse remote jobs
          </Link>
        </div>
        {recentJobs.length > 0 ? (
          <div className="job-list">
            {recentJobs.map((job) => (
              <JobCard job={job} eligibilityAudience="africa" key={job.id} />
            ))}
          </div>
        ) : feedIsConclusive ? (
          <div className="notice notice-warning" role="status">
            <strong>
              No remote opportunity currently meets the Africa eligibility
              checks.
            </strong>{" "}
            Source status and freshness remain visible while the feed is empty.
            Company research, salary evidence and decision tools are still
            available.
          </div>
        ) : (
          <div className="empty-state">
            <h3>Remote opportunities could not be confirmed</h3>
            <p>See the source-status notice above for the active limitation.</p>
          </div>
        )}
      </section>

      <section className="contribution-cta">
        <FilePlus2 aria-hidden="true" size={28} />
        <div>
          <p className="eyebrow">Build better evidence</p>
          <h2 className="section-title">
            Add salary, workplace, interview or employer evidence.
          </h2>
          <p>
            Contributions are moderated before an anonymous aggregate or
            redacted publication appears. Employers can submit jobs and request
            a company claim or right of reply.
          </p>
        </div>
        <Link className="button" href="/contribute">
          See contribution paths
        </Link>
      </section>
    </div>
  );
}
