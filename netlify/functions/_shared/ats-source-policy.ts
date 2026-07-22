import { z } from "zod";

import type {
  AtsAllowedDestination,
  AtsAuthorizedSource,
  AtsProvider,
} from "../../../src/lib/jobs/ats";
import { externalHttpsUrlSchema } from "../../../src/lib/security/url-schema";

import { OperationalError } from "./runtime";

const providerSchema = z.enum(["greenhouse", "lever", "ashby", "workable"]);
const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
const pathPrefixSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(/^\/(?!\/)[^?#\\]*$/);

const authorizedSourceRowSchema = z
  .object({
    source_id: z.string().uuid(),
    company_id: z.string().uuid(),
    adapter_key: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9][a-z0-9_-]*$/),
    source_name: z.string().trim().min(1).max(300),
    employer_name: z.string().trim().min(1).max(300),
    provider: providerSchema,
    provider_region: z.enum(["global", "eu"]).nullable(),
    tenant_identifier: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    allowed_destination_hosts: z.array(hostnameSchema).min(1).max(20),
    allowed_destination_path_prefixes: z.array(pathPrefixSchema).min(1).max(20),
    fetch_interval_seconds: z.number().int().min(900).max(86_400),
    daily_request_budget: z.number().int().min(1).max(96),
    minimum_request_spacing_seconds: z.number().int().min(60).max(86_400),
    publication_mode: z.enum(["review", "automatic"]),
    homepage_url: externalHttpsUrlSchema.nullable(),
    terms_url: externalHttpsUrlSchema,
    terms_version: z.string().trim().min(1).max(500),
    attribution_required: z.boolean(),
    attribution_text: z.string().trim().max(2_000).nullable(),
    may_store_full_description: z.boolean(),
    may_index_jobs: z.boolean(),
    may_emit_jobposting_schema: z.boolean(),
    may_email_jobs: z.boolean(),
    required_destination_kind: z.string().trim().min(1).max(120),
    authorization_basis: z.enum([
      "written_permission",
      "commercial_contract",
      "documented_public_api",
    ]),
    authorization_grantor: z.string().trim().min(3).max(300),
    authorization_evidence_ref: z.string().trim().min(3).max(500),
    authorization_reviewed_at: z.string().datetime({ offset: true }),
    authorization_expires_at: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    if (
      row.allowed_destination_hosts.length !==
      row.allowed_destination_path_prefixes.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["allowed_destination_path_prefixes"],
        message: "destination host and path arrays must have equal length",
      });
    }
    if (row.provider !== "lever" && row.provider_region !== null) {
      context.addIssue({
        code: "custom",
        path: ["provider_region"],
        message: "only Lever supports a provider region",
      });
    }
    if (row.minimum_request_spacing_seconds > row.fetch_interval_seconds) {
      context.addIssue({
        code: "custom",
        path: ["minimum_request_spacing_seconds"],
        message: "minimum spacing cannot exceed the refresh interval",
      });
    }
    if (row.may_emit_jobposting_schema && !row.may_index_jobs) {
      context.addIssue({
        code: "custom",
        path: ["may_emit_jobposting_schema"],
        message: "job posting schema requires indexing permission",
      });
    }
    if (row.attribution_required && !row.attribution_text) {
      context.addIssue({
        code: "custom",
        path: ["attribution_text"],
        message: "required attribution must include attribution text",
      });
    }
  });

export interface AuthorizedAtsRuntimePolicy {
  sourceId: string;
  companyId: string;
  sourceName: string;
  publicationMode: "review" | "automatic";
  mayStoreFullDescription: boolean;
  mayIndexJobs: boolean;
  mayEmitJobPostingSchema: boolean;
  mayEmailJobs: boolean;
  source: AtsAuthorizedSource;
}

export type ClaimedAuthorizedAtsRuntimePolicy =
  | { claimed: false; policy: null }
  | { claimed: true; policy: AuthorizedAtsRuntimePolicy };

