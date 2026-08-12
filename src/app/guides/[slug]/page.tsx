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
            <dt>Published</dt>
            <dd>
              <time dateTime={article.published_at}>
                {formatDate(article.published_at)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Last reviewed</dt>
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
                <a href={source.url} rel="noopener noreferrer">
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
    datePublished: article.published_at,
    dateModified: article.updated_at,
    author: { "@type": "Organization", name: article.author_name },
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
