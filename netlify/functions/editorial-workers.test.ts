import { afterEach, describe, expect, it, vi } from "vitest";

import editorialDraft from "./editorial-draft.mjs";
import editorialJobSnapshot from "./editorial-job-snapshot.mjs";
import editorialLiveBlocks from "./editorial-live-blocks.mjs";
import editorialNightlyAudit from "./editorial-nightly-audit.mjs";
import editorialPreflight from "./editorial-preflight.mjs";
import editorialPublish from "./editorial-publish.mjs";
import editorialQueue from "./editorial-queue.mjs";
import editorialTopicCandidates from "./editorial-topic-candidates.mjs";
import editorialWeeklyAudit from "./editorial-weekly-audit.mjs";
import {
  installWorkerFetch,
  nonBookkeepingUrls,
  rpcCallBodies,
  scheduledRequest,
  stubWorkerEnvironment,
  workerContext,
  type ScheduledHandler,
  type WorkerFetchMock,
} from "./test-support/scheduled-worker";

type EditorialWorkerCase = {
  task: string;
  handler: ScheduledHandler;
  operationRpc?: string;
  expectedSummary: Record<string, unknown>;
  kind?: "snapshot" | "live_blocks" | "nightly";
};

const emptyMetrics = {
  active_jobs: 0,
  indexable_jobs: 0,
  remote_jobs: 0,
  nigeria_eligible: 0,
  nigeria_unclear: 0,
  jobs_with_deadlines: 0,
  jobs_without_deadlines: 0,
};

const snapshotId = "50000000-0000-4000-8000-000000000011";

const workers: EditorialWorkerCase[] = [
  {
    task: "editorial_job_snapshot",
    handler: editorialJobSnapshot,
    kind: "snapshot",
    expectedSummary: { snapshot_id: snapshotId, ...emptyMetrics },
  },
  {
    task: "editorial_topic_candidates",
    handler: editorialTopicCandidates,
    operationRpc: "editorial_generate_topic_candidates",
    expectedSummary: { generated: 2 },
  },
  {
    task: "editorial_draft",
    handler: editorialDraft,
    operationRpc: "editorial_prepare_one_draft",
    expectedSummary: { drafted: 1 },
  },
  {
    task: "editorial_preflight",
    handler: editorialPreflight,
    operationRpc: "editorial_run_preflight_checks",
    expectedSummary: { checked: 1 },
  },
  {
    task: "editorial_queue",
    handler: editorialQueue,
    operationRpc: "editorial_queue_ready",
    expectedSummary: { queued: 1 },
  },
  {
    task: "editorial_publish",
    handler: editorialPublish,
    operationRpc: "editorial_publish_due",
    expectedSummary: { published: 1 },
  },
  {
    task: "editorial_live_blocks",
    handler: editorialLiveBlocks,
    kind: "live_blocks",
    expectedSummary: { refreshed: 1 },
  },
  {
    task: "editorial_nightly_audit",
    handler: editorialNightlyAudit,
    kind: "nightly",
    expectedSummary: { checked_links: 0, broken_links: 0 },
  },
  {
    task: "editorial_weekly_audit",
    handler: editorialWeeklyAudit,
    operationRpc: "editorial_run_weekly_audit",
    expectedSummary: { audited: 1 },
  },
];

function finishBody(fetchMock: WorkerFetchMock) {
  const bodies = rpcCallBodies(fetchMock, "worker_finish");
  expect(bodies).toHaveLength(1);
  return bodies[0];
}

function installSuccessfulFetch(worker: EditorialWorkerCase) {
  const rpc: Record<string, unknown | Response> = {};
  let fallback:
    ((url: URL, init: RequestInit | undefined) => Response) | undefined;

  if (worker.kind === "snapshot" || worker.kind === "live_blocks") {
    rpc.editorial_capture_job_snapshot = snapshotId;
    fallback = (url) => {
      if (url.pathname === "/rest/v1/jobs") return Response.json([]);
      throw new Error(`Unexpected editorial snapshot request: ${url}`);
    };
  }
  if (worker.kind === "live_blocks") {
    rpc.editorial_revalidate_live_blocks = worker.expectedSummary;
  } else if (worker.kind === "nightly") {
    rpc.editorial_link_targets = [];
    rpc.editorial_record_link_checks = 0;
    rpc.editorial_run_nightly_audit = { broken_links: 0 };
  } else if (worker.operationRpc) {
    rpc[worker.operationRpc] = worker.expectedSummary;
  }

  return installWorkerFetch({ rpc, fallback });
}

