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

const MAX_AUDIT_EVENTS = 100;

const auditEventSchema = z
  .object({
    id: z.uuid(),
    occurred_at: z.iso.datetime({ offset: true }),
    actor_user_id: z.uuid().nullable(),
    actor_kind: z.enum(["user", "staff", "system"]),
    action: z.string().trim().min(2).max(120),
    target_type: z.string().trim().min(2).max(120),
    target_id: z.uuid().nullable(),
    request_id: z.uuid().nullable(),
    reason_code: z.string().trim().max(120).nullable(),
    previous_state: z.unknown().nullable(),
    new_state: z.unknown().nullable(),
    changed_fields: z.array(z.string().trim().min(1).max(120)).max(100),
    before_hash: z.string().max(512).nullable(),
    after_hash: z.string().max(512).nullable(),
    metadata: z.record(z.string(), z.unknown()),
  })
  .strict();

export type AdminAuditEvent = z.infer<typeof auditEventSchema>;

export async function getAdminAuditEventsResult(): Promise<
  RepositoryResult<AdminAuditEvent[]>
> {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "admin.audit_log",
        "query_failed",
        "admin_audit_log_query_failed",
        clientAttempt.error,
      ),
    );
  }
  if (!clientAttempt.value) {
    return repositoryFailure(
      "unconfigured",
      [],
      repositoryIssue(
        "admin.audit_log",
        "not_configured",
        "admin_audit_log_backend_unconfigured",
      ),
    );
  }

  const queryAttempt = await attemptRepositoryOperation(() =>
    clientAttempt.value!.schema("api").rpc("admin_audit_events", {
      p_limit: MAX_AUDIT_EVENTS,
    }),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "admin.audit_log",
        "query_failed",
        "admin_audit_log_query_failed",
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
        "admin.audit_log",
        error ? "query_failed" : "invalid_container",
        error
          ? "admin_audit_log_query_failed"
          : "admin_audit_log_invalid_container",
        error,
      ),
    );
  }
  if (data.length > MAX_AUDIT_EVENTS) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        "admin.audit_log",
        "invalid_container",
        "admin_audit_log_capacity_exceeded",
      ),
    );
  }

  const parsed = z.array(auditEventSchema).safeParse(data);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        "admin.audit_log",
        "invalid_rows",
        "admin_audit_log_invalid_rows",
      ),
    );
  }
  if (
    new Set(parsed.data.map((event) => event.id)).size !== parsed.data.length
  ) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        "admin.audit_log",
        "invalid_rows",
        "admin_audit_log_duplicate_events",
      ),
    );
  }

  return repositoryReady(parsed.data);
}
