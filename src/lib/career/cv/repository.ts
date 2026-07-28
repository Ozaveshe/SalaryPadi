import "server-only";

import { z } from "zod";

import {
  mapRepositoryResult,
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { CV_CONTENT_TYPES } from "./extract";

const MAX_CV_ROWS = 25;

/**
 * A stored CV as `api.get_my_cvs` returns it. `extracted_text` is what the
 * reader actually read out of the document, kept so the owner can see it and so
 * a re-match never re-reads the file.
 */
const cvRowSchema = z
  .object({
    id: z.uuid(),
    storage_path: z.string().min(3).max(400),
    file_name: z.string().min(1).max(260),
    content_type: z.enum([
      CV_CONTENT_TYPES.pdf,
      CV_CONTENT_TYPES.docx,
      CV_CONTENT_TYPES.txt,
    ]),
    byte_size: z.number().int().positive().max(5_242_880),
    extracted_text: z.string().max(200_000).nullable(),
    parse_state: z.enum(["parsed", "unreadable"]),
    parse_note: z.string().max(500).nullable(),
    is_current: z.boolean(),
    uploaded_at: z.string().datetime({ offset: true }),
  })
  .strict();

export type CandidateCvRow = z.infer<typeof cvRowSchema>;

export async function getCandidateCvs(): Promise<
  RepositoryResult<CandidateCvRow[]>
> {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "get_my_cvs",
        "query_failed",
        "career_rpc_error",
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
        "get_my_cvs",
        "not_configured",
        "career_backend_unconfigured",
      ),
    );
  }

  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase
      .schema("api")
      .rpc("get_my_cvs")
      .limit(MAX_CV_ROWS + 1),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "get_my_cvs",
        "query_failed",
        "career_rpc_error",
        queryAttempt.error,
      ),
    );
  }
  const { data, error } = queryAttempt.value;
  if (error || !Array.isArray(data)) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "get_my_cvs",
        error ? "query_failed" : "invalid_container",
        error ? "career_rpc_error" : "career_invalid_container",
        error,
      ),
    );
  }

  const parsed = z.array(cvRowSchema).max(MAX_CV_ROWS).safeParse(data);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        "get_my_cvs",
        "invalid_rows",
        "career_invalid_rows",
        parsed.error,
      ),
    );
  }
  return repositoryReady(parsed.data);
}

/** The CV currently marked as the account's own, or null when none is stored. */
export async function getCurrentCandidateCv(): Promise<
  RepositoryResult<CandidateCvRow | null>
> {
  const result = await getCandidateCvs();
  return mapRepositoryResult(
    result,
    (rows) => rows.find((row) => row.is_current) ?? null,
  );
}
