import type { Job } from "./types";

const DEFAULT_EXCERPT_LENGTH = 280;
const ATTRIBUTED_SOURCE_PLACEHOLDER =
  "Open the attributed source listing for full details.";
const METADATA_ONLY_PLACEHOLDER =
  "This listing is available as source metadata only. SalaryPadi does not store the provider's full job description; use the application link to review the original posting.";

const NON_REPUBLISHABLE_DESCRIPTIONS = new Set([
  ATTRIBUTED_SOURCE_PLACEHOLDER,
  METADATA_ONLY_PLACEHOLDER,
]);

export type PublicJobDescription = {
  kind: "stored" | "source_only";
  text: string;
};

/**
 * Normalises transport whitespace without destroying document structure.
 * Imported line breaks carry the headings, paragraphs and list items the
 * public renderer needs; collapsing `\s+` here previously erased them all.
 */
function normaliseDescriptionLayout(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function publicJobDescriptionView(job: Job): PublicJobDescription {
  const stored = normaliseDescriptionLayout(job.description);
  const sourceDisallowsFullCopy = job.source?.canStoreFullDescription === false;
  if (
    stored &&
    !sourceDisallowsFullCopy &&
    !NON_REPUBLISHABLE_DESCRIPTIONS.has(stored)
  ) {
    return { kind: "stored", text: stored };
  }

  return {
    kind: "source_only",
    text: `${job.source.name} lists this ${job.title} opportunity at ${job.company.name}. Its full role description is available on the original listing and is not republished by SalaryPadi.`,
  };
}

/**
 * Returns republishable role copy for every public job.
 *
 * Some reviewed feeds permit listing metadata but not storing their full job
 * descriptions. In that case we explain the limitation and direct candidates
 * to the original source instead of presenting an empty section or inventing
 * responsibilities.
 */
export function publicJobDescription(job: Job): string {
  return publicJobDescriptionView(job).text;
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
