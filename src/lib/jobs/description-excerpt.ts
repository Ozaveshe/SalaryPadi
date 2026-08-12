import type { Job } from "./types";

const DEFAULT_EXCERPT_LENGTH = 280;
const ATTRIBUTED_SOURCE_PLACEHOLDER =
  "Open the attributed source listing for full details.";

/**
 * Returns republishable role copy for every public job.
 *
 * Some reviewed feeds permit listing metadata but not storing their full job
 * descriptions. In that case we explain the limitation and direct candidates
 * to the original source instead of presenting an empty section or inventing
 * responsibilities.
 */
export function publicJobDescription(job: Job): string {
  const stored = job.description.replace(/\s+/g, " ").trim();
  if (stored && stored !== ATTRIBUTED_SOURCE_PLACEHOLDER) return stored;

  return `${job.source.name} lists this ${job.title} opportunity at ${job.company.name}. The reviewed source does not provide description text that SalaryPadi can republish, so open the original listing for responsibilities, requirements and application instructions.`;
}

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
