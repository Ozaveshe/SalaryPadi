import "server-only";

import { z } from "zod";

import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const WORKSPACE_RETENTION_POLICIES = [
  "manual",
  "days_90",
  "days_365",
] as const;

export type WorkspaceRetentionPolicy =
  (typeof WORKSPACE_RETENTION_POLICIES)[number];

export interface WorkspaceRetention {
  policy: WorkspaceRetentionPolicy;
  retentionDays: number | null;
  graceUntil: string | null;
  nextDeletionAt: string | null;
  affectedRecords: number;
}

export const WORKSPACE_RETENTION_OPTIONS: ReadonlyArray<{
  value: WorkspaceRetentionPolicy;
  label: string;
  description: string;
}> = [
  {
    value: "manual",
    label: "Keep until I delete them",
    description: "Nothing in this workspace is deleted on a timer.",
  },
  {
    value: "days_90",
    label: "Delete after 90 days",
    description: "Delete each eligible record 90 days after its last update.",
  },
  {
    value: "days_365",
    label: "Delete after one year",
    description: "Delete each eligible record one year after its last update.",
  },
];

const workspaceRetentionRowsSchema = z
  .array(
    z
      .object({
        policy: z.enum(WORKSPACE_RETENTION_POLICIES),
        retention_days: z.union([z.literal(90), z.literal(365)]).nullable(),
        grace_until: z.iso.datetime({ offset: true }).nullable(),
        next_deletion_at: z.iso.datetime({ offset: true }).nullable(),
        affected_records: z.number().int().nonnegative(),
      })
      .strict(),
  )
  .length(1)
  .superRefine(([row], context) => {
    if (!row) return;
    const expectedDays =
      row.policy === "manual" ? null : row.policy === "days_90" ? 90 : 365;
    if (row.retention_days !== expectedDays) {
      context.addIssue({
        code: "custom",
        path: [0, "retention_days"],
        message: "Retention days do not match the policy.",
      });
    }
    if ((row.policy === "manual") !== (row.grace_until === null)) {
      context.addIssue({
        code: "custom",
        path: [0, "grace_until"],
        message: "Retention grace does not match the policy.",
      });
    }
  });

const EMPTY_RETENTION: WorkspaceRetention = {
  policy: "manual",
  retentionDays: null,
  graceUntil: null,
  nextDeletionAt: null,
  affectedRecords: 0,
};

export async function getWorkspaceRetention(): Promise<
  RepositoryResult<WorkspaceRetention>
> {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      EMPTY_RETENTION,
      repositoryIssue(
        "workspace.retention.read",
        "query_failed",
        "workspace_retention_client_failed",
        clientAttempt.error,
      ),
    );
  }
  if (!clientAttempt.value) {
    return repositoryFailure(
      "unconfigured",
      EMPTY_RETENTION,
      repositoryIssue(
        "workspace.retention.read",
        "not_configured",
        "workspace_retention_backend_unconfigured",
      ),
    );
  }
  const supabase = clientAttempt.value;

  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase.schema("api").rpc("get_my_workspace_retention"),
  );
  if (!queryAttempt.ok || queryAttempt.value.error) {
    return repositoryFailure(
      "unavailable",
      EMPTY_RETENTION,
      repositoryIssue(
        "workspace.retention.read",
        "query_failed",
        "workspace_retention_query_failed",
        queryAttempt.ok ? queryAttempt.value.error : queryAttempt.error,
      ),
    );
  }

  const parsed = workspaceRetentionRowsSchema.safeParse(
    queryAttempt.value.data,
  );
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      EMPTY_RETENTION,
      repositoryIssue(
        "workspace.retention.read",
        "invalid_rows",
        "workspace_retention_invalid_rows",
        parsed.error,
      ),
    );
  }
  const row = parsed.data[0]!;
  return repositoryReady({
    policy: row.policy,
    retentionDays: row.retention_days,
    graceUntil: row.grace_until,
    nextDeletionAt: row.next_deletion_at,
    affectedRecords: row.affected_records,
  });
}
