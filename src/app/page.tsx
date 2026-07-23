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
import { getReferenceCurrencyRates } from "@/lib/currency/repository";
import { estimateNairaTakeHome } from "@/lib/jobs/naira-take-home";
import { getLiveJobFeed } from "@/lib/jobs/repository";
import { nigeriaValueTier } from "@/lib/jobs/search";

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
  const [feed, currencyRates] = await Promise.all([
    getLiveJobFeed(),
    getReferenceCurrencyRates(),
  ]);
  const explicitlyOpenJobs = feed.jobs.filter(
    (job) =>
      job.eligibility.nigeria === "eligible" ||
      job.eligibility.africa === "eligible",
  );
  const recentJobs = feed.jobs
    .toSorted(
      (a, b) =>
        nigeriaValueTier(b) - nigeriaValueTier(a) ||
        Date.parse(b.postedAt) - Date.parse(a.postedAt),
    )
    .filter(
      (job, index, sorted) =>
        sorted.findIndex((other) => other.company.slug === job.company.slug) ===
        index,
    )
    .slice(0, 4);
  const localNigeriaJobs = feed.jobs.filter(
    (job) => nigeriaValueTier(job) === 3,
  );
  const employerCounts = new Map<
    string,
    { slug: string; name: string; roles: number }
  >();
  for (const job of feed.jobs) {
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
    : `Checked ${checkedAt.toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
      })}, ${checkedAt.toLocaleTimeString("en-NG", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      })}`;
  const healthySources = feed.sources.filter(
    (source) => source.state === "live",
  );
  const feedIsConclusive = feed.state === "live";
  const jobCountLabel = feedIsConclusive
    ? String(feed.jobs.length)
    : feed.state === "degraded"
      ? `${feed.jobs.length} available (partial)`
      : "Unavailable";
  const eligibleCountLabel = feedIsConclusive
    ? String(explicitlyOpenJobs.length)
    : feed.state === "degraded"
      ? `${explicitlyOpenJobs.length} available (partial)`
      : "Unavailable";

  return (
    <div className="site-shell stack-lg">
      <section className="home-start" aria-labelledby="home-heading">
        <div className="home-hero-copy">
          <p className="home-kicker">
            <span className={`live-dot live-dot-${feed.state}`} />
            {feed.state === "live"
              ? "Source checks are current"
              : "Job availability is shown honestly"}
          </p>
          <p className="eyebrow">Career decisions built for Africans</p>
          <h1 className="page-title" id="home-heading">
            Fresh jobs Africans can actually apply for.
          </h1>
          <p className="lede">
            Find the role, check the pay and eligibility evidence, inspect the
            company, then use practical decision tools in one continuous path.
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
            <label htmlFor="home-eligibility">Open to</label>
            <select
              className="select"
              id="home-eligibility"
              name="eligibility"
              defaultValue="nigeria"
            >
              <option value="nigeria">Nigeria explicitly eligible</option>
              <option value="africa">Africa explicitly eligible</option>
              <option value="worldwide">Worldwide</option>
              <option value="unclear">Include unclear evidence</option>
              <option value="all">Any evidence</option>
            </select>
          </div>
          <button className="button" type="submit">
            Search jobs <ArrowRight aria-hidden="true" size={18} />
          </button>
          <p className="home-search-trust">
            <ShieldCheck aria-hidden="true" size={16} />
            Generic “remote” stays unclear. Every visible role must retain its
            source and last-check date.
          </p>
        </form>

        <JobFeedNotice feed={feed} />

        <aside className="home-proof" aria-label="Current SalaryPadi coverage">
          <div className="home-proof-heading">
            <div>
              <p className="eyebrow">What is available now</p>
              <h2>Current job coverage</h2>
            </div>
            <DatabaseZap aria-hidden="true" size={25} />
          </div>
          <dl className="home-proof-grid">
            <div>
              <dt>Current roles</dt>
              <dd
                className={
                  feedIsConclusive ? undefined : "home-proof-value-state"
                }
              >
                {jobCountLabel}
              </dd>
            </div>
            <div>
              <dt>Open to Nigeria/Africa</dt>
              <dd
                className={
                  feedIsConclusive ? undefined : "home-proof-value-state"
                }
              >
                {eligibleCountLabel}
              </dd>
            </div>
            <div>
              <dt>Local roles in Nigeria</dt>
              <dd
                className={
                  feedIsConclusive ? undefined : "home-proof-value-state"
                }
              >
                {feedIsConclusive
                  ? String(localNigeriaJobs.length)
                  : feed.state === "degraded"
                    ? `${localNigeriaJobs.length} available (partial)`
                    : "Unavailable"}
              </dd>
            </div>
          </dl>
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
          <Link href="/jobs?path=remote_nigeria">
            <strong>Remote jobs open to Nigerians</strong>
            <span>Requires explicit applicant-location evidence.</span>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link href="/jobs/nigeria">
            <strong>Local jobs in Nigeria</strong>
            <span>Onsite and hybrid roles physically based in Nigeria.</span>
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
              Current vacancies
            </h2>
          </div>
          <Link className="text-link" href="/jobs">
            Browse all jobs
          </Link>
        </div>
        {recentJobs.length > 0 ? (
          <div className="job-list">
            {recentJobs.map((job) => (
              <JobCard
                job={job}
                key={job.id}
                nairaEstimate={estimateNairaTakeHome(job.salary, currencyRates)}
              />
            ))}
          </div>
        ) : feedIsConclusive ? (
          <div className="notice notice-warning" role="status">
            <strong>
              No current vacancy has passed the publication checks.
            </strong>{" "}
            Source status and freshness remain visible while the feed is empty.
            Company research, salary evidence and decision tools are still
            available.
          </div>
        ) : (
          <div className="empty-state">
            <h3>Current vacancies could not be confirmed</h3>
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
