import { createHash } from "node:crypto";

import type { Job } from "../../../src/lib/jobs/types";

import { fetchAlertJobCatalog } from "./jobs";
import { readSearchConsoleTopicSignals } from "./google-search-console";
import {
  OperationalError,
  getRuntimeBoolean,
  rpc,
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
};

type LinkTarget = {
  source_id: string | null;
  article_id: string | null;
  url: string;
};

type LinkResult = LinkTarget & {
  status: "healthy" | "redirected" | "broken" | "timeout";
  http_status: number | null;
  final_url: string | null;
  error_code: string | null;
};

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
  const jobs = await fetchAlertJobCatalog(signal);
  const snapshot = buildEditorialSnapshot(jobs);
  const id = await rpc<string>(
    "editorial_capture_job_snapshot",
    {
      p_snapshot_key: snapshot.snapshotKey,
      p_source_checked_at: snapshot.checkedAt,
      p_metrics: snapshot.metrics,
      p_source_summary: snapshot.sources,
      p_content_hash: snapshot.contentHash,
    },
    { signal },
  );
  return { id, checkedAt: snapshot.checkedAt, metrics: snapshot.metrics };
}

function safeLink(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".local") ||
    /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
      url.hostname,
    ) ||
    url.hostname === "::1"
  ) {
    return null;
  }
  return url;
}

async function checkLink(target: LinkTarget, signal: AbortSignal) {
  const url = safeLink(target.url);
  if (!url) {
    return {
      ...target,
      status: "broken",
      http_status: null,
      final_url: null,
      error_code: "unsafe_or_invalid_url",
    } satisfies LinkResult;
  }
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "SalaryPadi-Editorial-LinkCheck/1.0" },
      cache: "no-store",
      credentials: "omit",
      redirect: "manual",
      signal: AbortSignal.any([signal, AbortSignal.timeout(4_000)]),
    });
    const redirected = response.status >= 300 && response.status < 400;
    return {
      ...target,
      status: redirected ? "redirected" : response.ok ? "healthy" : "broken",
      http_status: response.status,
      final_url: redirected ? response.headers.get("location") : url.toString(),
      error_code: response.ok || redirected ? null : `http_${response.status}`,
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

async function runNightlyAudit({ signal }: WorkerExecution) {
  const targets = await rpc<LinkTarget[]>(
    "editorial_link_targets",
    {},
    { signal },
  );
  const bounded = targets.slice(0, 50);
  const results: LinkResult[] = [];
  for (let index = 0; index < bounded.length; index += 5) {
    results.push(
      ...(await Promise.all(
        bounded
          .slice(index, index + 5)
          .map((target) => checkLink(target, signal)),
      )),
    );
  }
  const recorded = await rpc<number>(
    "editorial_record_link_checks",
    { p_results: results },
    { signal },
  );
  const audit = await rpc<Record<string, unknown>>(
    "editorial_run_nightly_audit",
    {},
    { signal },
  );
  return { checked_links: recorded, ...audit };
}

async function operation(
  taskKey: EditorialTaskKey,
  execution: WorkerExecution,
) {
  switch (taskKey) {
    case "editorial_job_snapshot": {
      const snapshot = await captureSnapshot(execution.signal);
      return { snapshot_id: snapshot.id, ...snapshot.metrics };
    }
    case "editorial_topic_candidates": {
      const searchConsole = await readSearchConsoleTopicSignals(execution);
      const recorded =
        searchConsole.signals.length > 0
          ? await rpc<number>(
              "editorial_record_topic_signals",
              { p_signals: searchConsole.signals },
              { signal: execution.signal },
            )
          : 0;
      const selection = await rpc<Record<string, unknown>>(
        "editorial_generate_topic_candidates",
        {},
        { signal: execution.signal },
      );
      return {
        ...selection,
        search_console_state: searchConsole.state,
        search_console_signals_recorded: recorded,
      };
    }
    case "editorial_evidence_packs":
      return rpc<Record<string, unknown>>(
        "editorial_prepare_evidence_pack",
        {},
        { signal: execution.signal },
      );
    case "editorial_draft":
      return rpc<Record<string, unknown>>(
        "editorial_prepare_one_draft",
        {},
        { signal: execution.signal },
      );
    case "editorial_preflight":
      return rpc<Record<string, unknown>>(
        "editorial_run_preflight_checks",
        {},
        { signal: execution.signal },
      );
    case "editorial_queue":
      return rpc<Record<string, unknown>>(
        "editorial_queue_ready",
        {},
        { signal: execution.signal },
      );
    case "editorial_publish":
      return rpc<Record<string, unknown>>(
        "editorial_publish_due",
        {},
        { signal: execution.signal },
      );
    case "editorial_live_blocks": {
      const snapshot = await captureSnapshot(execution.signal);
      return rpc<Record<string, unknown>>(
        "editorial_revalidate_live_blocks",
        {
          p_snapshot_id: snapshot.id,
          p_checked_at: snapshot.checkedAt,
          p_active_job_count: snapshot.metrics.indexable_jobs,
        },
        { signal: execution.signal },
      );
    }
    case "editorial_nightly_audit":
      return runNightlyAudit(execution);
    case "editorial_weekly_audit":
      return rpc<Record<string, unknown>>(
        "editorial_run_weekly_audit",
        {},
        { signal: execution.signal },
      );
    case "editorial_monthly_audit":
      return rpc<Record<string, unknown>>(
        "editorial_run_monthly_audit",
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
    await rpc(
      "editorial_record_failure",
      {
        p_task_key: taskKey,
        p_run_key: runKey,
        p_error_code: errorCode,
        p_summary: {},
      },
      { signal: execution.signal },
    ).catch(() => undefined);
    throw reason;
  }
}
