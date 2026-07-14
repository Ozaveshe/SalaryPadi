import { createHash } from "node:crypto";
import { z } from "zod";

import type { Job } from "../../../src/lib/jobs/types";

import {
  defaultPublicHttpsResolve,
  requestPinnedHttpsHead,
  resolvePublicHttpsDestination,
  type PublicHttpsResolver,
} from "./apply-link-check";
import { fetchAlertJobCatalog } from "./jobs";
import { readSearchConsoleTopicSignals } from "./google-search-console";
import {
  OperationalError,
  getRuntimeBoolean,
  observeSecondaryOperation,
  rpc,
  rpcNonnegativeIntegerResultSchema,
  rpcSummaryResultSchema,
  rpcUuidResultSchema,
  RPC_TIMEOUT_MS,
  type WorkerExecution,
  workerSucceeded,
  workerSkipped,
} from "./runtime";

export type EditorialTaskKey =
  | "editorial_job_snapshot"
  | "editorial_topic_candidates"
  | "editorial_evidence_packs"
  | "editorial_draft"
  | "editorial_preflight"
  | "editorial_queue"
  | "editorial_publish"
  | "editorial_live_blocks"
  | "editorial_nightly_audit"
  | "editorial_weekly_audit"
  | "editorial_monthly_audit";

type SnapshotMetrics = {
  active_jobs: number;
  indexable_jobs: number;
  remote_jobs: number;
  nigeria_eligible: number;
  nigeria_unclear: number;
  jobs_with_deadlines: number;
  jobs_without_deadlines: number;
};

type CapturedSnapshot = {
  id: string;
  checkedAt: string;
  metrics: SnapshotMetrics;
  catalogState: "ready" | "degraded";
  catalogIssueCodes: string[];
};

export type LinkTarget = {
  source_id: string | null;
  article_id: string | null;
  url: string;
};

export type LinkResult = LinkTarget & {
  status: "healthy" | "redirected" | "broken" | "timeout";
  http_status: number | null;
  final_url: string | null;
  error_code: string | null;
};

const linkTargetsResultSchema = z
  .array(
    z
      .object({
        source_id: z.string().uuid().nullable(),
        article_id: z.string().uuid().nullable(),
        url: z.string().url().max(2_048),
      })
      .strict(),
  )
  .max(50)
  .superRefine((targets, context) => {
    const identities = new Set<string>();
    for (const [index, target] of targets.entries()) {
      if ((target.source_id === null) === (target.article_id === null)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Editorial link targets must have exactly one owner.",
        });
      }
      const identity = `${target.source_id ?? ""}:${target.article_id ?? ""}:${target.url}`;
      if (identities.has(identity)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Editorial link targets must be unique.",
        });
      }
      identities.add(identity);
    }
  });

const EDITORIAL_NIGHTLY_DURABLE_RESERVE_MS = RPC_TIMEOUT_MS * 2 + 1_000;

function isOpen(job: Job, now: number) {
  return (
    job.status === "open" &&
    (!job.validThrough || Date.parse(job.validThrough) > now)
  );
}

function sourceSummary(jobs: Job[]) {
  const rows: Record<string, { count: number; last_checked_at: string }> = {};
  for (const job of jobs) {
    const key = job.source.id;
    const current = rows[key];
    if (!current) {
      rows[key] = { count: 1, last_checked_at: job.lastCheckedAt };
      continue;
    }
    current.count += 1;
    if (Date.parse(job.lastCheckedAt) > Date.parse(current.last_checked_at)) {
      current.last_checked_at = job.lastCheckedAt;
    }
  }
  return rows;
}

export function buildEditorialSnapshot(jobs: Job[], now = new Date()) {
  const active = jobs.filter((job) => isOpen(job, now.valueOf()));
  const metrics: SnapshotMetrics = {
    active_jobs: active.length,
    indexable_jobs: active.filter((job) => job.source.canIndex).length,
    remote_jobs: active.filter((job) => job.workMode === "remote").length,
    nigeria_eligible: active.filter(
      (job) => job.eligibility.nigeria === "eligible",
    ).length,
    nigeria_unclear: active.filter(
      (job) => job.eligibility.nigeria === "unclear",
    ).length,
    jobs_with_deadlines: active.filter((job) => Boolean(job.validThrough))
      .length,
    jobs_without_deadlines: active.filter((job) => !job.validThrough).length,
  };
  const sources = sourceSummary(active);
  const checkedAt = active.reduce(
    (latest, job) =>
      Date.parse(job.lastCheckedAt) > Date.parse(latest)
        ? job.lastCheckedAt
        : latest,
    now.toISOString(),
  );
  const snapshotKey = `${now.toISOString().slice(0, 16)}Z`;
  const contentHash = createHash("sha256")
    .update(JSON.stringify({ metrics, sources, checkedAt }))
    .digest("hex");
  return { snapshotKey, checkedAt, metrics, sources, contentHash };
}

