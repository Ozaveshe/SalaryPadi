import type { Metadata } from "next";
import Link from "next/link";

import { JobMarketPulse } from "@/components/insights/job-market-pulse";
import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { getPublishedEditorialResult } from "@/lib/editorial/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Job market insights",
  description:
    "See what SalaryPadi's currently verified jobs show about hiring, remote access, salary disclosure and deadlines.",
  alternates: { canonical: "/insights" },
};

export default async function InsightsPage() {
  const result = await getPublishedEditorialResult();
  const briefs = result.data.filter(
    (article) => article.article_kind === "data_brief",
  );
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="What the jobs show"
        title="Job market insights"
        description="See what SalaryPadi's currently verified jobs show about hiring, remote access, salary disclosure and deadlines. These are counts of roles we can check — not a forecast, and not the whole market."
      />
      <JobMarketPulse />
      <RepositoryNotice result={result} resource="Editorial briefs" />
      {briefs.length > 0 ? (
        <div className="card-grid">
          {briefs.map((article) => (
            <article className="surface surface-pad stack" key={article.id}>
              <h2 className="section-title">
                <Link href={`/insights/${article.slug}`}>{article.title}</Link>
              </h2>
              <p>{article.description}</p>
              <p className="text-muted text-sm">
                Published{" "}
                {new Date(article.published_at).toLocaleDateString("en-NG")}
              </p>
            </article>
          ))}
        </div>
      ) : result.state === "ready" ? (
        <div className="empty-state">
          <h2>No verified brief is published yet</h2>
          <p>
            The automation will not fill this space with unsupported numbers.
          </p>
        </div>
      ) : null}
    </div>
  );
}
