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

async function safeRpc(name: string) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.schema("api").rpc(name);
  return error || !Array.isArray(data) ? [] : data;
}

export async function getSavedJobs() {
  return z
    .array(savedJobSchema)
    .catch([])
    .parse(await safeRpc("get_my_saved_jobs"));
}

export async function getApplications() {
  return z
    .array(applicationSchema)
    .catch([])
    .parse(await safeRpc("get_my_applications"));
}

export async function getAlerts() {
  return z
    .array(alertSchema)
    .catch([])
    .parse(await safeRpc("get_my_job_alerts"));
}
