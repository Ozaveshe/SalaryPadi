type ReviewableEditorialArticle = {
  published_at: string;
  updated_at: string;
  review_due_at?: string;
};

export function getEditorialScheduleState(
  article: ReviewableEditorialArticle,
  now = new Date(),
) {
  const currentTime = now.getTime();

  return {
    publicationPending: Date.parse(article.published_at) > currentTime,
    updatePending: Date.parse(article.updated_at) > currentTime,
  };
}

export function isEditorialPublished(
  article: ReviewableEditorialArticle,
  now = new Date(),
) {
  const { publicationPending, updatePending } = getEditorialScheduleState(
    article,
    now,
  );

  return !publicationPending && !updatePending;
}

export function isEditorialReviewOverdue(
  article: ReviewableEditorialArticle,
  now = new Date(),
) {
  return article.review_due_at
    ? Date.parse(article.review_due_at) <= now.getTime()
    : false;
}

export function isEditorialDiscoverable(
  article: ReviewableEditorialArticle,
  now = new Date(),
) {
  return (
    isEditorialPublished(article, now) &&
    !isEditorialReviewOverdue(article, now)
  );
}
