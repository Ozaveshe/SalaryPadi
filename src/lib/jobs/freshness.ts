const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

/**
 * A Next data-cache hit must retain the time of the source response instead of
 * being relabelled as freshly checked on every render. The upstream Date
 * header is part of the cached Response; Age is a conservative fallback.
 */
export function sourceResponseCheckedAt(
  headers: Pick<Headers, "get">,
  requestedAt: Date,
): string {
  const responseDate = headers.get("date");
  if (responseDate) {
    const parsed = Date.parse(responseDate);
    if (
      Number.isFinite(parsed) &&
      parsed > 0 &&
      parsed <= requestedAt.valueOf() + MAX_FUTURE_SKEW_MS
    ) {
      return new Date(parsed).toISOString();
    }
  }

  const ageSeconds = Number(headers.get("age"));
  if (Number.isFinite(ageSeconds) && ageSeconds >= 0) {
    return new Date(
      Math.max(0, requestedAt.valueOf() - ageSeconds * 1_000),
    ).toISOString();
  }

  return requestedAt.toISOString();
}
