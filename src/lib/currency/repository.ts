import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ReferenceCurrencyRate } from "@/lib/currency/types";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
} from "@/lib/data/repository-result";
import { externalHttpsUrlSchema } from "@/lib/security/url-schema";

const MAX_REFERENCE_RATES = 300;
const referenceRateSchema = z
  .object({
    base_currency: z.string().regex(/^[A-Z]{3}$/),
    quote_currency: z.string().regex(/^[A-Z]{3}$/),
    rate: z.coerce.number().positive().max(1_000_000_000_000),
    provider_name: z.string().trim().min(2).max(160),
    source_url: externalHttpsUrlSchema,
    license_url: externalHttpsUrlSchema.nullable(),
    attribution_text: z.string().max(1_000).nullable(),
    observed_at: z.iso.datetime({ offset: true }),
    fetched_at: z.iso.datetime({ offset: true }),
    data_period: z.iso
      .date()
      .refine((value) => value.endsWith("-01"), "Expected a monthly period."),
  })
  .strict()
  .superRefine((rate, context) => {
    if (rate.base_currency === rate.quote_currency) {
      context.addIssue({
        code: "custom",
        message: "Reference rates must use two distinct currencies.",
        path: ["quote_currency"],
      });
    }

    const observedAt = new Date(rate.observed_at);
    const fetchedAt = new Date(rate.fetched_at);
    if (observedAt > fetchedAt) {
      context.addIssue({
        code: "custom",
        message: "The observation cannot be newer than its fetch evidence.",
        path: ["observed_at"],
      });
    }

    const expectedPeriod = `${observedAt.getUTCFullYear()}-${String(
      observedAt.getUTCMonth() + 1,
    ).padStart(2, "0")}-01`;
    if (rate.data_period !== expectedPeriod) {
      context.addIssue({
        code: "custom",
        message: "The data period must match the observation month.",
        path: ["data_period"],
      });
    }
  });
const referenceRateRowsSchema = z
  .array(referenceRateSchema)
  .max(MAX_REFERENCE_RATES)
  .superRefine((rates, context) => {
    const pairs = new Set<string>();
    for (const [index, rate] of rates.entries()) {
      const pair = `${rate.base_currency}/${rate.quote_currency}`;
      if (pairs.has(pair)) {
        context.addIssue({
          code: "custom",
          path: [index, "quote_currency"],
          message: "Reference currency pairs must be unique.",
        });
      }
      pairs.add(pair);
    }
  });

export async function getReferenceCurrencyRatesResult() {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "currency.list",
        "query_failed",
        "currency_query_failed",
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
        "currency.list",
        "not_configured",
        "currency_backend_unconfigured",
      ),
    );
  }
  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase
      .schema("api")
      .from("current_currency_rates")
      // The live view exposes more columns than the reviewed rate shape and
      // the row schema is strict, so the selection must name exactly the
      // reviewed columns.
      .select(
        "base_currency,quote_currency,rate,provider_name,source_url,license_url,attribution_text,observed_at,fetched_at,data_period",
      )
      .order("base_currency")
      .order("quote_currency")
      .limit(MAX_REFERENCE_RATES + 1),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "currency.list",
        "query_failed",
        "currency_query_failed",
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
        "currency.list",
        error ? "query_failed" : "invalid_container",
        error ? "currency_query_failed" : "currency_invalid_container",
        error,
      ),
    );
  }
  const parsed = referenceRateRowsSchema.safeParse(data);
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
