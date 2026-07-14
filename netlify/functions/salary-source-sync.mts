import type { Config } from "@netlify/functions";
import { z } from "zod";

import {
  getRuntimeBoolean,
  OperationalError,
  rpc,
  runTrackedWorker,
  type WorkerExecution,
  workerSkipped,
} from "./_shared/runtime";

const enabledSalarySourceSchema = z.array(
  z.object({
    source_key: z.string().regex(/^[a-z0-9][a-z0-9_]{2,79}$/),
    display_name: z.string().min(2).max(160),
    adapter_key: z.enum([
      "bls_oews",
      "ons_ashe",
      "statcan_wages",
      "statssa_qes",
      "reviewed_snapshot",
    ]),
    market_country_code: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    dataset_url: z.string().url().startsWith("https://"),
    methodology_url: z.string().url().startsWith("https://").nullable(),
    terms_url: z.string().url().startsWith("https://"),
    allowed_fields: z.array(z.string().min(1).max(80)).min(1),
    refresh_interval_seconds: z.number().int().min(86_400),
    last_success_at: z.string().datetime({ offset: true }).nullable(),
  }),
);

type SalarySourceSyncDependencies = {
  rpc?: typeof rpc;
};

export async function runSalarySourceSync(
  { signal }: WorkerExecution,
  dependencies: SalarySourceSyncDependencies = {},
) {
  if (!getRuntimeBoolean("SALARY_SOURCE_SYNC_ENABLED", false)) {
    return workerSkipped("salary_source_sync_disabled");
  }

  const callRpc = dependencies.rpc ?? rpc;
  const rawSources = await callRpc<unknown>(
    "worker_list_enabled_salary_sources",
    {},
    { signal },
  );
  const parsed = enabledSalarySourceSchema.safeParse(rawSources);
  if (!parsed.success) {
    throw new OperationalError("salary_source_registry_invalid", {
      issue_count: parsed.error.issues.length,
    });
  }
  if (parsed.data.length === 0) {
    return workerSkipped("no_reviewed_salary_sources");
  }

  // Each external format needs a code-owned, source-specific parser. A source
  // cannot be activated merely by inserting a URL into the database; that
  // would turn this worker into an SSRF-capable generic crawler.
  throw new OperationalError("salary_source_adapters_not_activated", {
    reviewed_source_count: parsed.data.length,
    adapter_count: new Set(parsed.data.map((source) => source.adapter_key))
      .size,
  });
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker("salary_source_sync", request, context, runSalarySourceSync);

export default handler;

export const config: Config = { schedule: "35 3 * * *" };
