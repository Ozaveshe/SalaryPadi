import { describe, expect, it, vi } from "vitest";

import {
  EXIT_CODES,
  REQUIRED_WORKERS,
  formatHumanResult,
  parseCliArgs,
  runCli,
  verifyProductionFreshness,
} from "../../../scripts/verify-production-freshness.mjs";

const checkedAt = new Date("2026-07-13T15:00:00.000Z");

type WorkerRow = {
  task_key: string;
  owner_label: string;
  last_status: string;
  last_started_at: string | null;
  last_success_at: string | null;
  freshness: string;
};

function workerRows(): WorkerRow[] {
  return REQUIRED_WORKERS.map((taskKey) => ({
    task_key: taskKey,
    owner_label: taskKey,
    last_status: "succeeded",
    last_started_at: "2026-07-13T14:30:00.000Z",
    last_success_at: "2026-07-13T14:31:00.000Z",
    freshness: "healthy",
  }));
}

function healthPayload(overrides: Record<string, unknown> = {}) {
  return {
    status: "ok",
    checks: { workers: workerRows() },
    ...overrides,
  };
}

function fetchFor({
  health = healthPayload(),
  healthStatus = 200,
  invalidHealthBody = false,
  healthError = false,
  routeStatuses = {},
}: {
  health?: unknown;
  healthStatus?: number;
  invalidHealthBody?: boolean;
  healthError?: boolean;
  routeStatuses?: Record<string, number>;
} = {}) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/health") {
      if (healthError) throw new TypeError("network unavailable");
      return invalidHealthBody
        ? new Response("not-json", { status: healthStatus })
        : Response.json(health, { status: healthStatus });
    }
    return new Response(null, {
      status: routeStatuses[url.pathname] ?? 200,
    });
  });
}

async function verify(
  fetchImpl: typeof fetch,
  deployStartedAt: string | null = null,
) {
  return verifyProductionFreshness({
    fetchImpl,
    deployStartedAt,
    now: () => checkedAt,
    timeoutSignal: () => undefined,
  });
}

describe("production freshness CLI arguments", () => {
  it("accepts JSON output and an exact deploy timestamp", () => {
    expect(
      parseCliArgs([
        "--json",
        "--expect-deploy-freshness",
        "2026-07-13T14:00:00Z",
      ]),
    ).toEqual({
      json: true,
      deployStartedAt: "2026-07-13T14:00:00.000Z",
      help: false,
    });
    expect(
      parseCliArgs(["--expect-deploy-freshness=2026-07-13T14:00:00+00:00"])
        .deployStartedAt,
    ).toBe("2026-07-13T14:00:00.000Z");
  });

  it("rejects missing timestamps and unknown arguments", () => {
    expect(() => parseCliArgs(["--expect-deploy-freshness"])).toThrow(
      "requires the deploy UTC timestamp",
    );
    expect(() => parseCliArgs(["--unknown"])).toThrow("Unknown argument");
  });

  it("writes a single machine-readable JSON result and returns its exit code", async () => {
    const output: string[] = [];
    const result = await verify(fetchFor());
    const verifyResult = vi.fn().mockResolvedValue(result);

    const exitCode = await runCli({
      argv: ["--json"],
      environment: {},
      write: (value: string) => output.push(value),
      verify: verifyResult,
    });

    expect(exitCode).toBe(EXIT_CODES.ok);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)).toMatchObject({
      status: "fresh",
      exit_code: EXIT_CODES.ok,
    });
    expect(verifyResult).toHaveBeenCalledOnce();
  });

  it("rejects a deploy timestamp without an explicit UTC offset", () => {
    expect(() =>
      parseCliArgs(["--expect-deploy-freshness", "2026-07-13T14:00:00"]),
    ).toThrow("must include an explicit UTC offset");
  });
});

describe("production freshness verification", () => {
  it("reports one human-readable line per successful check", async () => {
    const result = await verify(fetchFor());

    expect(result).toMatchObject({
      status: "fresh",
      mode: "scheduled",
      exit_code: EXIT_CODES.ok,
      checked_at: checkedAt.toISOString(),
    });
    expect(result.checks).toHaveLength(1 + REQUIRED_WORKERS.length + 4);
    const output = formatHumanResult(result).split("\n");
    expect(output).toHaveLength(result.checks.length + 1);
    expect(output.at(-1)).toContain("RESULT status=fresh exit_code=0");
  });

  it("fails post-deploy verification when any worker predates the deploy", async () => {
    const workers = workerRows();
    workers[0]!.last_started_at = "2026-07-13T13:59:59.000Z";
    const result = await verify(
      fetchFor({ health: healthPayload({ checks: { workers } }) }),
      "2026-07-13T14:00:00.000Z",
    );

    expect(result).toMatchObject({
      status: "failed",
      mode: "post_deploy",
      deploy_started_at: "2026-07-13T14:00:00.000Z",
      exit_code: EXIT_CODES.deploy_freshness,
    });
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: `worker:${REQUIRED_WORKERS[0]}`,
        status: "fail",
        exit_code: EXIT_CODES.deploy_freshness,
      }),
    );
  });

  it("uses a dedicated exit code for a degraded health response", async () => {
    const result = await verify(
      fetchFor({
        health: healthPayload({ status: "degraded" }),
        healthStatus: 503,
      }),
    );
    expect(result.exit_code).toBe(EXIT_CODES.health_degraded);
  });

  it("uses dedicated exit codes for missing, unhealthy, and never-run workers", async () => {
    const missing = workerRows().slice(1);
    expect(
      (
        await verify(
          fetchFor({ health: healthPayload({ checks: { workers: missing } }) }),
        )
      ).exit_code,
    ).toBe(EXIT_CODES.worker_missing);

    const unhealthy = workerRows();
    unhealthy[0]!.freshness = "stale";
    expect(
      (
        await verify(
          fetchFor({
            health: healthPayload({ checks: { workers: unhealthy } }),
          }),
        )
      ).exit_code,
    ).toBe(EXIT_CODES.worker_unhealthy);

    const neverRun = workerRows();
    neverRun[0]!.last_started_at = null;
    expect(
      (
        await verify(
          fetchFor({
            health: healthPayload({ checks: { workers: neverRun } }),
          }),
        )
      ).exit_code,
    ).toBe(EXIT_CODES.worker_never_run);
  });

  it("distinguishes network, HTTP, invalid-payload, and route failures", async () => {
    expect((await verify(fetchFor({ healthError: true }))).exit_code).toBe(
      EXIT_CODES.network,
    );
    expect(
      (await verify(fetchFor({ healthStatus: 502, invalidHealthBody: true })))
        .exit_code,
    ).toBe(EXIT_CODES.http);
    expect(
      (
        await verify(
          fetchFor({ health: healthPayload({ checks: { workers: "bad" } }) }),
        )
      ).exit_code,
    ).toBe(EXIT_CODES.invalid_payload);
    expect(
      (await verify(fetchFor({ routeStatuses: { "/jobs": 500 } }))).exit_code,
    ).toBe(EXIT_CODES.route);
  });
});
