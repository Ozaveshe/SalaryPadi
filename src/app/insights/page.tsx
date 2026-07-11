import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { getPublishedEditorial } from "@/lib/editorial/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Job data briefs",
  description: "Timestamped, deterministic SalaryPadi job-data briefs.",
  alternates: { canonical: "/insights" },
};

export default async function InsightsPage() {
  const briefs = (await getPublishedEditorial()).filter(
    (article) => article.article_kind === "data_brief",
  );
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Evidence, not volume"
        title="Job data briefs"
        description="Each brief is generated from a timestamped active-job snapshot. It is not a market forecast and does not claim completeness."
      />
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
      ) : (
        <div className="empty-state">
          <h2>No verified brief is published yet</h2>
          <p>
            The automation will not fill this space with unsupported numbers.
          </p>
        </div>
      )}
    </div>
  );
}
