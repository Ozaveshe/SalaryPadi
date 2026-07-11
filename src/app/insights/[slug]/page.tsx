import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { PageHeading } from "@/components/page-heading";
import { getPublishedArticle } from "@/lib/editorial/repository";
import { getAppOrigin } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticle(slug);
  if (!article || article.article_kind !== "data_brief") return {};
  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: `/insights/${article.slug}` },
  };
}

export default async function InsightPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [article, requestHeaders] = await Promise.all([
    getPublishedArticle(slug),
    headers(),
  ]);
  if (!article || article.article_kind !== "data_brief") notFound();
  const url = `${getAppOrigin()}/insights/${article.slug}`;
  return (
    <article className="site-shell stack-lg">
      <JsonLd
        nonce={requestHeaders.get("x-nonce")}
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
