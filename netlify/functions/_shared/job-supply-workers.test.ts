import { afterEach, describe, expect, it, vi } from "vitest";

import applyLinkCheck, { config as applyConfig } from "../apply-link-check.mjs";
import jobDedupeReview, {
  config as dedupeConfig,
} from "../job-dedupe-review.mjs";
import jobLifecycle, { config as lifecycleConfig } from "../job-lifecycle.mjs";
import jobSupplyDispatcher, {
  config as dispatcherConfig,
} from "../job-supply-dispatcher.mjs";
import sourceHealthDigest, {
  config as healthConfig,
} from "../source-health-digest.mjs";
import sourceRightsReview, {
  config as rightsConfig,
} from "../source-rights-review.mjs";
import {
  installWorkerFetch,
  rpcCallBodies,
  scheduledRequest,
  stubWorkerEnvironment,
  workerContext,
  type ScheduledHandler,
} from "./test-support/scheduled-worker";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("job supply schedules", () => {
  it("pins the requested cron contracts", () => {
    expect(dispatcherConfig.schedule).toBe("*/15 * * * *");
    expect(lifecycleConfig.schedule).toBe("*/15 * * * *");
    expect(applyConfig.schedule).toBe("8,23,38,53 * * * *");
    expect(dedupeConfig.schedule).toBe("13 3 * * *");
    expect(healthConfig.schedule).toBe("7 5 * * *");
    expect(rightsConfig.schedule).toBe("19 6 1 * *");
  });

  const workers: Array<{
    task: string;
    handler: ScheduledHandler;
    rpcName: string;
    response: unknown;
  }> = [
    {
      task: "job_supply_dispatcher",
      handler: jobSupplyDispatcher,
      rpcName: "worker_dispatch_job_supply",
      response: {
        due_authorized_sources: 0,
        source_activation_performed: false,
      },
    },
    {
      task: "job_lifecycle",
      handler: jobLifecycle,
      rpcName: "worker_run_job_lifecycle",
      response: { closed_total: 0 },
    },
    {
      task: "job_dedupe_review",
      handler: jobDedupeReview,
      rpcName: "worker_queue_fuzzy_job_duplicates",
      response: { queued_for_review: 0, automatically_merged: 0 },
    },
    {
      task: "source_health_digest",
      handler: sourceHealthDigest,
      rpcName: "worker_build_source_health_digest",
      response: { external_delivery_performed: false },
    },
    {
      task: "source_rights_review",
      handler: sourceRightsReview,
      rpcName: "worker_run_source_rights_review",
      response: { expired_sources: 0, enabled_sources: 0 },
    },
  ];

  it.each(workers)(
    "$task uses tracked idempotent worker runs",
    async (worker) => {
      stubWorkerEnvironment();
      const fetchMock = installWorkerFetch({
        rpc: { [worker.rpcName]: worker.response },
      });
      await expect(
        worker.handler(scheduledRequest(worker.task), workerContext),
      ).resolves.toHaveProperty("status", 200);
      expect(rpcCallBodies(fetchMock, "worker_start")).toHaveLength(1);
      expect(rpcCallBodies(fetchMock, worker.rpcName)).toHaveLength(1);
      expect(rpcCallBodies(fetchMock, "worker_finish")).toHaveLength(1);
    },
  );

  it("apply link checks are tracked even with no claims", async () => {
    stubWorkerEnvironment();
    const fetchMock = installWorkerFetch({
      rpc: { worker_claim_apply_link_checks: [] },
    });
    await applyLinkCheck(scheduledRequest("apply_link_check"), workerContext);
    expect(rpcCallBodies(fetchMock, "worker_finish")[0]).toMatchObject({
      p_status: "succeeded",
      p_summary: { claimed: 0, healthy: 0, broken: 0, indeterminate: 0 },
    });
  });
});
