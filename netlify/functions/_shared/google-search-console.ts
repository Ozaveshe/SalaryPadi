import { z } from "zod";

import { discardResponseBody } from "../../../src/lib/http/body";
import {
  getOptionalRuntimeEnvironment,
  getRuntimeBoolean,
  OperationalError,
  readBoundedOperationalJson,
  type WorkerExecution,
} from "./runtime";
import { getGoogleAccessToken } from "./google-auth";

const SEARCH_CONSOLE_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";
const SAFE_SITE_URLS = new Set([
  "sc-domain:salarypadi.com",
  "https://salarypadi.com/",
]);
const SEARCH_CONSOLE_MAX_RESPONSE_BYTES = 128 * 1024;
const searchConsoleResponseSchema = z
  .object({ rows: z.array(z.unknown()).max(50).optional() })
  .passthrough();
const searchConsoleRowSchema = z
  .object({
    keys: z.tuple([z.unknown()]),
    clicks: z.number().int().nonnegative(),
    impressions: z.number().int().nonnegative(),
  })
  .passthrough();

export type EditorialTopicSignal = {
  signal_kind: "search_console";
  signal_key: string;
  window_start: string;
  window_end: string;
  impressions: number;
  clicks: number;
  product_events: null;
  source_checked_at: string;
};

export function sanitizeSearchConsoleQuery(input: unknown) {
  if (typeof input !== "string") return null;
  const value = input
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    value.length < 3 ||
    value.length > 160 ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) ||
    /(^|\D)\d{10,14}(\D|$)/.test(value)
  ) {
    return null;
  }
  return value;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function readSearchConsoleTopicSignals({
  signal,
}: WorkerExecution): Promise<{
  state: "disabled" | "ready" | "degraded";
  signals: EditorialTopicSignal[];
  issueCodes: string[];
}> {
  if (!getRuntimeBoolean("GOOGLE_SEARCH_CONSOLE_ENABLED", false)) {
    return { state: "disabled", signals: [], issueCodes: [] };
  }
  const siteUrl = getOptionalRuntimeEnvironment(
    "GOOGLE_SEARCH_CONSOLE_SITE_URL",
  );
  if (!siteUrl || !SAFE_SITE_URLS.has(siteUrl)) {
    throw new OperationalError("invalid_google_search_console_site_url");
  }
  const checkedAt = new Date();
  const end = new Date(checkedAt);
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  const token = await getGoogleAccessToken(SEARCH_CONSOLE_SCOPE, signal);
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: dateOnly(start),
      endDate: dateOnly(end),
      dimensions: ["query"],
      dataState: "final",
      rowLimit: 50,
    }),
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
  });
  if (!response.ok) {
    await discardResponseBody(response);
    throw new OperationalError(`google_search_console_${response.status}`, {
      provider_status: response.status,
    });
  }
  const payload = searchConsoleResponseSchema.safeParse(
    await readBoundedOperationalJson(
      response,
      SEARCH_CONSOLE_MAX_RESPONSE_BYTES,
      "google_search_console_invalid_response",
    ),
  );
  if (!payload.success) {
    throw new OperationalError("google_search_console_invalid_response");
  }
  let invalidRows = 0;
  const signals = (payload.data.rows ?? []).flatMap((candidate) => {
    const row = searchConsoleRowSchema.safeParse(candidate);
    if (!row.success) {
      invalidRows += 1;
      return [];
    }
    const query = sanitizeSearchConsoleQuery(row.data.keys[0]);
    const { impressions, clicks } = row.data;
    if (!query || impressions < 3 || clicks > impressions) {
      invalidRows += 1;
      return [];
    }
    return [
      {
        signal_kind: "search_console" as const,
        signal_key: query,
        window_start: dateOnly(start),
        window_end: dateOnly(end),
        impressions,
        clicks,
        product_events: null,
        source_checked_at: checkedAt.toISOString(),
      },
    ];
  });
  return {
    state: invalidRows > 0 ? "degraded" : "ready",
    signals,
    issueCodes: invalidRows > 0 ? ["google_search_console_invalid_rows"] : [],
  };
}
