import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type OperationsSupabaseClient = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;

interface OperationsEvidenceCodes {
  unconfigured: string;
  queryFailed: string;
  invalid: string;
}

export async function readOperationsEvidence<T>({
  suppliedClient,
  operation,
  rpc,
  schema,
  codes,
}: {
  suppliedClient?: OperationsSupabaseClient;
  operation: string;
  rpc: string;
  schema: z.ZodType<T>;
  codes: OperationsEvidenceCodes;
}): Promise<RepositoryResult<T | null>> {
  let supabase: OperationsSupabaseClient | null;
  try {
    supabase = suppliedClient ?? (await createServerSupabaseClient());
  } catch (error) {
    unstable_rethrow(error);
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(operation, "query_failed", codes.queryFailed, error),
    );
  }

  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      null,
      repositoryIssue(operation, "not_configured", codes.unconfigured),
    );
  }

  let data: unknown;
  try {
    const response = await supabase.schema("api").rpc(rpc as never);
    if (response.error) {
      return repositoryFailure(
        "unavailable",
        null,
        repositoryIssue(
          operation,
          "query_failed",
          codes.queryFailed,
          response.error,
        ),
      );
    }
    data = response.data;
  } catch (error) {
    unstable_rethrow(error);
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(operation, "query_failed", codes.queryFailed, error),
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        operation,
        "invalid_container",
        codes.invalid,
        parsed.error,
      ),
    );
  }
  return repositoryReady(parsed.data);
}
