import { z } from "zod";

import registryJson from "../../../../config/job-source-policy-registry.json";
import { externalHttpsUrlSchema } from "@/lib/security/url-schema";

export const SOURCE_AUTHORITY = {
  secondary_feed: 100,
  licensed_partner: 200,
  employer_ats: 300,
  direct_employer: 400,
} as const;

export type SourceAuthority = keyof typeof SOURCE_AUTHORITY;

const timestamp = z.string().datetime({ offset: true });
const policySchema = z
  .object({
    adapterKey: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(2).max(160),
    authority: z.enum([
      "direct_employer",
      "employer_ats",
      "licensed_partner",
      "secondary_feed",
    ]),
    state: z.enum(["enabled", "disabled", "expired"]),
    permissionBasis: z.string().min(3).max(200),
    evidenceReference: z.string().min(3).max(500).nullable(),
    termsUrl: z.union([z.literal("/terms"), externalHttpsUrlSchema]).nullable(),
    reviewedAt: timestamp.nullable(),
    reviewDueAt: timestamp.nullable(),
    allowedFields: z
      .array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/))
      .max(80)
      .refine((values) => new Set(values).size === values.length),
    fullDescriptionPermission: z.boolean(),
    attribution: z.string().min(3).max(2_000).nullable(),
    minimumPollingSeconds: z.number().int().min(900).nullable(),
    maximumRequestsPerDay: z.number().int().positive().nullable(),
    rawRetentionDays: z.number().int().min(0).max(3_650),
    publicDisplayPermission: z.boolean(),
    searchIndexPermission: z.boolean(),
    googleJobPostingPermission: z.boolean(),
    requiredDependencies: z
      .array(z.string().regex(/^[a-z0-9_]+$/))
      .max(30)
      .refine((values) => new Set(values).size === values.length),
    missingDependencies: z
      .array(z.string().regex(/^[a-z0-9_]+$/))
      .max(30)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict()
  .superRefine((policy, context) => {
    const missing = new Set(policy.missingDependencies);
    for (const dependency of missing) {
      if (!policy.requiredDependencies.includes(dependency)) {
        context.addIssue({
          code: "custom",
          path: ["missingDependencies"],
          message: "missing dependencies must be declared as required",
        });
      }
    }
    if (policy.state === "enabled") {
      const complete =
        policy.evidenceReference &&
        policy.termsUrl &&
        policy.reviewedAt &&
        policy.reviewDueAt &&
        policy.allowedFields.length > 0 &&
        policy.attribution &&
        policy.missingDependencies.length === 0;
      if (!complete) {
        context.addIssue({
          code: "custom",
          path: ["state"],
          message: "enabled policies require complete current rights evidence",
        });
      }
    }
    if (policy.googleJobPostingPermission && !policy.searchIndexPermission) {
      context.addIssue({
        code: "custom",
        path: ["googleJobPostingPermission"],
        message:
          "Google JobPosting permission also requires indexing permission",
      });
    }
    if (policy.searchIndexPermission && !policy.publicDisplayPermission) {
      context.addIssue({
        code: "custom",
        path: ["searchIndexPermission"],
        message: "indexing permission also requires public display permission",
      });
    }
    if (
      policy.fullDescriptionPermission &&
      !policy.allowedFields.includes("description")
    ) {
      context.addIssue({
        code: "custom",
        path: ["fullDescriptionPermission"],
        message: "full-description permission requires the description field",
      });
    }
    if (policy.publicDisplayPermission && !policy.attribution) {
      context.addIssue({
        code: "custom",
        path: ["attribution"],
        message: "public sources require explicit attribution",
      });
    }
    const reviewPairPresent =
      policy.reviewedAt !== null && policy.reviewDueAt !== null;
    if (
      (policy.reviewedAt === null) !== (policy.reviewDueAt === null) ||
      (reviewPairPresent && policy.reviewedAt! >= policy.reviewDueAt!)
    ) {
      context.addIssue({
        code: "custom",
        path: ["reviewDueAt"],
        message: "rights review dates must form an increasing pair",
      });
    }
  });

const registrySchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: timestamp,
    reviewIntervalDays: z.number().int().min(1).max(365),
    sources: z.array(policySchema).min(1).max(100),
  })
  .strict()
  .superRefine((registry, context) => {
    const adapterKeys = new Set<string>();
    for (const [index, source] of registry.sources.entries()) {
      if (adapterKeys.has(source.adapterKey)) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "adapterKey"],
          message: "source adapter keys must be unique",
        });
      }
      adapterKeys.add(source.adapterKey);
      if (source.reviewedAt && source.reviewedAt > registry.generatedAt) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "reviewedAt"],
          message: "source reviews cannot postdate the generated registry",
        });
      }
      if (
        source.state === "enabled" &&
        source.reviewDueAt &&
        source.reviewDueAt <= registry.generatedAt
      ) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "reviewDueAt"],
          message: "enabled sources require a current review window",
        });
      }
    }
  });

export type JobSourcePolicyRecord = z.infer<typeof policySchema>;
export type JobSourcePolicyRegistry = z.infer<typeof registrySchema>;

export function parseJobSourcePolicyRegistry(value: unknown) {
  return registrySchema.parse(value);
}

export const jobSourcePolicyRegistry =
  parseJobSourcePolicyRegistry(registryJson);

export type AdapterPolicyRejection =
  | "policy_missing"
  | "policy_disabled"
  | "policy_expired"
  | "policy_review_overdue"
  | "policy_dependency_missing"
  | "policy_field_not_allowed";

export class AdapterPolicyError extends Error {
  constructor(
    public readonly code: AdapterPolicyRejection,
    public readonly adapterKey: string,
  ) {
    super(`${adapterKey}:${code}`);
    this.name = "AdapterPolicyError";
  }
}

export function findSourcePolicy(adapterKey: string) {
  return jobSourcePolicyRegistry.sources.find(
    (policy) => policy.adapterKey === adapterKey,
  );
}

export function assertRunnableSourcePolicy(
  adapterKey: string,
  fields: readonly string[],
  now = new Date(),
): JobSourcePolicyRecord {
  const policy = findSourcePolicy(adapterKey);
  if (!policy) throw new AdapterPolicyError("policy_missing", adapterKey);
  if (policy.state === "expired") {
    throw new AdapterPolicyError("policy_expired", adapterKey);
  }
  if (policy.state !== "enabled") {
    throw new AdapterPolicyError("policy_disabled", adapterKey);
  }
  if (
    !Number.isFinite(now.valueOf()) ||
    !policy.reviewDueAt ||
    Date.parse(policy.reviewDueAt) <= now.valueOf()
  ) {
    throw new AdapterPolicyError("policy_review_overdue", adapterKey);
  }
  if (policy.missingDependencies.length > 0) {
    throw new AdapterPolicyError("policy_dependency_missing", adapterKey);
  }
  if (fields.some((field) => !policy.allowedFields.includes(field))) {
    throw new AdapterPolicyError("policy_field_not_allowed", adapterKey);
  }
  return policy;
}

export function sourceAuthorityScore(authority: SourceAuthority) {
  return SOURCE_AUTHORITY[authority];
}
