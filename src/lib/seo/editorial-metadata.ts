import type { Metadata } from "next";

import type { RepositoryResult } from "@/lib/data/repository-result";
import type { EditorialArticle } from "@/lib/editorial/repository";
import {
  isEditorialPublished,
  isEditorialReviewOverdue,
} from "@/lib/editorial/review";

import { buildSocialImageMetadata } from "./open-graph";

function unavailableEditorialMetadata(title: string): Metadata {
  return {
    title,
    robots: { index: false, follow: true },
  };
}

export function buildEditorialBriefMetadata(
  result: RepositoryResult<EditorialArticle | null>,
): Metadata {
  const article = result.data;
  if (!article || article.article_kind !== "data_brief") {
    return result.state === "ready"
      ? {}
      : unavailableEditorialMetadata("Editorial brief unavailable");
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

export function buildEditorialGuideMetadata(
  result: RepositoryResult<EditorialArticle | null>,
): Metadata {
  const article = result.data;
  if (!article || article.article_kind !== "cornerstone") {
    return result.state === "ready"
      ? {}
      : unavailableEditorialMetadata("Career guide unavailable");
  }

  const path = `/guides/${article.slug}`;
  const socialImage = buildSocialImageMetadata(
    `${path}/opengraph-image`,
    `${article.title} on SalaryPadi`,
  );
  return {
    title: article.title,
    description: article.description,
    authors: [{ name: article.author_name }],
    creator: article.author_name,
    publisher: "SalaryPadi",
    alternates: { canonical: path },
    robots:
      !isEditorialPublished(article) || isEditorialReviewOverdue(article)
        ? { index: false, follow: true }
        : { index: true, follow: true },
    openGraph: {
      title: article.title,
      description: article.description,
      type: "article",
      url: path,
      publishedTime: article.published_at,
      modifiedTime: article.updated_at,
      authors: [article.author_name],
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
