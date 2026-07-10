import "server-only";

import { z } from "zod";

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

export type CareerDataResult<T> =
  | { state: "ready"; data: T[] }
  | { state: "unconfigured" | "unavailable" | "invalid"; data: [] };

function recordReadFailure(name: CareerRpcName, code: string) {
  console.error(
    JSON.stringify({
      event: "career.repository.read_failed",
      operation: name,
      code,
    }),
  );
}

async function readCareerRows<T>(
  name: CareerRpcName,
  schema: z.ZodType<T[]>,
): Promise<CareerDataResult<T>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { state: "unconfigured", data: [] };
  const { data, error } = await supabase.schema("api").rpc(name);
  if (error || !Array.isArray(data)) {
    recordReadFailure(name, error ? "rpc_error" : "invalid_container");
    return { state: "unavailable", data: [] };
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    recordReadFailure(name, "invalid_rows");
    return { state: "invalid", data: [] };
  }

  return { state: "ready", data: parsed.data };
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
