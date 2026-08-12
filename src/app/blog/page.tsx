import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { getPublishedEditorialResult } from "@/lib/editorial/repository";
import { getAppOrigin } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { buildBreadcrumbStructuredData } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Career guides and Nigerian job market insights",
  description:
    "Evidence-led guides for finding jobs, checking eligibility, comparing pay and making safer career decisions in Nigeria and across Africa.",
  alternates: { canonical: "/blog" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "SalaryPadi career guides and job market insights",
    description:
      "Practical career guidance and reproducible job-market briefs, with sources, dates and limitations shown.",
    type: "website",
    url: "/blog",
  },
};

function articlePath(article: {
  article_kind: "cornerstone" | "data_brief";
  slug: string;
}) {
  return article.article_kind === "cornerstone"
    ? `/guides/${article.slug}`
    : `/insights/${article.slug}`;
}

export default async function BlogPage() {
  const [result, requestHeaders] = await Promise.all([
    getPublishedEditorialResult(),
    headers(),
  ]);
  const guides = result.data.filter(
    (article) => article.article_kind === "cornerstone",
  );
  const briefs = result.data.filter(
    (article) => article.article_kind === "data_brief",
  );
  const origin = getAppOrigin();
  const url = new URL("/blog", origin).toString();

  return (
    <div className="site-shell stack-lg">
      <JsonLd
        nonce={requestHeaders.get("x-nonce")}
        data={buildBreadcrumbStructuredData([
          { name: "Home", url: origin },
          { name: "Blog", url },
        ])}
      />
      <JsonLd
        nonce={requestHeaders.get("x-nonce")}
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "SalaryPadi career guides and job market insights",
          description: metadata.description,
          url,
          publisher: {
            "@type": "Organization",
            name: "SalaryPadi",
            url: origin,
          },
        }}
      />
      <PageHeading
        eyebrow="SalaryPadi blog"
        title="Clear career guidance, with the evidence shown"
        description="Use practical guides to evaluate jobs and offers, then check our data briefs for what currently verified SalaryPadi records can—and cannot—say about the market."
      />
      <div className="cluster">
        <Link className="button" href="/feed.xml">
          Follow the RSS feed
        </Link>
        <Link className="button button-secondary" href="/methodology">
          How SalaryPadi verifies claims
        </Link>
      </div>
      <RepositoryNotice result={result} resource="Published blog articles" />

      <section className="stack" aria-labelledby="guides-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Practical guides</p>
            <h2 className="section-title" id="guides-heading">
              Make the next decision with less guesswork
            </h2>
          </div>
        </div>
        {guides.length > 0 ? (
          <div className="card-grid">
            {guides.map((article) => (
              <article className="surface surface-pad stack" key={article.id}>
                <p className="eyebrow">Guide</p>
                <h3 className="section-title">
                  <Link href={articlePath(article)}>{article.title}</Link>
                </h3>
                <p>{article.description}</p>
                <p className="text-muted text-sm">
                  Updated {formatDate(article.updated_at)}
                </p>
              </article>
            ))}
          </div>
        ) : result.state === "ready" ? (
          <div className="empty-state">
            <h3>No guide has passed editorial review yet</h3>
            <p>Draft volume never substitutes for verified, useful guidance.</p>
          </div>
        ) : null}
      </section>

      <section className="stack" aria-labelledby="briefs-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Data briefs</p>
            <h2 className="section-title" id="briefs-heading">
              What verified jobs show right now
            </h2>
          </div>
          <Link className="text-link" href="/insights">
            Open the live job-market pulse
          </Link>
        </div>
        {briefs.length > 0 ? (
          <div className="card-grid">
            {briefs.map((article) => (
              <article className="surface surface-pad stack" key={article.id}>
                <p className="eyebrow">Reproducible data brief</p>
                <h3 className="section-title">
                  <Link href={articlePath(article)}>{article.title}</Link>
                </h3>
                <p>{article.description}</p>
                <p className="text-muted text-sm">
                  Published {formatDate(article.published_at)}
                </p>
              </article>
            ))}
          </div>
        ) : result.state === "ready" ? (
          <div className="empty-state">
            <h3>No current data brief is published</h3>
            <p>
              Stale or unsupported numbers stay out of the blog until their
              source snapshot and checks pass again.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
