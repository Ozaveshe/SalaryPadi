import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeDollarSign,
  BriefcaseBusiness,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { JobCard } from "@/components/jobs/job-card";
import { getLiveJobFeed } from "@/lib/jobs/repository";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const toolLinks = [
  {
    href: "/tools/take-home-pay",
    label: "Nigeria take-home pay",
    description: "See tax and deductions with effective-dated rules.",
    icon: BadgeDollarSign,
  },
  {
    href: "/tools/offer-compare",
    label: "Compare two offers",
    description: "Normalize pay, benefits, work costs and trade-offs.",
    icon: BriefcaseBusiness,
  },
  {
    href: "/tools/job-scam-checker",
    label: "Check job warning signs",
    description: "Get explainable flags and safer next steps.",
    icon: ShieldCheck,
  },
] as const;

export default async function HomePage() {
  const feed = await getLiveJobFeed();
  const recentJobs = feed.jobs
    .toSorted((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))
    .slice(0, 4);

  return (
    <div className="site-shell stack-lg">
      <section className="home-start" aria-labelledby="home-heading">
        <div>
          <p className="eyebrow">Jobs and salary truth for Africans</p>
          <h1 className="page-title" id="home-heading">
            Start with a job you can actually apply for.
          </h1>
          <p className="lede">
            Check explicit Nigeria eligibility, real pay evidence and source
            freshness before you spend time on an application.
          </p>
        </div>
        <form className="home-search" action="/jobs" method="get" role="search">
          <div className="field">
            <label htmlFor="home-keyword">Role, skill or company</label>
            <input
              className="input"
              id="home-keyword"
              name="q"
              placeholder="e.g. data analyst"
            />
          </div>
          <div className="field">
            <label htmlFor="home-location">Location</label>
            <input
              className="input"
              id="home-location"
              name="location"
              placeholder="Nigeria, Africa or Worldwide"
            />
          </div>
          <button className="button" type="submit">
            Search jobs
          </button>
        </form>
        <div className="home-entry-grid">
          <Link href="/jobs/remote?eligibility=nigeria">
            <strong>Remote jobs open to Nigerians</strong>
            <span>Only explicit source evidence counts.</span>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link href="/jobs/nigeria">
            <strong>Local jobs in Nigeria</strong>
            <span>No fabricated listings while a local source is pending.</span>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link href="/salaries">
            <strong>Search salary evidence</strong>
            <span>Thresholded aggregates, never individual submissions.</span>
            <ArrowRight aria-hidden="true" size={18} />
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
              Current remote vacancies
            </h2>
          </div>
          <Link className="text-link" href="/jobs">
            Browse all jobs
          </Link>
        </div>
        {recentJobs.length > 0 ? (
          <div className="job-list">
            {recentJobs.map((job) => (
              <JobCard job={job} key={job.id} />
            ))}
          </div>
        ) : (
          <div className="notice notice-warning" role="status">
            The live source is unavailable right now. Search controls and tools
            remain available; no placeholder vacancies were substituted.
          </div>
        )}
      </section>
      <section className="contribution-cta">
        <Sparkles aria-hidden="true" size={28} />
        <div>
          <p className="eyebrow">Build better evidence</p>
          <h2 className="section-title">
            Your experience can help the next person decide.
          </h2>
          <p>
            Submit salary, workplace or interview information privately. It is
            moderated before any anonymous aggregate or redacted publication
            appears.
          </p>
        </div>
        <Link className="button" href="/contribute">
          Contribute safely
        </Link>
      </section>
    </div>
  );
}
