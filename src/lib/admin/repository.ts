import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AdminResource =
  | "jobs"
  | "imports"
  | "sources"
  | "companies"
  | "moderation"
  | "reports"
  | "users"
  | "calculation_rules"
  | "editorial";

const rowSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(300),
  secondary: z.string().max(500).nullable().default(null),
  status: z.string().max(80),
  updated_at: z.string(),
  version: z.number().int().nonnegative().default(0),
});

export type AdminRow = z.infer<typeof rowSchema>;

export async function getAdminRows(
  resource: AdminResource,
): Promise<AdminRow[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    throw new Error("The SalaryPadi backend is not configured.");
  }
  const { data, error } = await supabase
    .schema("api")
    .rpc(`admin_list_${resource}` as never);
  if (error) {
    throw new Error(`Could not load the ${resource} administration queue.`);
  }

  const parsed = z.array(rowSchema).safeParse(data);
  if (!parsed.success) {
    throw new Error(`The ${resource} administration response was invalid.`);
  }
  return parsed.data;
}
