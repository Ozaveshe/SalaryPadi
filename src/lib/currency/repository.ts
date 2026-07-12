import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ReferenceCurrencyRate } from "@/lib/currency/types";
import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
} from "@/lib/data/repository-result";

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

export async function getReferenceCurrencyRatesResult() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      [],
      repositoryIssue(
        "currency.list",
        "not_configured",
        "currency_backend_unconfigured",
      ),
    );
  }
  const { data, error } = await supabase
    .schema("api")
    .from("current_currency_rates")
    .select("*")
    .order("base_currency")
    .order("quote_currency");
  if (error || !Array.isArray(data)) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "currency.list",
        error ? "query_failed" : "invalid_container",
        error ? "currency_query_failed" : "currency_invalid_container",
        error,
      ),
    );
  }
  const parsed = z.array(referenceRateSchema).safeParse(data);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        "currency.list",
        "invalid_rows",
        "currency_invalid_rows",
        parsed.error,
      ),
    );
  }
  return repositoryReady(parsed.data);
}

export async function getReferenceCurrencyRates(): Promise<
  ReferenceCurrencyRate[]
> {
  return (await getReferenceCurrencyRatesResult()).data;
}
