import type { Context } from "@netlify/functions";

import { getSalaryPadiSupabaseOrigin } from "../../../src/lib/supabase/project";

type NetlifyEnvironment = {
  env: { get(name: string): string | undefined };
};

type WorkerStart = { run_id: string; should_run: boolean };

export const SCHEDULED_FUNCTION_LIMIT_MS = 30_000;
export const SCHEDULED_WORKER_BUDGET_MS = 24_000;
export const WORKER_OPERATION_BUDGET_MS = 20_000;
export const RPC_TIMEOUT_MS = 4_000;
export const EXTERNAL_REQUEST_TIMEOUT_MS = 6_000;
export const PLATFORM_SHUTDOWN_RESERVE_MS =
  SCHEDULED_FUNCTION_LIMIT_MS - SCHEDULED_WORKER_BUDGET_MS;
export const WORKER_FINISH_RESERVE_MS =
  SCHEDULED_WORKER_BUDGET_MS - WORKER_OPERATION_BUDGET_MS;

export type WorkerExecution = {
  signal: AbortSignal;
  remainingMs: () => number;
};

export type WorkerOutcome = {
  status: "succeeded" | "skipped";
  summary: Record<string, unknown>;
};

type RpcOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

type WorkerRpc = <T>(
  functionName: string,
  parameters?: Record<string, unknown>,
  options?: RpcOptions,
) => Promise<T>;

type WorkerRuntimeOptions = {
  rpc?: WorkerRpc;
  now?: () => number;
  timeoutSignal?: (timeoutMs: number) => AbortSignal;
};

export class OperationalError extends Error {
  constructor(
    public readonly code: string,
    public readonly summary: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "OperationalError";
  }
}

export function getRuntimeEnvironment(name: string): string {
  const netlify = (
    globalThis as typeof globalThis & { Netlify?: NetlifyEnvironment }
  ).Netlify;
  const value = netlify?.env.get(name)?.trim();
  if (!value) throw new OperationalError(`missing_${name.toLowerCase()}`);
  return value;
}

export function getRuntimeSecret(name: string): string {
  const value = getRuntimeEnvironment(name);
  if (
    value.length < 32 ||
    value.length > 512 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new OperationalError(`invalid_${name.toLowerCase()}`);
  }
  return value;
}

export function getOptionalRuntimeEnvironment(
  name: string,
): string | undefined {
  const netlify = (
    globalThis as typeof globalThis & { Netlify?: NetlifyEnvironment }
  ).Netlify;
  return netlify?.env.get(name)?.trim() || undefined;
}

export function getRuntimeBoolean(
  name: string,
  defaultValue: boolean,
): boolean {
  const value = getOptionalRuntimeEnvironment(name);
  if (value === undefined) return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new OperationalError(`invalid_${name.toLowerCase()}`);
}

export function getRuntimeChoice<const T extends string>(
  name: string,
  allowed: readonly T[],
  defaultValue: T,
): T {
  const value = getOptionalRuntimeEnvironment(name) ?? defaultValue;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new OperationalError(`invalid_${name.toLowerCase()}`);
}

export function boundedSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

export function raceWithSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (reason) => {
        signal.removeEventListener("abort", abort);
        reject(reason);
      },
    );
  });
}

export function workerSucceeded(
  summary: Record<string, unknown>,
): WorkerOutcome {
  return { status: "succeeded", summary };
}

export function workerSkipped(reason: string): WorkerOutcome {
  return { status: "skipped", summary: { reason } };
}

export function getRuntimeSupabaseOrigin(): string {
  const rawUrl = getRuntimeEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  try {
    return getSalaryPadiSupabaseOrigin(rawUrl, {
      allowLocal: getOptionalRuntimeEnvironment("NETLIFY_DEV") === "true",
    });
  } catch {
    throw new OperationalError("invalid_supabase_project_url");
  }
}

export function getRuntimeAppOrigin(): string {
  const rawUrl = getRuntimeEnvironment("NEXT_PUBLIC_APP_URL");
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new OperationalError("invalid_salarypadi_app_url");
  }

  const localAllowed = getOptionalRuntimeEnvironment("NETLIFY_DEV") === "true";
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const isLocal =
    localAllowed &&
    localHosts.has(url.hostname) &&
    (url.protocol === "http:" || url.protocol === "https:");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "") ||
    (url.origin !== "https://salarypadi.com" && !isLocal)
  ) {
    throw new OperationalError("invalid_salarypadi_app_url");
  }
  return url.origin;
}

