import type { Context } from "@netlify/functions";

type NetlifyEnvironment = {
  env: { get(name: string): string | undefined };
};

type WorkerStart = { run_id: string; should_run: boolean };

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

function errorCode(reason: unknown): string {
  if (reason instanceof OperationalError) return reason.code;
  if (reason instanceof DOMException && reason.name === "TimeoutError")
    return "upstream_timeout";
  return "worker_failed";
}

function errorSummary(reason: unknown): Record<string, unknown> {
  return reason instanceof OperationalError ? reason.summary : {};
}

export async function rpc<T>(
  functionName: string,
  parameters: Record<string, unknown> = {},
): Promise<T> {
  const url = getRuntimeEnvironment("NEXT_PUBLIC_SUPABASE_URL");
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
    signal: AbortSignal.timeout(12_000),
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
  operation: () => Promise<Record<string, unknown>>,
): Promise<Response> {
  const schedule = await readSchedule(request);
  const started = await rpc<WorkerStart[]>("worker_start", {
    p_task_key: taskKey,
    p_run_key: schedule.runKey,
    p_scheduled_for: schedule.scheduledFor,
    p_deploy_id: context.deploy?.id ?? null,
  });
  const run = started[0];
  if (!run) throw new OperationalError("worker_start_missing");
  if (!run.should_run) {
    console.info(JSON.stringify({ task: taskKey, status: "duplicate" }));
    return new Response(null, { status: 204 });
  }

  try {
    const summary = await operation();
    await rpc<boolean>("worker_finish", {
      p_run_id: run.run_id,
      p_status: "succeeded",
      p_summary: summary,
      p_error_code: null,
    });
    console.info(
      JSON.stringify({ task: taskKey, status: "succeeded", ...summary }),
    );
    return Response.json({ status: "ok" });
  } catch (reason) {
    const code = errorCode(reason);
    const summary = errorSummary(reason);
    await rpc<boolean>("worker_finish", {
      p_run_id: run.run_id,
      p_status: "failed",
      p_summary: summary,
      p_error_code: code,
    }).catch(() => undefined);
    console.error(JSON.stringify({ task: taskKey, status: "failed", code }));
    throw reason;
  }
}
