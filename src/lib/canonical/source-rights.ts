/**
 * Source rights classification.
 *
 * Rights decide whether a record may be published at all, so they are the
 * first gate in the pipeline and the one that must never be widened to raise
 * a job count. Each classification below states what it permits; anything not
 * stated is not permitted.
 *
 * The classification is snapshotted onto every source receipt at capture time
 * (`ingest.job_source_occurrences.rights_classification`) because the rights
 * on `app.job_sources` are mutable: when a source's rights change, receipts
 * captured under the old regime must still be attributable to it.
 */

export const SOURCE_RIGHTS_CLASSIFICATIONS = [
  "direct_employer_authorized",
  "public_ats_permitted",
  "licensed_partner",
  "user_submitted",
  "factual_link_only",
  "metadata_only",
  "review_required",
  "prohibited",
  "disabled",
] as const;

export type SourceRightsClassification =
  (typeof SOURCE_RIGHTS_CLASSIFICATIONS)[number];

export interface RightsCapability {
  /** May any record from this source appear on a public surface? */
  publish: boolean;
  /** May the provider's description text be stored and displayed? */
  storeDescription: boolean;
  /** May job pages from this source be indexed by search engines? */
  index: boolean;
  /** May JobPosting structured data be emitted? */
  structuredData: boolean;
  /** Why this classification exists, in one line. */
  note: string;
}

const CAPABILITIES: Record<SourceRightsClassification, RightsCapability> = {
  direct_employer_authorized: {
    publish: true,
    storeDescription: true,
    index: true,
    structuredData: true,
    note: "The employer authorised SalaryPadi to carry these roles.",
  },
  public_ats_permitted: {
    publish: true,
    storeDescription: true,
    index: true,
    structuredData: true,
    note: "The employer's own public ATS board; the employer publishes it to be seen.",
  },
  licensed_partner: {
    publish: true,
    storeDescription: true,
    index: true,
    structuredData: true,
    note: "A commercial data contract grants display rights; the contract's own limits still apply.",
  },
  user_submitted: {
    publish: true,
    storeDescription: true,
    index: true,
    structuredData: true,
    note: "Submitted by an employer under SalaryPadi terms, after moderation.",
  },
  factual_link_only: {
    publish: true,
    storeDescription: false,
    index: false,
    structuredData: false,
    note: "Only the fact of the role and a link may be shown; the source's text may not be republished.",
  },
  metadata_only: {
    publish: true,
    storeDescription: false,
    index: false,
    structuredData: false,
    note: "Bounded metadata with attribution; no description storage, no indexing.",
  },
  review_required: {
    publish: false,
    storeDescription: false,
    index: false,
    structuredData: false,
    note: "Terms are unresolved or conflicting. Nothing publishes until a review records the outcome.",
  },
  prohibited: {
    publish: false,
    storeDescription: false,
    index: false,
    structuredData: false,
    note: "The source's terms forbid this use. Technical accessibility is not permission.",
  },
  disabled: {
    publish: false,
    storeDescription: false,
    index: false,
    structuredData: false,
    note: "Operationally switched off. Re-enabling requires a fresh rights review, not a job-count argument.",
  },
};

export function rightsCapability(
  classification: SourceRightsClassification,
): RightsCapability {
  return CAPABILITIES[classification];
}

/**
 * Fail closed. An unrecognised or absent classification never publishes:
 * the absence of a recorded right is not the presence of one.
 */
export function mayPublishUnderRights(
  classification: string | null | undefined,
): boolean {
  if (!classification) return false;
  if (!isSourceRightsClassification(classification)) return false;
  return CAPABILITIES[classification].publish;
}

export function isSourceRightsClassification(
  value: string,
): value is SourceRightsClassification {
  return (SOURCE_RIGHTS_CLASSIFICATIONS as readonly string[]).includes(value);
}
