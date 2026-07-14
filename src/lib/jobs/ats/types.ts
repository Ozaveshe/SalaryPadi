import type { z } from "zod";

export const ATS_PROVIDERS = ["greenhouse", "lever", "ashby"] as const;

export type AtsProvider = (typeof ATS_PROVIDERS)[number];
export type LeverRegion = "global" | "eu";

export interface GreenhouseEndpointTarget {
  provider: "greenhouse";
  tenant: string;
}

export interface LeverEndpointTarget {
  provider: "lever";
  tenant: string;
  region?: LeverRegion;
}

export interface AshbyEndpointTarget {
  provider: "ashby";
  tenant: string;
}

export type AtsEndpointTarget =
  GreenhouseEndpointTarget | LeverEndpointTarget | AshbyEndpointTarget;

export type AtsTargetFor<P extends AtsProvider> = Extract<
  AtsEndpointTarget,
  { provider: P }
>;

export interface AtsAllowedDestination {
  /** Exact hostname. Wildcards and subdomain matching are deliberately absent. */
  host: string;
  /** Optional path boundaries for this host. `/jobs` includes `/jobs/123`. */
  pathPrefixes?: readonly string[];
}

export interface AtsAuthorizationEvidence {
  kind: "employer";
  authorizedBy: string;
  reviewedAt: string;
  expiresAt: string | null;
  evidenceReference: string;
  /** Additional exact HTTPS destinations approved by the employer. */
  allowedDestinations: readonly AtsAllowedDestination[];
}

interface AtsSourceIdentity {
  key: string;
  employerName: string;
}

/**
 * Omitting `state` is deliberately equivalent to disabled. A source cannot be
 * fetched unless the caller constructs the authorized variant with evidence.
 */
export type AtsDisabledSource = AtsSourceIdentity &
  AtsEndpointTarget & {
    state?: "disabled";
    authorization?: never;
  };

export type AtsAuthorizedSource<P extends AtsProvider = AtsProvider> =
  AtsSourceIdentity &
    AtsTargetFor<P> & {
      state: "authorized";
      authorization: AtsAuthorizationEvidence;
    };

export type AtsSourceConfig =
  | AtsDisabledSource
  | AtsAuthorizedSource<"greenhouse">
  | AtsAuthorizedSource<"lever">
  | AtsAuthorizedSource<"ashby">;

/** A validated provider record before SalaryPadi's final Job normalization. */
export interface AtsSourceRecord {
  provider: AtsProvider;
  sourceKey: string;
  employerName: string;
  externalId: string;
  title: string;
  location: string | null;
  workplaceType: string | null;
  employmentType: string | null;
  department: string | null;
  team: string | null;
  descriptionHtml: string | null;
  descriptionText: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  sourceUrl: string;
  applicationUrl: string;
  checkedAt: string;
}

export type AtsFetch = typeof globalThis.fetch;

export interface AtsFetchOptions {
  /** A caller-owned deadline/cancellation signal is mandatory. */
  signal: AbortSignal;
  fetch?: AtsFetch;
  requestedAt?: Date;
  /** May lower, but never raise, the adapter's hard response limit. */
  maxResponseBytes?: number;
}

export interface AtsFetchResult {
  records: AtsSourceRecord[];
  invalidRecords: AtsInvalidRecordSummary[];
  snapshot: AtsCompleteSnapshot;
  checkedAt: string;
  endpoint: string;
}

export interface AtsInvalidRecordSummary {
  /** Zero-based position in the provider response; no provider data is echoed. */
  index: number;
  stage: "validation" | "normalization";
  /** Schema paths only. Values and provider error bodies are never returned. */
  issuePaths: string[];
}

export interface AtsCompleteSnapshot {
  status: "complete";
  providerRecordCount: number;
  providerReportedTotal: number | null;
  acceptedRecordCount: number;
  filteredRecordCount: number;
  invalidRecordCount: number;
  /** True only when the provider returned a successful zero-record snapshot. */
  isEmpty: boolean;
}

/**
 * Provider implementations share this contract. The generic payload prevents
 * normalization from receiving unchecked JSON.
 */
export interface AtsProviderAdapter<P extends AtsProvider, TPayload, TRecord> {
  readonly provider: P;
  readonly payloadSchema: z.ZodType<TPayload>;
  readonly recordSchema: z.ZodType<TRecord>;
  buildEndpoint(target: AtsTargetFor<P>): URL;
  records(payload: TPayload): readonly unknown[];
  providerReportedTotal(payload: TPayload): number | null;
  normalizeRecord(
    record: TRecord,
    source: AtsAuthorizedSource<P>,
    checkedAt: string,
  ): AtsSourceRecord | null;
}
