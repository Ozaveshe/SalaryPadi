import { z } from "zod";

import { isValidDestinationHost } from "./domain";

/**
 * Employer-authorized generic feeds (XML, JSON, CSV upload). Every feed is a
 * per-employer authorization record: the employer grants SalaryPadi the
 * right to republish its own vacancies via a feed it controls. Feeds are
 * registered in config/employer-feed-registry.json, disabled by default,
 * and nothing runs until the feed's rights fields are populated and the
 * matching source policy is enabled — the same three-gate posture as every
 * other source.
 */

const httpsUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => value.startsWith("https://"), {
    message: "Feed URLs must use https",
  });

/**
 * Which extracted column/element/path supplies each canonical record field.
 * For XML feeds a field value is a child-element name; for JSON feeds a
 * dot-separated path within each record; for CSV imports a header name.
 */
export const feedFieldMapSchema = z
  .object({
    externalId: z.string().min(1).max(120),
    title: z.string().min(1).max(120),
    location: z.string().min(1).max(120).optional(),
    workplaceType: z.string().min(1).max(120).optional(),
    employmentType: z.string().min(1).max(120).optional(),
    description: z.string().min(1).max(120).optional(),
    publishedAt: z.string().min(1).max(120).optional(),
    sourceUrl: z.string().min(1).max(120),
    applicationUrl: z.string().min(1).max(120).optional(),
  })
  .strict();

export const employerFeedConfigSchema = z
  .object({
    /** Stable key; doubles as the import sourceKey. */
    feedKey: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .max(80),
    employerSlug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(120),
    employerName: z.string().min(2).max(200),
    kind: z.enum(["xml", "json", "csv"]),
    /** Fetched feeds only; CSV imports are uploaded, not fetched. */
    url: httpsUrlSchema.nullable(),
    /** XML: the repeated record element name (e.g. "job"). */
    recordElement: z
      .string()
      .regex(/^[A-Za-z][\w.-]*$/)
      .max(80)
      .optional(),
    /** JSON: dot-separated path to the record array (e.g. "data.jobs"). */
    recordsPath: z.string().min(1).max(200).optional(),
    /**
     * XML: the required container/root element. Confirming it is what makes
     * a zero-record XML document an authoritative zero rather than a parse
     * failure, so it is mandatory for XML feeds.
     */
    expectedRootElement: z
      .string()
      .regex(/^[A-Za-z][\w.-]*$/)
      .max(80)
      .optional(),
    /** XML: accept `prefix:name` element names. Rejected unless opted in. */
    allowNamespacePrefixes: z.boolean().default(false),
    /**
     * Whether a structurally valid empty snapshot may close previously
     * published jobs. Off by default: for most employer exports an empty
     * file is far more likely to be a broken export than a real "no open
     * roles" statement.
     */
    allowAuthoritativeEmpty: z.boolean().default(false),
    fieldMap: feedFieldMapSchema,
    /**
     * Registrable hosts an application/source URL may point to — normally the
     * employer's own domains. Bare public suffixes ("com", "co.uk") are
     * rejected so a feed can never authorize an entire TLD. Records pointing
     * outside these hosts are dropped.
     */
    allowedDestinationHosts: z
      .array(
        z
          .string()
          .min(3)
          .max(200)
          .refine((host) => isValidDestinationHost(host), {
            message:
              "Destination hosts must be registrable domains, not bare public suffixes.",
          }),
      )
      .min(1)
      .max(10),
    /** Written authorization evidence; a feed without it cannot enable. */
    rightsBasis: z.string().min(3).max(200).nullable(),
    rightsEvidenceRef: z.string().min(3).max(500).nullable(),
    authorizedAt: z.string().datetime({ offset: true }).nullable(),
    /** When the recorded authorization was last reviewed and is next due. */
    reviewedAt: z.string().datetime({ offset: true }).nullable().default(null),
    reviewDueAt: z.string().datetime({ offset: true }).nullable().default(null),
    /** Hard expiry of the authorization; past this the feed cannot run. */
    authorizationExpiresAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .default(null),
    enabled: z.boolean().default(false),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.kind === "xml" && !config.recordElement) {
      context.addIssue({
        code: "custom",
        path: ["recordElement"],
        message: "XML feeds must name their repeated record element.",
      });
    }
    if (config.kind === "xml" && !config.expectedRootElement) {
      context.addIssue({
        code: "custom",
        path: ["expectedRootElement"],
        message:
          "XML feeds must name their expected root/container element so an empty document can be told apart from a failed parse.",
      });
    }
    if (config.kind === "json" && !config.recordsPath) {
      context.addIssue({
        code: "custom",
        path: ["recordsPath"],
        message: "JSON feeds must name the path to their record array.",
      });
    }
    if (config.kind !== "csv" && !config.url) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "Fetched feeds require an https URL.",
      });
    }
    if (
      config.enabled &&
      (!config.rightsBasis ||
        !config.rightsEvidenceRef ||
        !config.authorizedAt ||
        !config.reviewedAt ||
        !config.reviewDueAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["enabled"],
        message:
          "An enabled feed requires a rights basis, evidence reference, authorization date and a review pair.",
      });
    }
    const reviewPairPresent =
      config.reviewedAt !== null && config.reviewDueAt !== null;
    if (
      (config.reviewedAt === null) !== (config.reviewDueAt === null) ||
      (reviewPairPresent && config.reviewedAt! >= config.reviewDueAt!)
    ) {
      context.addIssue({
        code: "custom",
        path: ["reviewDueAt"],
        message: "Review dates must form an increasing pair.",
      });
    }
  });

export type EmployerFeedConfig = z.infer<typeof employerFeedConfigSchema>;
export type FeedFieldMap = z.infer<typeof feedFieldMapSchema>;

export const employerFeedRegistrySchema = z
  .object({
    schemaVersion: z.literal(1),
    feeds: z.array(employerFeedConfigSchema).max(2_000),
  })
  .strict()
  .superRefine((registry, context) => {
    const seen = new Set<string>();
    registry.feeds.forEach((feed, index) => {
      if (seen.has(feed.feedKey)) {
        context.addIssue({
          code: "custom",
          path: ["feeds", index, "feedKey"],
          message: `Duplicate feedKey ${feed.feedKey}`,
        });
      }
      seen.add(feed.feedKey);
    });
  });

/** One flat record extracted from a feed before canonical normalization. */
export interface ExtractedFeedRecord {
  externalId: string;
  title: string;
  location: string | null;
  workplaceType: string | null;
  employmentType: string | null;
  description: string | null;
  publishedAt: string | null;
  sourceUrl: string;
  applicationUrl: string;
}

export class EmployerFeedError extends Error {
  constructor(
    public readonly code:
      | "feed_payload_too_large"
      | "feed_malformed"
      | "feed_records_missing"
      | "feed_record_limit_exceeded",
  ) {
    super(code);
    this.name = "EmployerFeedError";
  }
}

export const MAX_FEED_PAYLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_FEED_RECORDS = 5_000;
