import "server-only";

import { z } from "zod";

import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
} from "@/lib/data/repository-result";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const privacyRequestSchema = z.object({
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
  requested_at: z.string(),
  completed_at: z.string().nullable(),
  resolution_note: z.string().nullable(),
});

export type PrivacyRequest = z.infer<typeof privacyRequestSchema>;

export async function getMyPrivacyRequestsResult() {
  const supabase = await createServerSupabaseClient();
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
  const { data, error } = await supabase
    .schema("api")
    .from("my_privacy_requests")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(50);
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
  const parsed = z.array(privacyRequestSchema).safeParse(data);
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
  return repositoryReady(parsed.data);
}

export async function getMyPrivacyRequests(): Promise<PrivacyRequest[]> {
  return (await getMyPrivacyRequestsResult()).data;
}
