import "server-only";

import { z } from "zod";

import {
  repositoryDegraded,
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
} from "@/lib/data/repository-result";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const privacyRequestSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum([
      "data_export",
      "account_deletion",
      "correction",
      "contribution_deletion",
    ]),
    target_id: z.string().uuid().nullable(),
    status: z.enum([
      "pending",
      "in_progress",
      "completed",
      "rejected",
      "cancelled",
    ]),
    requested_at: z.iso.datetime({ offset: true }),
    completed_at: z.iso.datetime({ offset: true }).nullable(),
    resolution_note: z.string().max(32_000).nullable(),
  })
  .strict()
  .superRefine((request, context) => {
    const shouldBeCompleted = request.status === "completed";
    if (shouldBeCompleted !== (request.completed_at !== null)) {
      context.addIssue({
        code: "custom",
        message: "Completion evidence does not match the request status.",
        path: ["completed_at"],
      });
    }
    if (
      request.completed_at !== null &&
      new Date(request.completed_at) < new Date(request.requested_at)
    ) {
      context.addIssue({
        code: "custom",
        message: "Completion cannot predate the request.",
        path: ["completed_at"],
      });
    }
  });
const privacyRequestRowsSchema = z
  .array(privacyRequestSchema)
  .max(50)
  .superRefine((requests, context) => {
    const seenIds = new Set<string>();
    let previousRequestedAt = Number.POSITIVE_INFINITY;

    requests.forEach((request, index) => {
      if (seenIds.has(request.id)) {
        context.addIssue({
          code: "custom",
          message: "Privacy request IDs must be unique.",
          path: [index, "id"],
        });
      }
      seenIds.add(request.id);

      const requestedAt = new Date(request.requested_at).valueOf();
      if (requestedAt > previousRequestedAt) {
        context.addIssue({
          code: "custom",
          message: "Privacy requests must be newest first.",
          path: [index, "requested_at"],
        });
      }
      previousRequestedAt = requestedAt;
    });
  });

export type PrivacyRequest = z.infer<typeof privacyRequestSchema>;

export async function getMyPrivacyRequestsResult() {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "privacy.list",
        "query_failed",
        "privacy_query_failed",
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
        "privacy.list",
        "not_configured",
        "privacy_backend_unconfigured",
      ),
    );
  }
  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase
      .schema("api")
      .from("my_privacy_requests")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(51),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "privacy.list",
        "query_failed",
        "privacy_query_failed",
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
        "privacy.list",
        error ? "query_failed" : "invalid_container",
        error ? "privacy_query_failed" : "privacy_invalid_container",
        error,
      ),
    );
  }
  const overflow = data.length > 50;
  const parsed = privacyRequestRowsSchema.safeParse(data.slice(0, 50));
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        "privacy.list",
        "invalid_rows",
        "privacy_invalid_rows",
        parsed.error,
      ),
    );
  }
  return overflow
    ? repositoryDegraded(parsed.data, [
        repositoryIssue(
          "privacy.list",
          "invalid_container",
          "privacy_capacity_exceeded",
        ),
      ])
    : repositoryReady(parsed.data);
}

export async function getMyPrivacyRequests(): Promise<PrivacyRequest[]> {
  return (await getMyPrivacyRequestsResult()).data;
}