function groupDestinations(
  hosts: string[],
  pathPrefixes: string[],
): AtsAllowedDestination[] {
  const grouped = new Map<string, string[]>();
  for (const [index, host] of hosts.entries()) {
    const prefixes = grouped.get(host) ?? [];
    prefixes.push(pathPrefixes[index]!);
    grouped.set(host, prefixes);
  }
  return [...grouped].map(([host, pathPrefixesForHost]) => ({
    host,
    pathPrefixes: [...new Set(pathPrefixesForHost)],
  }));
}

function runtimeSource(
  row: z.infer<typeof authorizedSourceRowSchema>,
): AtsAuthorizedSource {
  const base = {
    key: row.adapter_key,
    employerName: row.employer_name,
    tenant: row.tenant_identifier,
    state: "authorized" as const,
    authorization: {
      kind: "employer" as const,
      authorizedBy: row.authorization_grantor,
      reviewedAt: row.authorization_reviewed_at,
      expiresAt: row.authorization_expires_at,
      evidenceReference: row.authorization_evidence_ref,
      allowedDestinations: groupDestinations(
        row.allowed_destination_hosts,
        row.allowed_destination_path_prefixes,
      ),
    },
  };

  switch (row.provider) {
    case "greenhouse":
      return { ...base, provider: "greenhouse" };
    case "ashby":
      return { ...base, provider: "ashby" };
    case "lever":
      return {
        ...base,
        provider: "lever",
        region: row.provider_region ?? "global",
      };
    case "workable":
      return { ...base, provider: "workable" };
  }
}

export function parseAuthorizedAtsRuntimePolicies(
  value: unknown,
  now: Date = new Date(),
): AuthorizedAtsRuntimePolicy[] {
  const parsed = z.array(authorizedSourceRowSchema).max(50).safeParse(value);
  if (!parsed.success || !Number.isFinite(now.valueOf())) {
    throw new OperationalError("ats_source_policy_invalid");
  }

  const seenKeys = new Set<string>();
  return parsed.data.map((row) => {
    if (seenKeys.has(row.adapter_key)) {
      throw new OperationalError("ats_source_policy_duplicate");
    }
    seenKeys.add(row.adapter_key);

    const reviewedAt = new Date(row.authorization_reviewed_at).valueOf();
    const expiresAt = row.authorization_expires_at
      ? new Date(row.authorization_expires_at).valueOf()
      : null;
    if (
      reviewedAt > now.valueOf() + 5 * 60_000 ||
      (expiresAt !== null &&
        (expiresAt <= now.valueOf() || expiresAt <= reviewedAt))
    ) {
      throw new OperationalError("ats_source_authorization_invalid");
    }

    return {
      sourceId: row.source_id,
      companyId: row.company_id,
      sourceName: row.source_name,
      publicationMode: row.publication_mode,
      mayStoreFullDescription: row.may_store_full_description,
      mayIndexJobs: row.may_index_jobs,
      mayEmitJobPostingSchema: row.may_emit_jobposting_schema,
      mayEmailJobs: row.may_email_jobs,
      source: runtimeSource(row),
    };
  });
}

export function parseClaimedAuthorizedAtsRuntimePolicy(
  value: unknown,
  now: Date = new Date(),
): ClaimedAuthorizedAtsRuntimePolicy {
  const parsed = z
    .discriminatedUnion("claimed", [
      z.object({ claimed: z.literal(false) }).strict(),
      z.object({ claimed: z.literal(true), policy: z.unknown() }).strict(),
    ])
    .safeParse(value);
  if (!parsed.success) {
    throw new OperationalError("ats_source_claim_invalid");
  }
  if (!parsed.data.claimed) return { claimed: false, policy: null };

  const policies = parseAuthorizedAtsRuntimePolicies([parsed.data.policy], now);
  if (policies.length !== 1) {
    throw new OperationalError("ats_source_claim_invalid");
  }
  return { claimed: true, policy: policies[0]! };
}

export function isAtsProvider(value: string): value is AtsProvider {
  return providerSchema.safeParse(value).success;
}
