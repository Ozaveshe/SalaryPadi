import "server-only";

import { z } from "zod";

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

export async function getMyPrivacyRequests(): Promise<PrivacyRequest[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .schema("api")
    .from("my_privacy_requests")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(50);
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = privacyRequestSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}
