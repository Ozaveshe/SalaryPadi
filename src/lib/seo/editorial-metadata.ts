import type { Metadata } from "next";

import type { RepositoryResult } from "@/lib/data/repository-result";
import type { EditorialArticle } from "@/lib/editorial/repository";

import { buildSocialImageMetadata } from "./open-graph";

export function buildEditorialBriefMetadata(
  result: RepositoryResult<EditorialArticle | null>,
): Metadata {
  const article = result.data;
  if (!article || article.article_kind !== "data_brief") {
    return result.state === "ready"
      ? {}
      : {
          title: "Editorial brief unavailable",
          robots: { index: false, follow: true },
        };
  }

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