function installFailingFetch(worker: EditorialWorkerCase) {
  const rpc: Record<string, unknown | Response> = {
    editorial_record_failure: null,
  };
  let fallback:
    ((url: URL, init: RequestInit | undefined) => Response) | undefined;

  if (worker.kind === "snapshot" || worker.kind === "live_blocks") {
    fallback = (url) => {
      if (url.pathname === "/rest/v1/jobs") {
        return new Response(null, { status: 503 });
      }
      throw new Error(`Unexpected editorial failure request: ${url}`);
    };
  } else {
    const firstRpc =
      worker.kind === "nightly"
        ? "editorial_link_targets"
        : worker.operationRpc;
    if (!firstRpc) throw new Error(`Missing operation RPC for ${worker.task}`);
    rpc[firstRpc] = new Response(null, { status: 503 });
  }

  return installWorkerFetch({ rpc, fallback });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("editorial scheduled-worker emergency gate", () => {
  it.each(workers)(
    "$task records a safe skip without a data or provider call",
    async ({ task, handler }) => {
      stubWorkerEnvironment({ EDITORIAL_AUTOMATION_ENABLED: "false" });
      const fetchMock = installWorkerFetch();

      const response = await handler(scheduledRequest(task), workerContext);

      expect(response.status).toBe(200);
      expect(nonBookkeepingUrls(fetchMock)).toEqual([]);
      expect(finishBody(fetchMock)).toMatchObject({
        p_status: "skipped",
        p_summary: { reason: "editorial_automation_disabled" },
        p_error_code: null,
      });
    },
  );
});

describe("editorial scheduled-worker deduplication", () => {
  it.each(workers)(
    "$task returns 204 before its operation runs",
    async ({ task, handler }) => {
      stubWorkerEnvironment({ EDITORIAL_AUTOMATION_ENABLED: "true" });
      const fetchMock = installWorkerFetch({ shouldRun: false });

      const response = await handler(scheduledRequest(task), workerContext);

      expect(response.status).toBe(204);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(rpcCallBodies(fetchMock, "worker_finish")).toEqual([]);
    },
  );
});

describe("editorial scheduled-worker successful runs", () => {
  it.each(workers)("$task records its operation summary", async (worker) => {
    stubWorkerEnvironment({
      EDITORIAL_AUTOMATION_ENABLED: "true",
      REMOTIVE_SOURCE_ENABLED: "false",
    });
    const fetchMock = installSuccessfulFetch(worker);

    const response = await worker.handler(
      scheduledRequest(worker.task),
      workerContext,
    );

    expect(response.status).toBe(200);
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "succeeded",
      p_summary: worker.expectedSummary,
      p_error_code: null,
    });
  });
});

describe("editorial scheduled-worker failures", () => {
  it.each(workers)(
    "$task records the operation error code before rejecting",
    async (worker) => {
      stubWorkerEnvironment({
        EDITORIAL_AUTOMATION_ENABLED: "true",
        REMOTIVE_SOURCE_ENABLED: "false",
      });
      const fetchMock = installFailingFetch(worker);
      const expectedCode =
        worker.kind === "snapshot" || worker.kind === "live_blocks"
          ? "database_jobs_503"
          : "supabase_rpc_503";

      await expect(
        worker.handler(scheduledRequest(worker.task), workerContext),
      ).rejects.toMatchObject({ code: expectedCode });
      expect(finishBody(fetchMock)).toMatchObject({
        p_status: "failed",
        p_error_code: expectedCode,
      });
      expect(rpcCallBodies(fetchMock, "editorial_record_failure")).toEqual([
        expect.objectContaining({
          p_task_key: worker.task,
          p_error_code: expectedCode,
        }),
      ]);
    },
  );
});
