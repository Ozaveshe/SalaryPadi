import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ReferenceCurrencyRate } from "@/lib/currency/types";

const referenceRateSchema = z.object({
  base_currency: z.string().regex(/^[A-Z]{3}$/),
  quote_currency: z.string().regex(/^[A-Z]{3}$/),
  rate: z.coerce.number().positive(),
  provider_name: z.string(),
  source_url: z.string().url(),
  license_url: z.string().url().nullable(),
  attribution_text: z.string().nullable(),
  observed_at: z.string(),
  fetched_at: z.string(),
  data_period: z.string(),
});

export async function getReferenceCurrencyRates(): Promise<
  ReferenceCurrencyRate[]
> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .schema("api")
    .from("current_currency_rates")
    .select("*")
    .order("base_currency")
    .order("quote_currency");
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = referenceRateSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}
