import "server-only";

import { z } from "zod";

import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const timestamp = z.iso.datetime({ offset: true });
const enumText = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9_]+$/);

const moderationCaseSchema = z
  .object({
    case: z
      .object({
        id: z.uuid(),
        state: enumText,
        priority: z.coerce.number().int().min(1).max(5),
        version: z.coerce.number().int().positive(),
        opened_at: timestamp,
        closed_at: timestamp.nullable(),
      })
      .strict(),
    source_type: z.enum([
      "salary",
      "review",
      "interview",
      "benefits",
      "pay_reliability",
      "employer_job",
      "report",
      "company_claim",
      "employer_response",
    ]),
    source_payload: z.record(z.string(), z.unknown()),
    flags: z.array(
      z
        .object({
          id: z.uuid(),
          kind: enumText,
          source: enumText,
          confidence: z.coerce.number().min(0).max(1).nullable(),
          created_at: timestamp,
          resolved_at: timestamp.nullable(),
        })
        .strict(),
    ),
    actions: z.array(
      z
        .object({
          action: enumText,
          actor_role: enumText,
          reason_code: z.string().max(120).nullable(),
          reason_note: z.string().max(2_000).nullable(),
          previous_state: enumText.nullable(),
          new_state: enumText.nullable(),
          changed_fields: z.array(z.string().max(120)).max(100),
          linked_case_id: z.uuid().nullable(),
          occurred_at: timestamp,
        })
        .strict(),
    ),
  })
  .strict();

export type ModerationCaseDetail = z.infer<typeof moderationCaseSchema>;

export async function getModerationCaseResult(
  caseId: string,
): Promise<RepositoryResult<ModerationCaseDetail | null>> {
  if (!z.uuid().safeParse(caseId).success) {
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        "admin.moderation_case",
        "invalid_rows",
        "moderation_case_id_invalid",
      ),
    );
  }
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok || !clientAttempt.value) {
    return repositoryFailure(
      clientAttempt.ok ? "unconfigured" : "unavailable",
      null,
      repositoryIssue(
        "admin.moderation_case",
        clientAttempt.ok ? "not_configured" : "query_failed",
        clientAttempt.ok
          ? "moderation_case_backend_unconfigured"
          : "moderation_case_query_failed",
        clientAttempt.ok ? undefined : clientAttempt.error,
      ),
    );
  }
  const queryAttempt = await attemptRepositoryOperation(() =>
    clientAttempt.value!.schema("api").rpc(
      "admin_get_moderation_case" as never,
      {
        p_case_id: caseId,
      } as never,
    ),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        "admin.moderation_case",
        "query_failed",
        "moderation_case_query_failed",
        queryAttempt.error,
      ),
    );
  }
  const response = queryAttempt.value as unknown as {
    data: unknown;
    error: unknown;
  };
  if (response.error) {
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        "admin.moderation_case",
        "query_failed",
        "moderation_case_query_failed",
        response.error,
      ),
    );
  }
  if (response.data === null) return repositoryReady(null);
  const parsed = moderationCaseSchema.safeParse(response.data);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        "admin.moderation_case",
        "invalid_rows",
        "moderation_case_invalid",
      ),
    );
  }
  return repositoryReady(parsed.data);
}
