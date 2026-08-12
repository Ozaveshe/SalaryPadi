import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

import { JsonLd } from "@/components/json-ld";
import { EditorialCover } from "@/components/media/brand-art";
import { RepositoryNotice } from "@/components/repository-notice";
import { getPublishedEditorialResult } from "@/lib/editorial/repository";
import { getAppOrigin } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { buildBreadcrumbStructuredData } from "@/lib/seo/structured-data";

import styles from "./blog.module.css";

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
  const ordered = [...result.data].sort(
    (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at),
  );
  const featured = ordered[0] ?? null;
  const remainingBriefs = featured
    ? briefs.filter(({ id }) => id !== featured.id)
    : briefs;
  const origin = getAppOrigin();
  const url = new URL("/blog", origin).toString();

  return (
    <div className={`site-shell ${styles.page}`}>
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
          blogPost: ordered.map((article) => ({
            "@type": "BlogPosting",
            headline: article.title,
            description: article.description,
            datePublished: article.published_at,
            dateModified: article.updated_at,
            url: new URL(articlePath(article), origin).toString(),
          })),
        }}
      />

      <header className={styles.masthead}>
        <div className={styles.issueLine}>
          <span>SalaryPadi Editorial</span>
          <Link className={styles.railLink} href="/feed.xml">
            Follow via RSS →
          </Link>
        </div>
        <h1 className={styles.title}>Work, pay and proof.</h1>
        <p className={styles.deck}>
          Practical career reporting for Nigerians and Africans. Every market
          number is dated; every job claim keeps its source and limitations.
        </p>
      </header>

      {result.state === "ready" ? null : (
        <div className={styles.notice}>
          <RepositoryNotice
            result={result}
            resource="Published blog articles"
          />
        </div>
      )}

      {featured ? (
        <section className={styles.featured} aria-labelledby="lead-story">
          <EditorialCover slug={featured.slug} />
          <div className={styles.featuredCopy}>
            <p className={styles.kicker}>
              {featured.article_kind === "data_brief"
                ? "Latest data brief"
                : "Editor’s guide"}
            </p>
            <h2 className={styles.featuredTitle} id="lead-story">
              <Link href={articlePath(featured)}>{featured.title}</Link>
            </h2>
            <p className={styles.summary}>{featured.description}</p>
            <div className={styles.storyMeta}>
              <span>Published {formatDate(featured.published_at)}</span>
              <span>Updated {formatDate(featured.updated_at)}</span>
            </div>
            <Link className={styles.railLink} href={articlePath(featured)}>
              Read the full story →
            </Link>
          </div>
        </section>
      ) : null}

      <StoryRail
        title="Practical guides"
        id="guides-heading"
        link={{ href: "/jobs", label: "Browse verified jobs →" }}
        articles={guides}
        empty={
          result.state === "ready"
            ? "No guide has passed editorial review yet."
            : undefined
        }
      />
      {remainingBriefs.length > 0 ? (
        <StoryRail
          title="The data desk"
          id="briefs-heading"
          link={{ href: "/insights", label: "Open market pulse →" }}
          articles={remainingBriefs}
        />
      ) : null}

      <section className={styles.rail} aria-labelledby="topics-heading">
        <div className={styles.railHeader}>
          <h2 className={styles.railTitle} id="topics-heading">
            Explore by question
          </h2>
        </div>
        <div className={styles.topicIndex}>
          <Topic href="/jobs/remote" title="Which remote jobs can I apply for?">
            See active roles with country-eligibility and source evidence kept
            visible.
          </Topic>
          <Topic href="/salaries" title="What does the pay evidence show?">
            Review privacy-safe salary evidence without turning estimates into
            facts.
          </Topic>
          <Topic
            href="/tools/job-scam-checker"
            title="Does this job look trustworthy?"
          >
            Check warning signs before sharing documents, money or personal
            information.
          </Topic>
          <Topic href="/methodology" title="How are claims verified?">
            Read the publication, freshness and unknown-state rules behind
            SalaryPadi.
          </Topic>
        </div>
      </section>
    </div>
  );
}

function StoryRail({
  title,
  id,
  link,
  articles,
  empty,
}: {
  title: string;
  id: string;
  link: { href: string; label: string };
  articles: Awaited<ReturnType<typeof getPublishedEditorialResult>>["data"];
  empty?: string;
}) {
  return (
    <section className={styles.rail} aria-labelledby={id}>
      <div className={styles.railHeader}>
        <h2 className={styles.railTitle} id={id}>
          {title}
        </h2>
        <Link className={styles.railLink} href={link.href}>
          {link.label}
        </Link>
      </div>
      {articles.length ? (
        <div className={styles.storyGrid}>
          {articles.map((article) => (
            <article className={styles.story} key={article.id}>
              <p className={styles.kicker}>
                {article.article_kind === "data_brief"
                  ? "Reproducible snapshot"
                  : "Practical guide"}
              </p>
              <h3 className={styles.storyTitle}>
                <Link href={articlePath(article)}>{article.title}</Link>
              </h3>
              <p className={styles.summary}>{article.description}</p>
              <p className={styles.storyMeta}>
                Published {formatDate(article.published_at)}
              </p>
            </article>
          ))}
        </div>
      ) : empty ? (
        <div className="empty-state">
          <h3>{empty}</h3>
          <p>Draft volume never substitutes for verified, useful guidance.</p>
        </div>
      ) : null}
    </section>
  );
}

function Topic({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.topic}>
      <Link href={href}>{title}</Link>
      <p>{children}</p>
    </div>
  );
}
