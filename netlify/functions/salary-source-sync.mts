import type { Config } from "@netlify/functions";
import { z } from "zod";

import { externalHttpsUrlSchema } from "../../src/lib/security/url-schema";

import {
  decodeRpcResult,
  getRuntimeBoolean,
  OperationalError,
  rpc,
  runTrackedWorker,
  type WorkerExecution,
  workerSkipped,
} from "./_shared/runtime";

const enabledSalarySourceSchema = z
  .array(
    z
      .object({
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
        dataset_url: externalHttpsUrlSchema,
        methodology_url: externalHttpsUrlSchema.nullable(),
        terms_url: externalHttpsUrlSchema,
        allowed_fields: z.array(z.string().min(1).max(80)).min(1).max(100),
        refresh_interval_seconds: z.number().int().min(86_400),
        last_success_at: z.string().datetime({ offset: true }).nullable(),
      })
      .strict(),
  )
  .max(50)
  .superRefine((sources, context) => {
    const seen = new Set<string>();
    for (const [index, source] of sources.entries()) {
      if (seen.has(source.source_key)) {
        context.addIssue({
          code: "custom",
          path: [index, "source_key"],
          message: "Salary source keys must be unique.",
        });
      }
      seen.add(source.source_key);
      if (
        new Set(source.allowed_fields).size !== source.allowed_fields.length
      ) {
        context.addIssue({
          code: "custom",
          path: [index, "allowed_fields"],
          message: "Salary source allowed fields must be unique.",
        });
      }
    }
  });

type SalarySourceSyncDependencies = {
  rpc?: (
    functionName: string,
    parameters?: Record<string, unknown>,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ) => Promise<unknown>;
};

function validatedRpc(
  dependency?: SalarySourceSyncDependencies["rpc"],
): typeof rpc {
  return async <T,>(
    functionName: string,
    resultSchema: z.ZodType<T>,
    parameters: Record<string, unknown> = {},
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ) => {
    try {
      if (!dependency) {
        return await rpc(functionName, resultSchema, parameters, options);
      }
      return decodeRpcResult(
        functionName,
        resultSchema,
        await dependency(functionName, parameters, options),
      );
    } catch (reason) {
      if (
        reason instanceof OperationalError &&
        reason.code === "supabase_rpc_invalid_shape"
      ) {
        throw new OperationalError("salary_source_registry_invalid");
      }
      throw reason;
    }
  };
}

export async function runSalarySourceSync(
  { signal }: WorkerExecution,
  dependencies: SalarySourceSyncDependencies = {},
) {
  if (!getRuntimeBoolean("SALARY_SOURCE_SYNC_ENABLED", false)) {
    return workerSkipped("salary_source_sync_disabled");
  }

  const callRpc = validatedRpc(dependencies.rpc);
  const sources = await callRpc(
    "worker_list_enabled_salary_sources",
    enabledSalarySourceSchema,
    {},
    { signal },
  );
  if (sources.length === 0) {
    return workerSkipped("no_reviewed_salary_sources");
  }

  // Each external format needs a code-owned, source-specific parser. A source
  // cannot be activated merely by inserting a URL into the database; that
  // would turn this worker into an SSRF-capable generic crawler.
  throw new OperationalError("salary_source_adapters_not_activated", {
    reviewed_source_count: sources.length,
    adapter_count: new Set(sources.map((source) => source.adapter_key)).size,
  });
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker("salary_source_sync", request, context, runSalarySourceSync);

export default handler;

export const config: Config = { schedule: "35 3 * * *" };
