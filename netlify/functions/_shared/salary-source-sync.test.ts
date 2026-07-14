import { afterEach, describe, expect, it, vi } from "vitest";

import salarySourceSync, { config } from "../salary-source-sync.mjs";
import {
  installWorkerFetch,
  nonBookkeepingUrls,
  rpcCallBodies,
  scheduledRequest,
  stubWorkerEnvironment,
  workerContext,
} from "./test-support/scheduled-worker";

function finishBody(fetchMock: ReturnType<typeof installWorkerFetch>) {
  const bodies = rpcCallBodies(fetchMock, "worker_finish");
  expect(bodies).toHaveLength(1);
  return bodies[0];
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("salary source scheduled worker", () => {
  it("runs daily", () => {
    expect(config.schedule).toBe("35 3 * * *");
  });

  it("is safely disabled by default without a provider call", async () => {
    stubWorkerEnvironment({ SALARY_SOURCE_SYNC_ENABLED: "false" });
    const fetchMock = installWorkerFetch();

    await salarySourceSync(
      scheduledRequest("salary_source_sync"),
      workerContext,
    );

    expect(nonBookkeepingUrls(fetchMock)).toEqual([]);
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "skipped",
      p_summary: { reason: "salary_source_sync_disabled" },
    });
  });

  it("records an honest no-source skip after registry validation", async () => {
    stubWorkerEnvironment({ SALARY_SOURCE_SYNC_ENABLED: "true" });
    const fetchMock = installWorkerFetch({
      rpc: { worker_list_enabled_salary_sources: [] },
    });

    await salarySourceSync(
      scheduledRequest("salary_source_sync"),
      workerContext,
    );

    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "skipped",
      p_summary: { reason: "no_reviewed_salary_sources" },
    });
  });

  it("fails closed when a reviewed source has no activated code adapter", async () => {
    stubWorkerEnvironment({ SALARY_SOURCE_SYNC_ENABLED: "true" });
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_list_enabled_salary_sources: [
          {
            source_key: "us_bls_oews",
            display_name: "US OEWS",
            adapter_key: "bls_oews",
            market_country_code: "US",
            dataset_url: "https://www.bls.gov/oes/tables.htm",
            methodology_url: "https://www.bls.gov/oes/current/oes_tec.htm",
            terms_url: "https://www.bls.gov/developers/termsOfService.htm",
            allowed_fields: ["median_annual"],
            refresh_interval_seconds: 2592000,
            last_success_at: null,
          },
        ],
      },
    });

    await expect(
      salarySourceSync(scheduledRequest("salary_source_sync"), workerContext),
    ).rejects.toMatchObject({ code: "salary_source_adapters_not_activated" });
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "failed",
      p_error_code: "salary_source_adapters_not_activated",
    });
  });

  it("fails closed when the reviewed source registry contains duplicate keys", async () => {
    stubWorkerEnvironment({ SALARY_SOURCE_SYNC_ENABLED: "true" });
    const source = {
      source_key: "us_bls_oews",
      display_name: "US OEWS",
      adapter_key: "bls_oews",
      market_country_code: "US",
      dataset_url: "https://www.bls.gov/oes/tables.htm",
      methodology_url: "https://www.bls.gov/oes/current/oes_tec.htm",
      terms_url: "https://www.bls.gov/developers/termsOfService.htm",
      allowed_fields: ["median_annual"],
      refresh_interval_seconds: 2_592_000,
      last_success_at: null,
    };
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_list_enabled_salary_sources: [source, source],
      },
    });

    await expect(
      salarySourceSync(scheduledRequest("salary_source_sync"), workerContext),
    ).rejects.toMatchObject({ code: "salary_source_registry_invalid" });
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "failed",
      p_error_code: "salary_source_registry_invalid",
    });
  });

  it.each([
    {
      dataset_url: "https://user:secret@www.bls.gov/oes/tables.htm",
    },
    { allowed_fields: ["median_annual", "median_annual"] },
  ])(
    "rejects unsafe or ambiguous source configuration %#",
    async (override) => {
      stubWorkerEnvironment({ SALARY_SOURCE_SYNC_ENABLED: "true" });
      const fetchMock = installWorkerFetch({
        rpc: {
          worker_list_enabled_salary_sources: [
            {
              source_key: "us_bls_oews",
              display_name: "US OEWS",
              adapter_key: "bls_oews",
              market_country_code: "US",
              dataset_url: "https://www.bls.gov/oes/tables.htm",
              methodology_url: "https://www.bls.gov/oes/current/oes_tec.htm",
              terms_url: "https://www.bls.gov/developers/termsOfService.htm",
              allowed_fields: ["median_annual"],
              refresh_interval_seconds: 2_592_000,
              last_success_at: null,
              ...override,
            },
          ],
        },
      });

      await expect(
        salarySourceSync(scheduledRequest("salary_source_sync"), workerContext),
      ).rejects.toMatchObject({ code: "salary_source_registry_invalid" });
      expect(finishBody(fetchMock)).toMatchObject({
        p_status: "failed",
        p_error_code: "salary_source_registry_invalid",
      });
    },
  );
});
