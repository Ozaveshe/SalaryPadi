import { describe, expect, it } from "vitest";

import {
  evaluatePlatformHealth,
  formatPlatformHealth,
  PLATFORM_HEALTH_EXIT_CODES,
} from "../../../scripts/verify-platform-health.mjs";

/**
 * The platform-health gate for the production acceptance workflow.
 *
 * Worker health gates a release. Source-supply capacity is reported honestly
 * but does not gate it, because `authorized_daily_capacity` is a rights state
 * that no amount of correct worker execution can raise.
 */

function healthPayload(overrides: Record<string, unknown> = {}) {
  return {
    status: "ok",
    checks: {
      worker_health_complete: true,
      missing_workers: [],
      unhealthy_workers: [],
      job_supply_ready: true,
      job_supply: {
        state: "ready",
        authorized_daily_capacity: 650,
        target_daily_new_canonical: 500,
      },
      ...overrides,
    },
  };
}

describe("platform-health gate", () => {
  it("passes only when health is 200 and every worker is current", () => {
    const result = evaluatePlatformHealth(healthPayload(), 200);
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(PLATFORM_HEALTH_EXIT_CODES.ok);
    expect(result.failures).toEqual([]);
  });

  it("fails the workflow when /api/health returns 503", () => {
    // The regression this job exists for: on 53318fa customer-surface
    // acceptance reported success while /api/health was 503.
    const result = evaluatePlatformHealth(
      healthPayload({ worker_health_complete: false }),
      503,
    );
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(PLATFORM_HEALTH_EXIT_CODES.http);
    expect(result.failures.join(" ")).toContain("HTTP 503");
  });

  it("fails when mandatory worker health is incomplete even on HTTP 200", () => {
    const result = evaluatePlatformHealth(
      healthPayload({
        worker_health_complete: false,
        missing_workers: ["job_lifecycle"],
      }),
      200,
    );
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(
      PLATFORM_HEALTH_EXIT_CODES.worker_health_incomplete,
    );
    expect(result.missingWorkers).toEqual(["job_lifecycle"]);
  });

  it("fails when a worker is reported unhealthy", () => {
    const result = evaluatePlatformHealth(
      healthPayload({ unhealthy_workers: ["secondary_feed_sync"] }),
      200,
    );
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(PLATFORM_HEALTH_EXIT_CODES.worker_unhealthy);
    expect(result.unhealthyWorkers).toEqual(["secondary_feed_sync"]);
  });

  it("distinguishes worker health from supply capacity", () => {
    // Every worker current, capacity legitimately zero because sources are
    // intentionally unauthorised. The release is healthy; capacity is not
    // claimed. This is the separation the whole job turns on.
    const result = evaluatePlatformHealth(
      healthPayload({
        job_supply_ready: false,
        job_supply: {
          state: "capacity_unproven",
          authorized_daily_capacity: 0,
          target_daily_new_canonical: 500,
        },
      }),
      200,
    );

    expect(result.ok).toBe(true);
    expect(result.workerHealthComplete).toBe(true);
    expect(result.supply).toEqual({
      ready: false,
      state: "capacity_unproven",
      capacity: 0,
      target: 500,
    });
  });

  it("never reports unproven capacity as ready", () => {
    const result = evaluatePlatformHealth(
      healthPayload({
        job_supply_ready: false,
        job_supply: {
          state: "capacity_unproven",
          authorized_daily_capacity: 0,
          target_daily_new_canonical: 500,
        },
      }),
      200,
    );
    const line = formatPlatformHealth(result, 200);
    expect(line).toContain("job_supply=unproven");
    expect(line).toContain("authorized_daily_capacity=0");
    expect(line).not.toContain("job_supply=ready");
  });

  it("fails safely on an unreadable payload", () => {
    for (const payload of [null, "not json", 42, []]) {
      const result = evaluatePlatformHealth(payload, 200);
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(PLATFORM_HEALTH_EXIT_CODES.invalid_payload);
    }
  });

  it("reports both dimensions in one greppable line", () => {
    const line = formatPlatformHealth(
      evaluatePlatformHealth(healthPayload(), 200),
      200,
    );
    expect(line).toContain("platform_health=pass");
    expect(line).toContain("worker_health_complete=true");
    expect(line).toContain("job_supply=ready");
  });
});
