const DEFAULT_EXCERPT_LENGTH = 280;

/** Builds a compact excerpt from the real stored description. */
export function jobDescriptionExcerpt(
  description: string,
  maximumLength = DEFAULT_EXCERPT_LENGTH,
): string {
  const text = description.replace(/\s+/g, " ").trim();
  if (text.length <= maximumLength) return text;
  const candidate = text.slice(0, Math.max(1, maximumLength - 1));
  const boundary = candidate.lastIndexOf(" ");
  const cutAt =
    boundary >= Math.floor(maximumLength * 0.7) ? boundary : candidate.length;
  return `${candidate.slice(0, cutAt).trimEnd()}…`;
}
