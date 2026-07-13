import type { CompanyRating, CompanySummary } from "@/lib/companies/repository";

export interface BreadcrumbStructuredDataItem {
  name: string;
  url: string;
}

export function buildBreadcrumbStructuredData(
  items: BreadcrumbStructuredDataItem[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildCompanyAggregateRatingStructuredData(
  company: CompanySummary,
  canonicalUrl: string,
  rating: CompanyRating | null,
  minimumSampleSize: number | null,
): Record<string, unknown> | null {
  if (!canPublishCompanyRating(rating, minimumSampleSize)) return null;

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: company.name,
    url: canonicalUrl,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: rating.overall_rating,
      ratingCount: rating.sample_size,
      bestRating: 5,
      worstRating: 1,
    },
  };
}

export function canPublishCompanyRating(
  rating: CompanyRating | null,
  minimumSampleSize: number | null,
): rating is CompanyRating {
  if (
    !rating ||
    !Number.isInteger(minimumSampleSize) ||
    (minimumSampleSize ?? 0) < 3 ||
    rating.sample_size < (minimumSampleSize ?? Number.POSITIVE_INFINITY) ||
    !Number.isFinite(rating.overall_rating) ||
    rating.overall_rating < 1 ||
    rating.overall_rating > 5
  ) {
    return false;
  }
  return true;
}
