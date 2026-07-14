import {
  getOptionalRuntimeEnvironment,
  getRuntimeBoolean,
  OperationalError,
  type WorkerExecution,
} from "./runtime";
import { getGoogleAccessToken } from "./google-auth";

const SEARCH_CONSOLE_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";
const SAFE_SITE_URLS = new Set([
  "sc-domain:salarypadi.com",
  "https://salarypadi.com/",
]);

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
  state: "disabled" | "ready";
  signals: EditorialTopicSignal[];
}> {
  if (!getRuntimeBoolean("GOOGLE_SEARCH_CONSOLE_ENABLED", false)) {
    return { state: "disabled", signals: [] };
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
    throw new OperationalError(`google_search_console_${response.status}`, {
      provider_status: response.status,
    });
  }
  const payload = (await response.json()) as {
    rows?: Array<{ keys?: unknown[]; clicks?: unknown; impressions?: unknown }>;
  };
  const signals = (payload.rows ?? []).flatMap((row) => {
    const query = sanitizeSearchConsoleQuery(row.keys?.[0]);
    const impressions = Number(row.impressions);
    const clicks = Number(row.clicks);
    if (
      !query ||
      !Number.isInteger(impressions) ||
      impressions < 3 ||
      !Number.isInteger(clicks) ||
      clicks < 0
    ) {
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
  return { state: "ready", signals };
}
