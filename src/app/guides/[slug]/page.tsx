import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { EditorialMarkdown } from "@/components/editorial/editorial-markdown";
import { JsonLd } from "@/components/json-ld";
import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import {
  editorialRouteLabel,
  editorialPath,
} from "@/lib/editorial/presentation";
import {
  getPublishedArticleResult,
  type EditorialArticle,
} from "@/lib/editorial/repository";
import {
  getEditorialScheduleState,
  isEditorialReviewOverdue,
} from "@/lib/editorial/review";
import { getAppOrigin } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { buildEditorialGuideMetadata } from "@/lib/seo/editorial-metadata";
import { buildBreadcrumbStructuredData } from "@/lib/seo/structured-data";

import styles from "./guide.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildEditorialGuideMetadata(await getPublishedArticleResult(slug));
}

export default async function EditorialGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [result, requestHeaders] = await Promise.all([
    getPublishedArticleResult(slug),
    headers(),
  ]);
  const article = result.data;
  if (result.state === "ready" && article?.article_kind !== "cornerstone") {
    notFound();
  }
  if (!article || article.article_kind !== "cornerstone") {
    return (
      <div className="site-shell stack-lg">
        <PageHeading
          eyebrow="Guide unavailable"
          title="This guide could not be checked"
          description="SalaryPadi will not replace a failed editorial read with unsupported career advice."
        />
        <RepositoryNotice result={result} resource="Career guide" />
      </div>
    );
  }

  const origin = getAppOrigin();
  const path = editorialPath(article);
  const url = new URL(path, origin).toString();
  const sources = article.sources ?? [];
  const now = new Date();
  const reviewOverdue = isEditorialReviewOverdue(article, now);
  const { publicationPending, updatePending } = getEditorialScheduleState(
    article,
    now,
  );

  return (
    <article className={`reading-shell ${styles.article}`}>
      <JsonLd
        nonce={requestHeaders.get("x-nonce")}
        data={buildBreadcrumbStructuredData([
          { name: "Home", url: origin },
          { name: "Career guides", url: new URL("/blog", origin).toString() },
          { name: article.title, url },
        ])}
      />
      <JsonLd
        nonce={requestHeaders.get("x-nonce")}
        data={buildArticleSchema(article, url, origin)}
      />

      <header className={styles.header}>
        <Link className={styles.backLink} href="/blog">
          Career guides
        </Link>
        <h1>{article.title}</h1>
        <p className={styles.deck}>{article.description}</p>
        <dl className={styles.meta}>
          <div>
            <dt>Written by</dt>
            <dd>{article.author_name}</dd>
          </div>
          <div>
            <dt>{publicationPending ? "Publishes" : "Published"}</dt>
            <dd>
              <time dateTime={article.published_at}>
                {formatDate(article.published_at)}
              </time>
            </dd>
          </div>
          <div>
            <dt>{updatePending ? "Review scheduled" : "Last reviewed"}</dt>
            <dd>
              <time dateTime={article.updated_at}>
                {formatDate(article.updated_at)}
              </time>
            </dd>
          </div>
        </dl>
      </header>

      {result.state === "ready" ? null : (
        <RepositoryNotice result={result} resource="Editorial backend" />
      )}

      {reviewOverdue ? (
        <aside
          className="surface surface-pad stack"
          aria-label="Guide review status"
        >
          <p className="status status-warning">Review overdue</p>
          <p>
            This guide is still available for reference, but it has been removed
            from search discovery while SalaryPadi rechecks its cited evidence.
            Verify the dated sources below before acting on it.
          </p>
        </aside>
      ) : null}

      {publicationPending || updatePending ? (
        <aside
          className="surface surface-pad stack"
          aria-label="Guide schedule status"
        >
          <p className="status status-neutral">
            {publicationPending
              ? "Scheduled publication preview"
              : "Scheduled update preview"}
          </p>
          {publicationPending ? (
            <p>
              This guide is available by direct link before its publication
              date. It is excluded from search, the blog, RSS and sitemaps until
              that date arrives.
            </p>
          ) : (
            <p>
              This direct-link preview includes an editorial update scheduled
              for the date shown above. It remains excluded from search, the
              blog, RSS and sitemaps until that date arrives.
            </p>
          )}
        </aside>
      ) : null}

      <EditorialMarkdown markdown={article.body_markdown} />

      <section className={styles.sources} aria-labelledby="sources-heading">
        <h2 id="sources-heading">Sources and review policy</h2>
        <p>
          Sources were retrieved on the dates shown. SalaryPadi reviews this
          guide again by{" "}
          {article.review_due_at
            ? formatDate(article.review_due_at)
            : "the next material source change"}
          , or earlier when a cited rule changes.
        </p>
        <ol>
          {sources.map((source) => (
            <li key={`${source.name}-${source.url}`}>
              {source.url.startsWith("/") ? (
                <Link href={source.url}>{source.name}</Link>
              ) : (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  {source.name}
                </a>
              )}{" "}
              <span>Retrieved {formatDate(source.retrieved_at)}</span>
            </li>
          ))}
        </ol>
      </section>

      <nav className={styles.related} aria-label="Related SalaryPadi resources">
        <h2>Continue with your evidence</h2>
        <div>
          {article.internal_link_targets.map((target) => (
            <Link href={target} key={target}>
              {editorialRouteLabel(target)}
            </Link>
          ))}
        </div>
      </nav>
    </article>
  );
}

function buildArticleSchema(
  article: EditorialArticle,
  url: string,
  origin: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    url,
    mainEntityOfPage: url,
    image: `${url}/opengraph-image`,
    inLanguage: "en-NG",
    isAccessibleForFree: true,
    articleSection: "Career guides",
    datePublished: article.published_at,
    dateModified: article.updated_at,
    author: {
      "@type": "Organization",
      name: article.author_name,
      url: new URL("/about", origin).toString(),
    },
    publisher: {
      "@type": "Organization",
      name: "SalaryPadi",
      url: origin,
      logo: {
        "@type": "ImageObject",
        url: new URL("/brand/icon-512.png", origin).toString(),
      },
    },
    citation: article.sources?.map((source) =>
      new URL(source.url, origin).toString(),
    ),
  };
}
