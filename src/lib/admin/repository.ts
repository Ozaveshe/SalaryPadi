import "server-only";

import { z } from "zod";

import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import {
  repositoryDegraded,
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AdminResource =
  | "jobs"
  | "imports"
  | "sources"
  | "companies"
  | "company_claims"
  | "employer_responses"
  | "moderation"
  | "reports"
  | "users"
  | "calculation_rules"
  | "editorial";

const MAX_ADMIN_ROWS = 200;

const rowSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(300),
    secondary: z.string().max(500).nullable(),
    status: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9_:]+$/),
    updated_at: z.iso.datetime({ offset: true }),
    version: z.number().int().positive().max(2_147_483_647),
  })
  .strict();

export type AdminRow = z.infer<typeof rowSchema>;

export async function getAdminRowsResult(
  resource: AdminResource,
): Promise<RepositoryResult<AdminRow[]>> {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        `admin.${resource}`,
        "query_failed",
        "admin_queue_query_failed",
        clientAttempt.error,
      ),
    );
  }
  const supabase = clientAttempt.value;
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      [],
      repositoryIssue(
        `admin.${resource}`,
        "not_configured",
        "admin_queue_backend_unconfigured",
      ),
    );
  }
  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase
      .schema("api")
      .rpc(`admin_list_${resource}` as never)
      .limit(MAX_ADMIN_ROWS + 1),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        `admin.${resource}`,
        "query_failed",
        "admin_queue_query_failed",
        queryAttempt.error,
      ),
    );
  }
  const { data, error } = queryAttempt.value;
  const rawData: unknown = data;
  if (error || !Array.isArray(rawData)) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        `admin.${resource}`,
        error ? "query_failed" : "invalid_container",
        error ? "admin_queue_query_failed" : "admin_queue_invalid_container",
        error,
      ),
    );
  }
  if (rawData.length > MAX_ADMIN_ROWS) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        `admin.${resource}`,
        "invalid_container",
        "admin_queue_capacity_exceeded",
      ),
    );
  }
  const rows = rawData.flatMap((row) => {
    const parsed = rowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  if (rows.length !== rawData.length) {
    const issue = repositoryIssue(
      `admin.${resource}`,
      "invalid_rows",
      "admin_queue_invalid_rows",
    );
    return rows.length > 0
      ? repositoryDegraded(rows, [issue])
      : repositoryFailure("invalid", [], issue);
  }
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        `admin.${resource}`,
        "invalid_rows",
        "admin_queue_duplicate_rows",
      ),
    );
  }
  return repositoryReady(rows);
}

export async function getAdminRows(resource: AdminResource) {
  return (await getAdminRowsResult(resource)).data;
}
