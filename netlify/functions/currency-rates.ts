import type { Config } from "@netlify/functions";

import { fetchInforEuroRates } from "./_shared/currency";
import { rpc, runTrackedWorker } from "./_shared/runtime";

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker("currency_rates", request, context, async () => {
    const source = await fetchInforEuroRates();
    const rateSetId = await rpc<string>("worker_store_inforeuro_rates", {
      p_observed_at: source.observedAt,
      p_source_url: source.sourceUrl,
      p_rates: source.rates,
    });
    return {
      provider: "european_commission_inforeuro",
      rate_count: source.rates.length,
      data_period: source.observedAt.slice(0, 10),
      rate_set_recorded: Boolean(rateSetId),
    };
  });

export default handler;

export const config: Config = {
  schedule: "25 2 * * *",
};