function errorCode(reason: unknown): string {
  if (reason instanceof OperationalError) return reason.code;
  if (
    reason instanceof DOMException &&
    (reason.name === "TimeoutError" || reason.name === "AbortError")
  )
    return "worker_deadline_exceeded";
  return "worker_failed";
}

function errorSummary(reason: unknown): Record<string, unknown> {
  return reason instanceof OperationalError ? reason.summary : {};
}

export async function rpc<T>(
  functionName: string,
  parameters: Record<string, unknown> = {},
  options: RpcOptions = {},
): Promise<T> {
  const url = getRuntimeSupabaseOrigin();
  const serviceRoleKey = getRuntimeEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Profile": "api",
      "Content-Profile": "api",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(parameters),
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal: boundedSignal(options.signal, options.timeoutMs ?? RPC_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new OperationalError(`supabase_rpc_${response.status}`);
  }
  return (await response.json()) as T;
}

async function readSchedule(request: Request) {
  try {
    const payload = (await request.json()) as { next_run?: unknown };
    if (typeof payload.next_run === "string") {
      const parsed = new Date(payload.next_run);
      if (!Number.isNaN(parsed.valueOf())) {
        return {
          runKey: `schedule:${parsed.toISOString()}`,
          scheduledFor: parsed.toISOString(),
        };
      }
    }
  } catch {
    // Netlify's local/manual invocation does not always include a schedule body.
  }
  return {
    runKey: `manual:${new Date().toISOString()}`,
    scheduledFor: null,
  };
}

export async function runTrackedWorker(
  taskKey: string,
  request: Request,
  context: Context,
  operation: (execution: WorkerExecution) => Promise<WorkerOutcome>,
  runtimeOptions: WorkerRuntimeOptions = {},
): Promise<Response> {
  const now = runtimeOptions.now ?? Date.now;
  const startedAt = now();
  const timeoutSignal = runtimeOptions.timeoutSignal ?? AbortSignal.timeout;
  const workerSignal = timeoutSignal(SCHEDULED_WORKER_BUDGET_MS);
  const operationSignal = AbortSignal.any([
    workerSignal,
    timeoutSignal(WORKER_OPERATION_BUDGET_MS),
  ]);
  const callRpc = runtimeOptions.rpc ?? rpc;
  const schedule = await readSchedule(request);
  const started = await callRpc<WorkerStart[]>(
    "worker_start",
    {
      p_task_key: taskKey,
      p_run_key: schedule.runKey,
      p_scheduled_for: schedule.scheduledFor,
      p_deploy_id: context.deploy?.id ?? null,
    },
    { signal: workerSignal },
  );
  const run = started[0];
  if (!run) throw new OperationalError("worker_start_missing");
  if (!run.should_run) {
    console.info(JSON.stringify({ task: taskKey, status: "duplicate" }));
    return new Response(null, { status: 204 });
  }

  try {
    const outcome = await operation({
      signal: operationSignal,
      remainingMs: () =>
        Math.max(0, SCHEDULED_WORKER_BUDGET_MS - (now() - startedAt)),
    });
    const finished = await callRpc<boolean>(
      "worker_finish",
      {
        p_run_id: run.run_id,
        p_status: outcome.status,
        p_summary: outcome.summary,
        p_error_code: null,
      },
      { signal: workerSignal },
    );
    if (!finished) throw new OperationalError("worker_finish_rejected");
    console.info(
      JSON.stringify({
        task: taskKey,
        status: outcome.status,
        ...outcome.summary,
      }),
    );
    return Response.json({
      status: outcome.status === "skipped" ? "skipped" : "ok",
    });
  } catch (reason) {
    const code = errorCode(reason);
    const summary = errorSummary(reason);
    try {
      const finished = await callRpc<boolean>(
        "worker_finish",
        {
          p_run_id: run.run_id,
          p_status: "failed",
          p_summary: summary,
          p_error_code: code,
        },
        { signal: workerSignal },
      );
      if (!finished) throw new OperationalError("worker_finish_rejected");
    } catch (finishReason) {
      console.error(
        JSON.stringify({
          task: taskKey,
          status: "finish_failed",
          code: errorCode(finishReason),
        }),
      );
    }
    console.error(JSON.stringify({ task: taskKey, status: "failed", code }));
    throw reason;
  }
}
