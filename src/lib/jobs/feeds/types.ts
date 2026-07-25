import { z } from "zod";

import type { AtsSourceRecord } from "@/lib/jobs/ats/types";

import { isValidDestinationHost } from "./domain";

/**
 * Employer-authorized generic feeds (XML, JSON, CSV upload). Every feed is a
 * per-employer authorization record: the employer grants SalaryPadi the
 * right to republish its own vacancies via a feed it controls. Feeds are
 * registered in config/employer-feed-registry.json, disabled by default,
 * and nothing runs until the feed's rights fields are populated AND the
 * matching global source policy is runnable — both gates are enforced in
 * runtime.ts, not merely documented here.
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
    /**
     * XML: the expected document root element. Naming it lets extraction tell
     * "the employer served a valid but empty feed" apart from "the employer
     * served something else entirely" (an error page, a different document).
     */
    expectedRootElement: z
      .string()
      .regex(/^[A-Za-z][\w.-]*$/)
      .max(80)
      .optional(),
    /** JSON: dot-separated path to the record array (e.g. "data.jobs"). */
    recordsPath: z.string().min(1).max(200).optional(),
    /**
     * JSON: optional dot-separated path to the provider's own record count
     * (e.g. "meta.total"). When present it is compared against the number of
     * records actually seen, which is how a silently paginated or clipped feed
     * is caught.
     */
    providerReportedCountPath: z.string().min(1).max(200).optional(),
    fieldMap: feedFieldMapSchema,
    /**
     * Registrable hosts an application/source URL may point to — normally the
     * employer's own domains. Validated against the real Public Suffix List,
     * so a bare suffix ("com", "com.au", "co.jp") can never authorize a whole
     * suffix. Records pointing outside these hosts are dropped and counted.
     */
    allowedDestinationHosts: z
      .array(
        z
          .string()
          .min(3)
          .max(200)
          .refine((host) => isValidDestinationHost(host), {
            message:
              "Destination hosts must be registrable domains, not bare public suffixes or IP literals.",
          }),
      )
      .min(1)
      .max(10),
    /**
     * Whether a structurally valid feed containing zero records may be treated
     * as authoritative and therefore close previously seen jobs. Defaults to
     * false: without the employer explicitly confirming that an empty feed
     * means "no open roles", an empty result is treated as a partial snapshot.
     */
    allowAuthoritativeEmpty: z.boolean().default(false),
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
    if (config.kind !== "json" && config.providerReportedCountPath) {
      context.addIssue({
        code: "custom",
        path: ["providerReportedCountPath"],
        message: "Only JSON feeds can declare a provider-reported count path.",
      });
    }
    if (config.kind !== "xml" && config.expectedRootElement) {
      context.addIssue({
        code: "custom",
        path: ["expectedRootElement"],
        message: "Only XML feeds can declare an expected root element.",
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
    /**
     * An authoritative-empty feed is allowed to close an employer's entire
     * inventory in one run, so it must name the structure that proves the feed
     * was really served. Without that, "empty" is indistinguishable from
     * "wrong document".
     */
    if (
      config.allowAuthoritativeEmpty &&
      config.kind === "xml" &&
      !config.expectedRootElement
    ) {
      context.addIssue({
        code: "custom",
        path: ["allowAuthoritativeEmpty"],
        message:
          "An XML feed permitting authoritative empty snapshots must name its expected root element.",
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
    // An expiry that precedes the authorization it expires is incoherent.
    if (
      config.authorizationExpiresAt &&
      config.authorizedAt &&
      Date.parse(config.authorizationExpiresAt) <=
        Date.parse(config.authorizedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["authorizationExpiresAt"],
        message: "Authorization expiry must follow the authorization date.",
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

/**
 * Why records were excluded, or why a snapshot cannot be authoritative. These
 * are stable, bounded identifiers safe to persist and log.
 */
export type FeedExtractionReasonCode =
  | "record_limit_exceeded"
  | "required_field_missing"
  | "malformed_record_url"
  | "destination_not_authorized"
  | "container_missing"
  | "root_element_unexpected"
  | "parse_incomplete"
  | "provider_count_mismatch"
  | "empty_not_authoritative";

/**
 * The structured result of parsing a feed payload into flat records.
 *
 * Nothing is silently discarded. A record excluded from canonical
 * normalization still contributes to a count and a reason code, because those
 * counts are exactly what decides whether the resulting snapshot may be
 * treated as authoritative.
 */
export interface FeedExtractionResult {
  /** Records that mapped cleanly and stayed inside the authorization. */
  records: AtsSourceRecord[];
  /** Records present in the source payload (before any exclusion). */
  sourceRecordCount: number;
  /** Records that produced every required mapped field. */
  mappedRecordCount: number;
  /** Records dropped because a required field was missing or a URL invalid. */
  invalidRecordCount: number;
  /** Records dropped because a URL left the authorized destination hosts. */
  destinationDroppedCount: number;
  /** The source held more records than MAX_FEED_RECORDS. */
  truncated: boolean;
  /** The payload parsed to completion without a structural error. */
  parseComplete: boolean;
  /** The expected container/root was present. */
  containerFound: boolean;
  /** A zero-record result that is provably the source's real answer. */
  authoritativeEmpty: boolean;
  /** The provider's own reported total, when the feed declares one. */
  providerReportedCount: number | null;
  reasonCodes: FeedExtractionReasonCode[];
}

export class EmployerFeedError extends Error {
  constructor(
    public readonly code:
      "feed_payload_too_large" | "feed_malformed" | "feed_records_missing",
  ) {
    super(code);
    this.name = "EmployerFeedError";
  }
}

export const MAX_FEED_PAYLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_FEED_RECORDS = 5_000;
/**
 * Tolerance for clock skew between SalaryPadi and whoever recorded an
 * authorization timestamp. Small on purpose: it exists to absorb ordinary
 * drift, not to let a future-dated authorization run.
 */
export const AUTHORIZATION_CLOCK_SKEW_MS = 5 * 60_000;
