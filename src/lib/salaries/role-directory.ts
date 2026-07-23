import "server-only";

import { z } from "zod";

import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
} from "@/lib/data/repository-result";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MAX_ROLE_FAMILIES = 200;

const roleFamilySchema = z
  .object({
    slug: z
      .string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(2).max(200),
  })
  .strict();

export type RoleFamily = z.infer<typeof roleFamilySchema>;

/** The active role-family taxonomy, ordered by display name. */
export async function getRoleFamiliesResult() {
  const operation = "salaries.role_families";
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure<RoleFamily[]>(
      "unavailable",
      [],
      repositoryIssue(
        operation,
        "query_failed",
        "role_families_query_failed",
        clientAttempt.error,
      ),
    );
  }
  const supabase = clientAttempt.value;
  if (!supabase) {
    return repositoryFailure<RoleFamily[]>(
      "unconfigured",
      [],
      repositoryIssue(
        operation,
        "not_configured",
        "role_families_backend_unconfigured",
      ),
    );
  }
  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase
      .schema("api")
      .from("role_families")
      .select("slug,name")
      .order("name")
      .limit(MAX_ROLE_FAMILIES),
  );
  if (!queryAttempt.ok || queryAttempt.value.error) {
    return repositoryFailure<RoleFamily[]>(
      "unavailable",
      [],
      repositoryIssue(
        operation,
        "query_failed",
        "role_families_query_failed",
        queryAttempt.ok ? queryAttempt.value.error : queryAttempt.error,
      ),
    );
  }
  const parsed = z
    .array(roleFamilySchema)
    .max(MAX_ROLE_FAMILIES)
    .safeParse(queryAttempt.value.data);
  if (!parsed.success) {
    return repositoryFailure<RoleFamily[]>(
      "invalid",
      [],
      repositoryIssue(operation, "invalid_rows", "role_families_invalid_rows"),
    );
  }
  return repositoryReady(parsed.data);
}
