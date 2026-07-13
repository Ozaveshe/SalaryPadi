import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXIT_CODES = Object.freeze({
  ok: 0,
  usage: 2,
  network: 10,
  http: 11,
  invalid_payload: 12,
  health_degraded: 20,
  worker_missing: 21,
  worker_unhealthy: 22,
  worker_never_run: 23,
  deploy_freshness: 24,
  route: 30,
});

export const REQUIRED_WORKERS = Object.freeze([
  "afrotools_catalog_sync",
  "alert_delivery",
  "ats_source_sync",
  "currency_rates",
  "job_source_sync",
  "operations_maintenance",
  "editorial_job_snapshot",
  "editorial_topic_candidates",
  "editorial_draft",
  "editorial_preflight",
  "editorial_queue",
  "editorial_publish",
  "editorial_live_blocks",
  "editorial_nightly_audit",
  "editorial_weekly_audit",
]);

export const VERIFIED_ROUTES = Object.freeze([
  "/",
  "/jobs",
  "/insights",
  "/feed.xml",
]);

const USAGE = [
  "Usage:",
  "  node scripts/verify-production-freshness.mjs [--json]",
  "  node scripts/verify-production-freshness.mjs --expect-deploy-freshness <ISO-8601 UTC timestamp> [--json]",
].join("\n");

class UsageError extends Error {}

const UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|\+00:00)$/i;

