import "server-only";

import { z } from "zod";

import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const savedJobSchema = z.object({
  id: z.string().uuid(),
  job_slug: z.string(),
  title: z.string(),
  company_name: z.string(),
  source_name: z.string(),
  saved_at: z.string(),
});

const applicationSchema = z.object({
  id: z.string().uuid(),
  job_slug: z.string(),
  title: z.string(),
  company_name: z.string(),
  status: z.enum([
    "saved",
    "applied",
    "assessment",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
  ]),
  private_notes: z.string().nullable(),
  next_action_at: z.string().nullable(),
  updated_at: z.string(),
});

const alertSchema = z.object({
  id: z.string().uuid(),
  query: z.record(z.string(), z.unknown()),
  cadence: z.enum(["daily", "weekly"]),
  active: z.boolean(),
  created_at: z.string(),
});

type CareerRpcName =
  "get_my_saved_jobs" | "get_my_applications" | "get_my_job_alerts";

async function readCareerRows<T>(
  name: CareerRpcName,
  schema: z.ZodType<T[]>,
): Promise<RepositoryResult<T[]>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      [],
      repositoryIssue(name, "not_configured", "career_backend_unconfigured"),
    );
  }
  const { data, error } = await supabase.schema("api").rpc(name);
  if (error || !Array.isArray(data)) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        name,
        error ? "query_failed" : "invalid_container",
        error ? "career_rpc_error" : "career_invalid_container",
        error,
      ),
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        name,
        "invalid_rows",
        "career_invalid_rows",
        parsed.error,
      ),
    );
  }

  return repositoryReady(parsed.data);
}

export async function getSavedJobs() {
  return readCareerRows("get_my_saved_jobs", z.array(savedJobSchema));
}

export async function getApplications() {
  return readCareerRows("get_my_applications", z.array(applicationSchema));
}

export async function getAlerts() {
  return readCareerRows("get_my_job_alerts", z.array(alertSchema));
}
