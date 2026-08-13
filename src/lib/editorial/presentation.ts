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
  "/guides/how-to-write-cv-for-jobs-nigeria":
    "Write a focused CV for Nigerian jobs",
  "/guides/how-to-tailor-cv-to-job-description":
    "Tailor your CV to the vacancy",
  "/guides/how-to-write-cover-letter-nigeria": "Write a focused cover letter",
  "/guides/how-to-track-job-applications": "Track your job applications",
  "/guides/how-to-follow-up-after-job-application":
    "Follow up on an application",
  "/guides/how-to-answer-tell-me-about-yourself-interview":
    "Prepare your interview introduction",
  "/guides/star-method-interview-answers": "Build STAR interview examples",
  "/guides/questions-to-ask-at-end-of-job-interview":
    "Choose useful interview questions",
  "/guides/what-to-check-before-accepting-job-offer-nigeria":
    "Check a job offer before accepting",
  "/guides/how-to-change-careers-in-nigeria": "Plan a career change",
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
