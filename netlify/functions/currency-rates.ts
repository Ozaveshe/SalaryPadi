import type { Config } from "@netlify/functions";

import { fetchInforEuroRates } from "./_shared/currency";
import {
  getRuntimeChoice,
  rpc,
  runTrackedWorker,
  type WorkerExecution,
  workerSkipped,
  workerSucceeded,
} from "./_shared/runtime";

export async function runCurrencyRates({ signal }: WorkerExecution) {
  const provider = getRuntimeChoice(
    "CURRENCY_RATE_PROVIDER",
    ["none", "european_commission_inforeuro"] as const,
    "none",
  );
  if (provider === "none") return workerSkipped("currency_provider_disabled");

  const source = await fetchInforEuroRates(new Date(), signal);
  const rateSetId = await rpc<string>(
    "worker_store_inforeuro_rates",
    {
      p_observed_at: source.observedAt,
      p_source_url: source.sourceUrl,
      p_rates: source.rates,
    },
    { signal },
  );
  return workerSucceeded({
    provider,
    rate_count: source.rates.length,
    data_period: source.observedAt.slice(0, 10),
    rate_set_recorded: Boolean(rateSetId),
  });
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) => runTrackedWorker("currency_rates", request, context, runCurrencyRates);

export default handler;

export const config: Config = {
  schedule: "25 2 * * *",
};
