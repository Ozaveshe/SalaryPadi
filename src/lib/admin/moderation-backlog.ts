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
const count = z.coerce.number().int().nonnegative().max(2_147_483_647);

const moderationBacklogSchema = z
  .object({
    measured_at: timestamp,
    active_count: count,
    open_count: count,
    in_review_count: count,
    escalated_count: count,
    unassigned_count: count,
    priority_one_count: count,
    older_than_24h_count: count,
    oldest_opened_at: timestamp.nullable(),
  })
  .strict()
  .superRefine((backlog, context) => {
    if (
      backlog.active_count !==
      backlog.open_count + backlog.in_review_count + backlog.escalated_count
    ) {
      context.addIssue({
        code: "custom",
        path: ["active_count"],
        message: "Active moderation count must equal its state breakdown.",
      });
    }
    for (const key of [
      "unassigned_count",
      "priority_one_count",
      "older_than_24h_count",
    ] as const) {
      if (backlog[key] > backlog.active_count) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "A moderation subset cannot exceed the active backlog.",
        });
      }
    }
    if ((backlog.active_count === 0) !== (backlog.oldest_opened_at === null)) {
      context.addIssue({
        code: "custom",
        path: ["oldest_opened_at"],
        message: "Oldest-case evidence must agree with the active backlog.",
      });
    }
    if (
      backlog.oldest_opened_at &&
      Date.parse(backlog.oldest_opened_at) > Date.parse(backlog.measured_at)
    ) {
      context.addIssue({
        code: "custom",
        path: ["oldest_opened_at"],
        message: "The oldest case cannot postdate the measurement.",
      });
    }
  });

export type ModerationBacklog = z.infer<typeof moderationBacklogSchema>;

export async function getModerationBacklogResult(): Promise<
  RepositoryResult<ModerationBacklog | null>
> {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        "admin.moderation_backlog",
        "query_failed",
        "moderation_backlog_query_failed",
        clientAttempt.error,
      ),
    );
  }
  if (!clientAttempt.value) {
    return repositoryFailure(
      "unconfigured",
      null,
      repositoryIssue(
        "admin.moderation_backlog",
        "not_configured",
        "moderation_backlog_backend_unconfigured",
      ),
    );
  }

  const queryAttempt = await attemptRepositoryOperation(() =>
    clientAttempt
      .value!.schema("api")
      .rpc("admin_get_moderation_backlog" as never),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        "admin.moderation_backlog",
        "query_failed",
        "moderation_backlog_query_failed",
        queryAttempt.error,
      ),
    );
  }

  const { data, error } = queryAttempt.value;
  if (error) {
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        "admin.moderation_backlog",
        "query_failed",
        "moderation_backlog_query_failed",
        error,
      ),
    );
  }
  const parsed = moderationBacklogSchema.safeParse(data);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        "admin.moderation_backlog",
        "invalid_rows",
        "moderation_backlog_invalid",
      ),
    );
  }

  return repositoryReady(parsed.data);
}
