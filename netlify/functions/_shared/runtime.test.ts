import type { Context } from "@netlify/functions";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  getRuntimeAppOrigin,
  getRuntimeHeaderCredential,
  getRuntimeMailbox,
  getRuntimeSecret,
  observeSecondaryOperation,
  OperationalError,
  operationalSummarySchema,
  PLATFORM_SHUTDOWN_RESERVE_MS,
  RPC_MAX_RESPONSE_BYTES,
  RPC_TIMEOUT_MS,
  rpcBooleanResultSchema,
  rpc,
  runTrackedWorker,
  SCHEDULED_FUNCTION_LIMIT_MS,
  SCHEDULED_WORKER_BUDGET_MS,
  WORKER_FINISH_RESERVE_MS,
  WORKER_OPERATION_BUDGET_MS,
  workerSkipped,
  workerSucceeded,
} from "./runtime";

function scheduledRequest() {
  return new Request("https://salarypadi.com/.netlify/functions/test", {
    method: "POST",
    body: JSON.stringify({ next_run: "2026-07-10T12:00:00.000Z" }),
  });
}

function netlifyEnvironment(values: Record<string, string | undefined>) {
  vi.stubGlobal("Netlify", {
    env: { get: (name: string) => values[name] },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("scheduled worker runtime", () => {
  it("reserves time for terminal persistence and platform shutdown", () => {
    expect(SCHEDULED_WORKER_BUDGET_MS).toBeLessThan(
      SCHEDULED_FUNCTION_LIMIT_MS,
    );
    expect(PLATFORM_SHUTDOWN_RESERVE_MS).toBeGreaterThanOrEqual(6_000);
    expect(WORKER_OPERATION_BUDGET_MS).toBeLessThan(SCHEDULED_WORKER_BUDGET_MS);
    expect(WORKER_FINISH_RESERVE_MS).toBeGreaterThanOrEqual(RPC_TIMEOUT_MS);
  });

  it("surfaces a secondary failure without replacing the primary path", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      observeSecondaryOperation(
        "record_failure_evidence",
        Promise.reject(new Error("database unavailable")),
      ),
    ).resolves.toEqual({
      operation: "record_failure_evidence",
      code: "worker_failed",
    });
    expect(warning).toHaveBeenCalledWith(
      JSON.stringify({
        status: "degraded",
        secondary_operation: "record_failure_evidence",
        secondary_error_code: "worker_failed",
      }),
    );
  });

  it("accepts only bounded flat operational summaries", () => {
    expect(
      operationalSummarySchema.safeParse({
        processed: 3,
        provider: "salarypadi",
        degraded: false,
        warnings: ["stale_source", null],
      }).success,
    ).toBe(true);
    expect(
      operationalSummarySchema.safeParse({ nested: { secret: "value" } })
        .success,
    ).toBe(false);
    expect(
      operationalSummarySchema.safeParse({
        values: Array.from({ length: 101 }, (_, index) => index),
      }).success,
    ).toBe(false);
    expect(
      operationalSummarySchema.safeParse(
        Object.fromEntries(
          Array.from({ length: 51 }, (_, index) => [`field_${index}`, index]),
        ),
      ).success,
    ).toBe(false);
  });

  it("rejects an invalid successful worker summary", () => {
    expect(() =>
      workerSucceeded({ nested: { secret: "must-not-be-persisted" } }),
    ).toThrowError(
      expect.objectContaining({
        name: "OperationalError",
        code: "worker_summary_invalid",
      }),
    );
  });

  it("normalizes unsafe operational errors before persistence", () => {
    const error = new OperationalError("Provider secret message!", {
      api_key: "must-not-be-persisted",
      nested: { value: true },
    });

    expect(error.message).toBe("worker_failed");
    expect(error.code).toBe("worker_failed");
    expect(error.summary).toEqual({ summary_state: "invalid" });
  });

  it("preserves valid operational error codes and summaries", () => {
    const error = new OperationalError("provider_unavailable", {
      provider: "example",
      retryable: true,
    });

    expect(error.message).toBe("provider_unavailable");
    expect(error.code).toBe("provider_unavailable");
    expect(error.summary).toEqual({
      provider: "example",
      retryable: true,
    });
  });

  it("rejects a wrong Supabase project before sending a credential", async () => {
    netlifyEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://wrong-project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-be-sent",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(rpc("worker_start", z.unknown())).rejects.toMatchObject({
      code: "invalid_supabase_project_url",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not follow redirects when sending the service-role credential", async () => {
    netlifyEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://bxelrhklsznmpksgrqep.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    });
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ accepted: true }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      rpc("worker_start", z.object({ accepted: z.literal(true) }).strict(), {
        p_task_key: "test",
      }),
    ).resolves.toEqual({ accepted: true });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://bxelrhklsznmpksgrqep.supabase.co/rest/v1/rpc/worker_start",
    );
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    expect(new Headers(init?.headers).get("apikey")).toBe(
      "test-service-role-key",
    );
  });

  it("rejects an invalid RPC response shape with bounded diagnostics", async () => {
    netlifyEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://bxelrhklsznmpksgrqep.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ accepted: true })),
    );

    await expect(
      rpc("worker_finish", rpcBooleanResultSchema),
    ).rejects.toMatchObject({
      code: "supabase_rpc_invalid_shape",
      summary: { rpc: "worker_finish" },
    });
  });

  it("rejects an oversized RPC response before parsing it", async () => {
    netlifyEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://bxelrhklsznmpksgrqep.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("{}", {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(RPC_MAX_RESPONSE_BYTES + 1),
          },
        }),
      ),
    );

    await expect(rpc("worker_start", z.unknown())).rejects.toMatchObject({
      code: "supabase_rpc_invalid_json",
      summary: { rpc: "worker_start" },
    });
  });

  it("rejects an invalid RPC name before sending a credential", async () => {
    netlifyEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://bxelrhklsznmpksgrqep.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-be-sent",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(rpc("../worker_start", z.unknown())).rejects.toMatchObject({
      code: "invalid_supabase_rpc_name",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a wrong application origin before an internal credential can leave", () => {
    netlifyEnvironment({
      NEXT_PUBLIC_APP_URL: "https://attacker.example",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-be-sent",
    });

    expect(() => getRuntimeAppOrigin()).toThrow("invalid_salarypadi_app_url");
  });

  it("rejects a weak internal bearer", () => {
    netlifyEnvironment({ JOB_SOURCE_SYNC_TOKEN: "too-short" });
    expect(() => getRuntimeSecret("JOB_SOURCE_SYNC_TOKEN")).toThrow(
      "invalid_job_source_sync_token",
    );
  });

  it("accepts JWT-style header credentials while rejecting unsafe values", () => {
    netlifyEnvironment({
      SUPABASE_SERVICE_ROLE_KEY: "header.payload.signature",
    });
    expect(getRuntimeHeaderCredential("SUPABASE_SERVICE_ROLE_KEY")).toBe(
      "header.payload.signature",
    );

    netlifyEnvironment({
      SUPABASE_SERVICE_ROLE_KEY:
        "safe-prefix\r\nX-Injected-Header: unsafe-value",
    });
    expect(() =>
      getRuntimeHeaderCredential("SUPABASE_SERVICE_ROLE_KEY"),
    ).toThrow("invalid_supabase_service_role_key");
  });

  it("accepts the documented transactional mailbox formats", () => {
    netlifyEnvironment({
      TRANSACTIONAL_EMAIL_FROM: "SalaryPadi <updates@mail.salarypadi.com>",
      TRANSACTIONAL_EMAIL_REPLY_TO: "support@salarypadi.com",
    });

    expect(
      getRuntimeMailbox("TRANSACTIONAL_EMAIL_FROM", {
        allowDisplayName: true,
      }),
    ).toBe("SalaryPadi <updates@mail.salarypadi.com>");
    expect(getRuntimeMailbox("TRANSACTIONAL_EMAIL_REPLY_TO")).toBe(
      "support@salarypadi.com",
    );
  });

  it.each([
    "not-an-address",
    "SalaryPadi <not-an-address>",
    "SalaryPadi\nBcc: attacker@example.test <updates@mail.salarypadi.com>",
  ])("rejects an invalid transactional sender: %s", (value) => {
    netlifyEnvironment({ TRANSACTIONAL_EMAIL_FROM: value });
    expect(() =>
      getRuntimeMailbox("TRANSACTIONAL_EMAIL_FROM", {
        allowDisplayName: true,
      }),
    ).toThrow("invalid_transactional_email_from");
  });

  it("does not accept a display name where a bare reply-to is required", () => {
    netlifyEnvironment({
      TRANSACTIONAL_EMAIL_REPLY_TO: "Support <support@salarypadi.com>",
    });
    expect(() => getRuntimeMailbox("TRANSACTIONAL_EMAIL_REPLY_TO")).toThrow(
      "invalid_transactional_email_reply_to",
    );
  });

  it("scopes scheduled-run idempotency to the immutable deploy", async () => {
    const startCalls: Record<string, unknown>[] = [];
    const fakeRpc = async <T>(
      functionName: string,
      _resultSchema: z.ZodType<T>,
      parameters: Record<string, unknown> = {},
    ): Promise<T> => {
      if (functionName !== "worker_start") {
        throw new Error(`unexpected RPC ${functionName}`);
      }
      startCalls.push(parameters);
      return [
        { run_id: "00000000-0000-4000-8000-000000000004", should_run: false },
      ] as T;
    };

    await runTrackedWorker(
      "test_worker",
      scheduledRequest(),
      { deploy: { id: "deploy-1" } } as Context,
      async () => workerSucceeded({}),
      { rpc: fakeRpc },
    );
    await runTrackedWorker(
      "test_worker",
      scheduledRequest(),
      { deploy: { id: "deploy-2" } } as Context,
      async () => workerSucceeded({}),
      { rpc: fakeRpc },
    );

    expect(startCalls.map((call) => call.p_run_key)).toEqual([
      "schedule:2026-07-10T12:00:00.000Z:deploy:deploy-1",
      "schedule:2026-07-10T12:00:00.000Z:deploy:deploy-2",
    ]);
    expect(startCalls.map((call) => call.p_deploy_id)).toEqual([
      "deploy-1",
      "deploy-2",
    ]);
  });

  it("bounds an oversized schedule payload and falls back to a manual run key", async () => {
    let startParameters: Record<string, unknown> = {};
    const fakeRpc = async <T>(
      functionName: string,
      _resultSchema: z.ZodType<T>,
      parameters: Record<string, unknown> = {},
    ): Promise<T> => {
      if (functionName !== "worker_start") {
        throw new Error(`unexpected RPC ${functionName}`);
      }
      startParameters = parameters;
      return [
        { run_id: "00000000-0000-4000-8000-000000000004", should_run: false },
      ] as T;
    };
    const request = new Request(
      "https://salarypadi.com/.netlify/functions/test",
      {
        method: "POST",
        body: JSON.stringify({
          next_run: "2026-07-10T12:00:00.000Z",
          padding: "x".repeat(10 * 1024),
        }),
      },
    );

    await runTrackedWorker(
      "test_worker",
      request,
      {} as Context,
      async () => workerSucceeded({}),
      { rpc: fakeRpc },
    );

    expect(startParameters.p_run_key).toMatch(/^manual:/);
    expect(startParameters.p_scheduled_for).toBeNull();
  });

  it("does not relabel completed work when its terminal acknowledgement is rejected", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const terminalStatuses: unknown[] = [];
    const fakeRpc = async <T>(
      functionName: string,
      _resultSchema: z.ZodType<T>,
      parameters: Record<string, unknown> = {},
    ): Promise<T> => {
      if (functionName === "worker_start") {
        return [
          { run_id: "00000000-0000-4000-8000-000000000001", should_run: true },
        ] as T;
      }
      terminalStatuses.push(parameters.p_status);
      return false as T;
    };

    await expect(
      runTrackedWorker(
        "test_worker",
        scheduledRequest(),
        { deploy: { id: "deploy-1" } } as Context,
        async () => workerSucceeded({ count: 1 }),
        { rpc: fakeRpc },
      ),
    ).rejects.toMatchObject({ code: "worker_finish_rejected" });
    expect(terminalStatuses).toEqual(["succeeded"]);
  });

  it("persists a disabled provider run as skipped", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const terminalCalls: Record<string, unknown>[] = [];
    const fakeRpc = async <T>(
      functionName: string,
      _resultSchema: z.ZodType<T>,
      parameters: Record<string, unknown> = {},
    ): Promise<T> => {
      if (functionName === "worker_start") {
        return [
          { run_id: "00000000-0000-4000-8000-000000000003", should_run: true },
        ] as T;
      }
      terminalCalls.push(parameters);
      return true as T;
    };

    const response = await runTrackedWorker(
      "test_worker",
      scheduledRequest(),
      {} as Context,
      async () => workerSkipped("provider_disabled"),
      { rpc: fakeRpc },
    );

    await expect(response.json()).resolves.toEqual({ status: "skipped" });
    expect(terminalCalls).toContainEqual(
      expect.objectContaining({
        p_status: "skipped",
        p_summary: { reason: "provider_disabled" },
      }),
    );
  });

  it("threads the operation deadline and records a timed-out run", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const controllers = new Map<number, AbortController>();
    const timeoutSignal = (timeoutMs: number) => {
      const controller = new AbortController();
      controllers.set(timeoutMs, controller);
      return controller.signal;
    };
    const terminalCalls: Record<string, unknown>[] = [];
    const fakeRpc = async <T>(
      functionName: string,
      _resultSchema: z.ZodType<T>,
      parameters: Record<string, unknown> = {},
    ): Promise<T> => {
      if (functionName === "worker_start") {
        return [
          { run_id: "00000000-0000-4000-8000-000000000002", should_run: true },
        ] as T;
      }
      terminalCalls.push(parameters);
      return true as T;
    };
    let operationStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      operationStarted = resolve;
    });

    const run = runTrackedWorker(
      "test_worker",
      scheduledRequest(),
      {} as Context,
      ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
          operationStarted?.();
        }),
      { rpc: fakeRpc, timeoutSignal },
    );
    await started;
    controllers
      .get(WORKER_OPERATION_BUDGET_MS)
      ?.abort(new DOMException("deadline", "TimeoutError"));

    await expect(run).rejects.toMatchObject({ name: "TimeoutError" });
    expect(terminalCalls).toContainEqual(
      expect.objectContaining({
        p_status: "failed",
        p_error_code: "worker_deadline_exceeded",
      }),
    );
  });
});
