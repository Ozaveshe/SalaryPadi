import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { getPublishedArticleResult } from "@/lib/editorial/repository";
import { getAppOrigin } from "@/lib/env";
import { buildSocialImageMetadata } from "@/lib/seo/open-graph";
import { buildBreadcrumbStructuredData } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = (await getPublishedArticleResult(slug)).data;
  if (!article || article.article_kind !== "data_brief") return {};
  const socialImage = buildSocialImageMetadata(
    `/insights/${article.slug}/opengraph-image`,
    `${article.title} on SalaryPadi`,
  );
  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: `/insights/${article.slug}` },
    openGraph: {
      title: article.title,
      description: article.description,
      type: "article",
      publishedTime: article.published_at,
      modifiedTime: article.updated_at,
      images: socialImage.openGraphImages,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
      images: socialImage.twitterImages,
    },
  };
}

export default async function InsightPage({
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
  if (
    result.state === "ready" &&
    (!article || article.article_kind !== "data_brief")
  ) {
    notFound();
  }
  if (!article || article.article_kind !== "data_brief") {
    return (
      <div className="site-shell stack-lg">
        <PageHeading
          eyebrow="Editorial data unavailable"
          title="This brief could not be checked"
          description="SalaryPadi will not replace a failed editorial read with an unsupported article or a false not-found response."
        />
        <RepositoryNotice result={result} resource="Editorial brief" />
      </div>
    );
  }
  const url = `${getAppOrigin()}/insights/${article.slug}`;
  const nonce = requestHeaders.get("x-nonce");
  return (
    <article className="site-shell stack-lg">
      <JsonLd
        nonce={nonce}
        data={buildBreadcrumbStructuredData([
          { name: "Home", url: getAppOrigin() },
          {
            name: "Insights",
            url: new URL("/insights", getAppOrigin()).toString(),
          },
          { name: article.title, url },
        ])}
      />
      <JsonLd
        nonce={nonce}
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.title,
          description: article.description,
          url,
          mainEntityOfPage: url,
          datePublished: article.published_at,
          dateModified: article.updated_at,
          author: { "@type": "Organization", name: "SalaryPadi" },
          publisher: {
            "@type": "Organization",
            name: "SalaryPadi",
            url: getAppOrigin(),
          },
        }}
      />
      <PageHeading
        eyebrow="Deterministic job-data brief"
        title={article.title}
        description={article.description}
      />
      <div className="rule-section stack">
        {article.body_markdown.split(/\n\s*\n/).map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <nav className="cluster" aria-label="Related SalaryPadi resources">
        {article.internal_link_targets
          .filter((target) => target.startsWith("/"))
          .map((target) => (
            <Link className="text-link" href={target} key={target}>
              {target.replaceAll("-", " ").replaceAll("/", " ").trim()}
            </Link>
          ))}
      </nav>
    </article>
  );
}