async function captureSnapshot(signal: AbortSignal): Promise<CapturedSnapshot> {
  const catalog = await fetchAlertJobCatalog(signal);
  const snapshot = buildEditorialSnapshot(catalog.jobs);
  const id = await rpc(
    "editorial_capture_job_snapshot",
    rpcUuidResultSchema,
    {
      p_snapshot_key: snapshot.snapshotKey,
      p_source_checked_at: snapshot.checkedAt,
      p_metrics: snapshot.metrics,
      p_source_summary: snapshot.sources,
      p_content_hash: snapshot.contentHash,
    },
    { signal },
  );
  return {
    id,
    checkedAt: snapshot.checkedAt,
    metrics: snapshot.metrics,
    catalogState: catalog.state,
    catalogIssueCodes: catalog.issues.map((issue) => issue.code),
  };
}

type EditorialLinkDependencies = {
  resolve?: PublicHttpsResolver;
  head?: typeof requestPinnedHttpsHead;
};

export async function checkEditorialLink(
  target: LinkTarget,
  signal: AbortSignal,
  dependencies: EditorialLinkDependencies = {},
) {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(4_000)]);
  const resolve = dependencies.resolve ?? defaultPublicHttpsResolve;
  const allowed = await resolvePublicHttpsDestination(
    target.url,
    resolve,
    requestSignal,
  );
  if (allowed.status !== "allowed") {
    return {
      ...target,
      status: allowed.status === "deadline_exceeded" ? "timeout" : "broken",
      http_status: null,
      final_url: null,
      error_code:
        allowed.status === "unsafe"
          ? "unsafe_or_invalid_url"
          : allowed.status === "deadline_exceeded"
            ? "link_request_timeout"
            : "link_resolution_failed",
    } satisfies LinkResult;
  }
  const { destination, address } = allowed;
  try {
    const response = await (dependencies.head ?? requestPinnedHttpsHead)(
      destination,
      address,
      requestSignal,
    );
    const redirected = response.status >= 300 && response.status < 400;
    if (redirected) {
      if (!response.location) {
        return {
          ...target,
          status: "broken",
          http_status: response.status,
          final_url: null,
          error_code: "redirect_location_missing",
        } satisfies LinkResult;
      }
      let redirectUrl: string;
      try {
        redirectUrl = new URL(response.location, destination).toString();
      } catch {
        return {
          ...target,
          status: "broken",
          http_status: response.status,
          final_url: null,
          error_code: "redirect_location_invalid",
        } satisfies LinkResult;
      }
      const redirectDestination = await resolvePublicHttpsDestination(
        redirectUrl,
        resolve,
        requestSignal,
      );
      if (redirectDestination.status !== "allowed") {
        return {
          ...target,
          status: "broken",
          http_status: response.status,
          final_url: null,
          error_code:
            redirectDestination.status === "deadline_exceeded"
              ? "redirect_resolution_timeout"
              : redirectDestination.status === "unresolved"
                ? "redirect_resolution_failed"
                : "unsafe_redirect_location",
        } satisfies LinkResult;
      }
      return {
        ...target,
        status: "redirected",
        http_status: response.status,
        final_url: redirectDestination.destination.toString(),
        error_code: null,
      } satisfies LinkResult;
    }
    return {
      ...target,
      status:
        response.status >= 200 && response.status < 300 ? "healthy" : "broken",
      http_status: response.status,
      final_url: destination.toString(),
      error_code:
        response.status >= 200 && response.status < 300
          ? null
          : `http_${response.status}`,
    } satisfies LinkResult;
  } catch (error) {
    return {
      ...target,
      status:
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
          ? "timeout"
          : "broken",
      http_status: null,
      final_url: null,
      error_code: "link_request_failed",
    } satisfies LinkResult;
  }
}

async function runNightlyAudit({ signal, remainingMs }: WorkerExecution) {
  const targets = await rpc(
    "editorial_link_targets",
    linkTargetsResultSchema,
    {},
    { signal },
  );
  const results: LinkResult[] = [];
  for (let index = 0; index < targets.length; index += 5) {
    if (remainingMs() < EDITORIAL_NIGHTLY_DURABLE_RESERVE_MS) break;
    results.push(
      ...(await Promise.all(
        targets
          .slice(index, index + 5)
          .map((target) => checkEditorialLink(target, signal)),
      )),
    );
  }
  const recorded = await rpc(
    "editorial_record_link_checks",
    rpcNonnegativeIntegerResultSchema,
    { p_results: results },
    { signal },
  );
  if (recorded !== results.length) {
    throw new OperationalError("editorial_link_checks_ack_mismatch", {
      expected_count: results.length,
      recorded_count: recorded,
    });
  }
  const audit = await rpc(
    "editorial_run_nightly_audit",
    rpcSummaryResultSchema,
    {},
    { signal },
  );
  const deferredLinks = targets.length - results.length;
  if (deferredLinks > 0) {
    throw new OperationalError("editorial_link_check_time_budget_exhausted", {
      target_count: targets.length,
      checked_links: recorded,
      deferred_links: deferredLinks,
    });
  }
  return { target_count: targets.length, checked_links: recorded, ...audit };
}

