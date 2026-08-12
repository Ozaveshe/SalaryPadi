import type { EditorialArticle } from "./repository";

const ROUTE_LABELS: Record<string, string> = {
  "/companies": "Research companies",
  "/jobs": "Browse verified jobs",
  "/jobs/graduate": "Browse graduate jobs",
  "/jobs/nigeria": "Browse jobs in Nigeria",
  "/jobs/remote": "Browse remote jobs",
  "/methodology": "Read our methodology",
  "/salaries": "Explore salary evidence",
  "/tools/job-scam-checker": "Check a job for scam warning signs",
  "/tools/offer-compare": "Compare two offers",
  "/tools/salary-converter": "Convert a salary",
  "/tools/take-home-pay": "Estimate take-home pay",
  "/trust-and-safety": "Read our trust and safety policy",
  "/guides/remote-jobs-open-to-nigerians": "See remote jobs open to Nigerians",
};

export function editorialPath(article: EditorialArticle) {
  return article.article_kind === "cornerstone"
    ? `/guides/${article.slug}`
    : `/insights/${article.slug}`;
}

export function editorialRouteLabel(path: string) {
  return (
    ROUTE_LABELS[path] ??
    path.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ??
    path
  );
}
