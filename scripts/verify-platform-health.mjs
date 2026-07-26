#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Platform-health gate for the production acceptance workflow.
 *
 * Customer-surface acceptance and operational health are separate concerns — a
 * page can read perfectly on a degraded platform — but the workflow as a whole
 * must not report a healthy release while /api/health is returning 503. On
 * commit 53318fa acceptance went green while every worker-health row was
 * invisible and the jobs canary was failing on the same commit.
 *
 * Worker health GATES this job. Source-supply capacity is reported honestly but
 * does not gate it: `authorized_daily_capacity` is a rights state that no
 * amount of correct worker execution can raise, and the production-freshness
 * workflow asserts it separately with its own exit code.
 *
 * Extracted from the workflow YAML so the decision is unit-testable rather than
 * living only as shell.
 */

export const PLATFORM_HEALTH_EXIT_CODES = Object.freeze({
  ok: 0,
  usage: 2,
  network: 10,
  http: 11,
  invalid_payload: 12,
  worker_health_incomplete: 20,
  worker_unhealthy: 21,
});

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

/**
 * Decides whether a deployed platform is healthy enough to report a release.
 *
 * Returns the gating verdict plus the separately-reported supply state, so a
 * caller can print both without conflating them.
 */
export function evaluatePlatformHealth(payload, httpStatus) {
  const failures = [];

  if (!isRecord(payload) || !isRecord(payload.checks)) {
    return {
      ok: false,
      exitCode: PLATFORM_HEALTH_EXIT_CODES.invalid_payload,
      failures: ["health payload is not a readable object"],
      workerHealthComplete: false,
      missingWorkers: [],
      unhealthyWorkers: [],
      supply: { ready: false, state: "unknown", capacity: 0, target: 0 },
    };
  }

  const checks = payload.checks;
  const workerHealthComplete = checks.worker_health_complete === true;
  const missingWorkers = stringList(checks.missing_workers);
  const unhealthyWorkers = stringList(checks.unhealthy_workers);
  const supplyRecord = isRecord(checks.job_supply) ? checks.job_supply : {};
  const supply = {
    ready: checks.job_supply_ready === true,
    state:
      typeof supplyRecord.state === "string" ? supplyRecord.state : "unknown",
    capacity: Number.isFinite(supplyRecord.authorized_daily_capacity)
      ? supplyRecord.authorized_daily_capacity
      : 0,
    target: Number.isFinite(supplyRecord.target_daily_new_canonical)
      ? supplyRecord.target_daily_new_canonical
      : 0,
  };

  let exitCode = PLATFORM_HEALTH_EXIT_CODES.ok;

  if (httpStatus !== 200) {
    failures.push(`/api/health returned HTTP ${httpStatus} (expected 200)`);
    exitCode = PLATFORM_HEALTH_EXIT_CODES.http;
  }
  if (!workerHealthComplete) {
    failures.push(
      `worker_health_complete is false (missing=${JSON.stringify(
        missingWorkers,
      )})`,
    );
    if (exitCode === PLATFORM_HEALTH_EXIT_CODES.ok) {
      exitCode = PLATFORM_HEALTH_EXIT_CODES.worker_health_incomplete;
    }
  }
  if (unhealthyWorkers.length > 0) {
    failures.push(
      `workers are not healthy: ${JSON.stringify(unhealthyWorkers)}`,
    );
    if (exitCode === PLATFORM_HEALTH_EXIT_CODES.ok) {
      exitCode = PLATFORM_HEALTH_EXIT_CODES.worker_unhealthy;
    }
  }

  return {
    ok: failures.length === 0,
    exitCode,
    failures,
    workerHealthComplete,
    missingWorkers,
    unhealthyWorkers,
    supply,
  };
}

/** One-line, machine-greppable summary for the workflow log and job summary. */
export function formatPlatformHealth(result, httpStatus) {
  const supply = result.supply;
  return [
    `RESULT platform_health=${result.ok ? "pass" : "fail"}`,
    `http=${httpStatus}`,
    `worker_health_complete=${result.workerHealthComplete}`,
    `missing_workers=${result.missingWorkers.length}`,
    `unhealthy_workers=${result.unhealthyWorkers.length}`,
    `job_supply=${supply.ready ? "ready" : "unproven"}`,
    `supply_state=${supply.state}`,
    `authorized_daily_capacity=${supply.capacity}`,
    `target_daily_new_canonical=${supply.target}`,
  ].join(" ");
}

/** The health payload is small; anything larger is not a health response. */
const MAX_HEALTH_RESPONSE_BYTES = 256 * 1024;
const HEALTH_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Reads a response body through a byte-counted streaming reader. The direct
 * body-consumer methods buffer an untrusted response without a limit, which
 * the repository's outbound-boundary guards reject — correctly.
 */
async function readBoundedJson(response, maximumBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isSafeInteger(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("health response exceeds the byte limit");
  }
  if (!response.body) throw new Error("health response has no body");

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("health response exceeds the byte limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function main() {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error("usage: verify-platform-health.mjs <base-url>");
    process.exitCode = PLATFORM_HEALTH_EXIT_CODES.usage;
    return;
  }

  let response;
  let payload;
  try {
    response = await fetch(new URL("/api/health", baseUrl), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(HEALTH_REQUEST_TIMEOUT_MS),
    });
    payload = await readBoundedJson(response, MAX_HEALTH_RESPONSE_BYTES);
  } catch (reason) {
    console.error(
      `FAIL platform health request failed: ${reason instanceof Error ? reason.name : "unknown"}`,
    );
    process.exitCode = PLATFORM_HEALTH_EXIT_CODES.network;
    return;
  }

  const result = evaluatePlatformHealth(payload, response.status);
  for (const failure of result.failures) console.error(`FAIL ${failure}`);
  if (!result.supply.ready) {
    // Reported, never gating, and never dressed up as capacity we do not have.
    console.warn(
      `WARN job-supply capacity unproven: state=${result.supply.state} ` +
        `authorized_daily_capacity=${result.supply.capacity} ` +
        `target=${result.supply.target}`,
    );
  }
  console.log(formatPlatformHealth(result, response.status));
  // Setting exitCode rather than calling process.exit lets in-flight handles
  // close cleanly; exiting mid-request aborts libuv and loses the real code.
  process.exitCode = result.exitCode;
}

// Resolve both sides to real paths. String-comparing a hand-built file:// URL
// silently fails on Windows (drive-letter form), which would make the CLI exit
// 0 without ever running the gate.
const entrypoint = process.argv[1] ? resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  await main();
}