function parseTimestamp(value, label) {
  if (typeof value === "string" && !UTC_TIMESTAMP.test(value.trim())) {
    throw new UsageError(`${label} must include an explicit UTC offset.`);
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new UsageError(`${label} requires an ISO-8601 timestamp.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new UsageError(`${label} must be a valid ISO-8601 timestamp.`);
  }
  return new Date(timestamp).toISOString();
}

function normalizeOrigin(rawOrigin) {
  let url;
  try {
    url = new URL(rawOrigin);
  } catch {
    throw new UsageError("SALARYPADI_ORIGIN must be a valid HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new UsageError("SALARYPADI_ORIGIN must be a bare HTTPS origin.");
  }
  return url.origin;
}

export function parseCliArgs(argv) {
  let json = false;
  let deployStartedAt = null;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument?.startsWith("--expect-deploy-freshness=")) {
      if (deployStartedAt) {
        throw new UsageError("--expect-deploy-freshness may be supplied once.");
      }
      deployStartedAt = parseTimestamp(
        argument.slice("--expect-deploy-freshness=".length),
        "--expect-deploy-freshness",
      );
      continue;
    }
    if (argument === "--expect-deploy-freshness") {
      if (deployStartedAt) {
        throw new UsageError("--expect-deploy-freshness may be supplied once.");
      }
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new UsageError(
          "--expect-deploy-freshness requires the deploy UTC timestamp.",
        );
      }
      deployStartedAt = parseTimestamp(value, "--expect-deploy-freshness");
      index += 1;
      continue;
    }
    throw new UsageError(`Unknown argument: ${argument}`);
  }

  return { json, deployStartedAt, help };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addCheck(checks, check) {
  checks.push({ exit_code: EXIT_CODES.ok, ...check });
}

function failedCheck(id, summary, exitCode) {
  return { id, status: "fail", summary, exit_code: exitCode };
}

function skippedCheck(id, summary) {
  return { id, status: "skip", summary, exit_code: EXIT_CODES.ok };
}

function passedCheck(id, summary) {
  return { id, status: "pass", summary, exit_code: EXIT_CODES.ok };
}

function requestFailureSummary(error) {
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return "request timed out";
  }
  return "request failed";
}

async function request(fetchImpl, origin, pathname, accept, timeoutSignal) {
  try {
    return {
      response: await fetchImpl(new URL(pathname, origin), {
        headers: { Accept: accept },
        redirect: "error",
        signal: timeoutSignal(10_000),
      }),
      error: null,
    };
  } catch (error) {
    return { response: null, error };
  }
}

async function readJson(response) {
  try {
    return { payload: await response.json(), error: null };
  } catch (error) {
    return { payload: null, error };
  }
}

function workerMap(payload) {
  const rows = payload?.checks?.workers;
  if (!Array.isArray(rows)) return null;
  return new Map(
    rows.flatMap((worker) =>
      isRecord(worker) && typeof worker.task_key === "string"
        ? [[worker.task_key, worker]]
        : [],
    ),
  );
}

function checkWorker(taskKey, worker, deployStartedAt) {
  const id = `worker:${taskKey}`;
  if (!worker) {
    return failedCheck(
      id,
      "worker health row is missing",
      EXIT_CODES.worker_missing,
    );
  }
  if (!worker.last_started_at) {
    return failedCheck(id, "worker has never run", EXIT_CODES.worker_never_run);
  }
  const startedAt = Date.parse(worker.last_started_at);
  if (!Number.isFinite(startedAt)) {
    return failedCheck(
      id,
      "last_started_at is invalid",
      EXIT_CODES.invalid_payload,
    );
  }
  if (worker.freshness !== "healthy") {
    return failedCheck(
      id,
      `freshness=${String(worker.freshness)}`,
      EXIT_CODES.worker_unhealthy,
    );
  }
  if (deployStartedAt && startedAt <= Date.parse(deployStartedAt)) {
    return failedCheck(
      id,
      `last_started_at=${new Date(startedAt).toISOString()} is not newer than deploy=${deployStartedAt}`,
      EXIT_CODES.deploy_freshness,
    );
  }
  return passedCheck(
    id,
    `freshness=healthy last_started_at=${new Date(startedAt).toISOString()}`,
  );
}

export async function verifyProductionFreshness({
  origin = "https://salarypadi.com",
  deployStartedAt = null,
  fetchImpl = fetch,
  now = () => new Date(),
  timeoutSignal = (timeoutMs) => AbortSignal.timeout(timeoutMs),
} = {}) {
  const normalizedOrigin = normalizeOrigin(origin);
  const normalizedDeployStartedAt = deployStartedAt
    ? parseTimestamp(deployStartedAt, "--expect-deploy-freshness")
    : null;
  const checks = [];
  let workers = null;

  const healthRequest = await request(
    fetchImpl,
    normalizedOrigin,
    "/api/health",
    "application/json",
    timeoutSignal,
  );
  if (healthRequest.error) {
    addCheck(
      checks,
      failedCheck(
        "health",
        requestFailureSummary(healthRequest.error),
        EXIT_CODES.network,
      ),
    );
  } else {
    const healthResponse = healthRequest.response;
    const parsed = await readJson(healthResponse);
    if (parsed.error) {
      addCheck(
        checks,
        failedCheck(
          "health",
          healthResponse.ok
            ? "response was not valid JSON"
            : `HTTP ${healthResponse.status}`,
          healthResponse.ok ? EXIT_CODES.invalid_payload : EXIT_CODES.http,
        ),
      );
    } else if (!isRecord(parsed.payload)) {
      addCheck(
        checks,
        failedCheck(
          "health",
          "response payload is invalid",
          EXIT_CODES.invalid_payload,
        ),
      );
    } else {
      workers = workerMap(parsed.payload);
      if (parsed.payload.status !== "ok") {
        addCheck(
          checks,
          failedCheck(
            "health",
            `status=${String(parsed.payload.status)} HTTP ${healthResponse.status}`,
            EXIT_CODES.health_degraded,
          ),
        );
      } else if (!healthResponse.ok) {
        addCheck(
          checks,
          failedCheck(
            "health",
            `HTTP ${healthResponse.status}`,
            EXIT_CODES.http,
          ),
        );
      } else if (!workers) {
        addCheck(
          checks,
          failedCheck(
            "health",
            "checks.workers is invalid",
            EXIT_CODES.invalid_payload,
          ),
        );
      } else {
        addCheck(
          checks,
          passedCheck("health", `status=ok workers=${workers.size}`),
        );
      }
    }
  }

  for (const taskKey of REQUIRED_WORKERS) {
    addCheck(
      checks,
      workers
        ? checkWorker(taskKey, workers.get(taskKey), normalizedDeployStartedAt)
        : skippedCheck(`worker:${taskKey}`, "health payload unavailable"),
    );
  }

  for (const pathname of VERIFIED_ROUTES) {
    const routeRequest = await request(
      fetchImpl,
      normalizedOrigin,
      pathname,
      pathname.endsWith(".xml") ? "application/rss+xml" : "text/html",
      timeoutSignal,
    );
    if (routeRequest.error) {
      addCheck(
        checks,
        failedCheck(
          `route:${pathname}`,
          requestFailureSummary(routeRequest.error),
          EXIT_CODES.network,
        ),
      );
    } else if (!routeRequest.response.ok) {
      addCheck(
        checks,
        failedCheck(
          `route:${pathname}`,
          `HTTP ${routeRequest.response.status}`,
          EXIT_CODES.route,
        ),
      );
    } else {
      addCheck(
        checks,
        passedCheck(
          `route:${pathname}`,
          `HTTP ${routeRequest.response.status}`,
        ),
      );
      await routeRequest.response.body?.cancel().catch(() => undefined);
    }
  }

  const failed = checks.filter((check) => check.status === "fail");
  const firstFailure = failed[0];
  return {
    status: failed.length === 0 ? "fresh" : "failed",
    origin: normalizedOrigin,
    mode: normalizedDeployStartedAt ? "post_deploy" : "scheduled",
    deploy_started_at: normalizedDeployStartedAt,
    checked_at: now().toISOString(),
    exit_code: firstFailure?.exit_code ?? EXIT_CODES.ok,
    required_workers: [...REQUIRED_WORKERS],
    verified_routes: [...VERIFIED_ROUTES],
    checks,
  };
}

export function formatHumanResult(result) {
  const lines = result.checks.map(
    (check) => `${check.status.toUpperCase()} ${check.id} ${check.summary}`,
  );
  const counts = {
    pass: result.checks.filter((check) => check.status === "pass").length,
    fail: result.checks.filter((check) => check.status === "fail").length,
    skip: result.checks.filter((check) => check.status === "skip").length,
  };
  lines.push(
    `RESULT status=${result.status} exit_code=${result.exit_code} pass=${counts.pass} fail=${counts.fail} skip=${counts.skip}`,
  );
  return lines.join("\n");
}

function usageResult(message) {
  return {
    status: "failed",
    origin: null,
    mode: null,
    deploy_started_at: null,
    checked_at: new Date().toISOString(),
    exit_code: EXIT_CODES.usage,
    required_workers: [...REQUIRED_WORKERS],
    verified_routes: [...VERIFIED_ROUTES],
    checks: [failedCheck("usage", message, EXIT_CODES.usage)],
  };
}

export async function runCli({
  argv = process.argv.slice(2),
  environment = process.env,
  write = (value) => console.log(value),
  verify = verifyProductionFreshness,
} = {}) {
  let options;
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    const result = usageResult(
      error instanceof Error ? error.message : "Invalid arguments.",
    );
    write(
      argv.includes("--json")
        ? JSON.stringify(result)
        : `${formatHumanResult(result)}\n${USAGE}`,
    );
    return result.exit_code;
  }

  if (options.help) {
    write(USAGE);
    return EXIT_CODES.ok;
  }

  let result;
  try {
    result = await verify({
      origin: environment.SALARYPADI_ORIGIN ?? "https://salarypadi.com",
      deployStartedAt: options.deployStartedAt,
    });
  } catch (error) {
    result = usageResult(
      error instanceof Error ? error.message : "Freshness verification failed.",
    );
  }
  write(options.json ? JSON.stringify(result) : formatHumanResult(result));
  return result.exit_code;
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