async function operation(
  taskKey: EditorialTaskKey,
  execution: WorkerExecution,
) {
  switch (taskKey) {
    case "editorial_job_snapshot": {
      const snapshot = await captureSnapshot(execution.signal);
      return {
        snapshot_id: snapshot.id,
        catalog_state: snapshot.catalogState,
        catalog_issue_codes: snapshot.catalogIssueCodes,
        ...snapshot.metrics,
      };
    }
    case "editorial_topic_candidates": {
      const searchConsole = await readSearchConsoleTopicSignals(execution);
      const recorded =
        searchConsole.signals.length > 0
          ? await rpc(
              "editorial_record_topic_signals",
              rpcNonnegativeIntegerResultSchema,
              { p_signals: searchConsole.signals },
              { signal: execution.signal },
            )
          : 0;
      if (recorded !== searchConsole.signals.length) {
        throw new OperationalError("editorial_topic_signals_ack_mismatch", {
          expected_count: searchConsole.signals.length,
          recorded_count: recorded,
        });
      }
      const selection = await rpc(
        "editorial_generate_topic_candidates",
        rpcSummaryResultSchema,
        {},
        { signal: execution.signal },
      );
      return {
        ...selection,
        search_console_state: searchConsole.state,
        search_console_issue_codes: searchConsole.issueCodes,
        search_console_signals_recorded: recorded,
      };
    }
    case "editorial_evidence_packs":
      return rpc(
        "editorial_prepare_evidence_pack",
        rpcSummaryResultSchema,
        {},
        { signal: execution.signal },
      );
    case "editorial_draft":
      return rpc(
        "editorial_prepare_one_draft",
        rpcSummaryResultSchema,
        {},
        { signal: execution.signal },
      );
    case "editorial_preflight":
      return rpc(
        "editorial_run_preflight_checks",
        rpcSummaryResultSchema,
        {},
        { signal: execution.signal },
      );
    case "editorial_queue":
      return rpc(
        "editorial_queue_ready",
        rpcSummaryResultSchema,
        {},
        { signal: execution.signal },
      );
    case "editorial_publish":
      return rpc(
        "editorial_publish_due",
        rpcSummaryResultSchema,
        {},
        { signal: execution.signal },
      );
    case "editorial_live_blocks": {
      const snapshot = await captureSnapshot(execution.signal);
      const result = await rpc(
        "editorial_revalidate_live_blocks",
        rpcSummaryResultSchema,
        {
          p_snapshot_id: snapshot.id,
          p_checked_at: snapshot.checkedAt,
          p_active_job_count: snapshot.metrics.indexable_jobs,
        },
        { signal: execution.signal },
      );
      return {
        ...result,
        catalog_state: snapshot.catalogState,
        catalog_issue_codes: snapshot.catalogIssueCodes,
      };
    }
    case "editorial_nightly_audit":
      return runNightlyAudit(execution);
    case "editorial_weekly_audit":
      return rpc(
        "editorial_run_weekly_audit",
        rpcSummaryResultSchema,
        {},
        { signal: execution.signal },
      );
    case "editorial_monthly_audit":
      return rpc(
        "editorial_run_monthly_audit",
        rpcSummaryResultSchema,
        {},
        { signal: execution.signal },
      );
  }
}

export async function runEditorialOperation(
  taskKey: EditorialTaskKey,
  execution: WorkerExecution,
) {
  if (!getRuntimeBoolean("EDITORIAL_AUTOMATION_ENABLED", false)) {
    return workerSkipped("editorial_automation_disabled");
  }
  try {
    return workerSucceeded(await operation(taskKey, execution));
  } catch (reason) {
    const errorCode =
      reason instanceof OperationalError
        ? reason.code
        : "editorial_task_failed";
    const runKey = new Date().toISOString().slice(0, 16);
    const secondaryFailure = await observeSecondaryOperation(
      "editorial_record_failure",
      rpc(
        "editorial_record_failure",
        rpcUuidResultSchema,
        {
          p_task_key: taskKey,
          p_run_key: runKey,
          p_error_code: errorCode,
          p_summary: reason instanceof OperationalError ? reason.summary : {},
        },
        { signal: execution.signal },
      ),
    );
    throw new OperationalError(errorCode, {
      ...(reason instanceof OperationalError ? reason.summary : {}),
      failure_evidence_state: secondaryFailure ? "unavailable" : "recorded",
      secondary_failure_codes: secondaryFailure ? [secondaryFailure.code] : [],
    });
  }
}
