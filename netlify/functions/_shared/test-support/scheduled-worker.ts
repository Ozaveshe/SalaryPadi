import type { Context } from "@netlify/functions";
import { vi, type MockedFunction } from "vitest";

export const SCHEDULED_AT = "2026-07-13T12:00:00.000Z";
export const TEST_RUN_ID = "10000000-0000-4000-8000-000000000001";

export type ScheduledHandler = (
  request: Request,
  context: Context,
) => Promise<Response>;

export const workerContext = {
  deploy: { id: "test-deploy" },
} as Context;

const baseEnvironment: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bxelrhklsznmpksgrqep.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  NEXT_PUBLIC_APP_URL: "https://salarypadi.com",
  JOB_SOURCE_SYNC_TOKEN: "job-source-sync-token-12345678901234567890",
  AFROTOOLS_API_BASE_URL: "https://afrotools.com/api/v1",
  AFROTOOLS_API_KEY: "afrotools-api-key-12345678901234567890",
};

export function scheduledRequest(taskKey: string) {
  return new Request(`https://salarypadi.com/.netlify/functions/${taskKey}`, {
    method: "POST",
    body: JSON.stringify({ next_run: SCHEDULED_AT }),
  });
}

export function stubWorkerEnvironment(
  overrides: Record<string, string | undefined> = {},
) {
  const values = { ...baseEnvironment, ...overrides };
  vi.stubGlobal("Netlify", {
    env: { get: (name: string) => values[name] },
    context: { deploy: { context: "production" } },
  });
  return values;
}

type RpcResolver = (
  body: Record<string, unknown>,
  url: URL,
  init: RequestInit | undefined,
) => unknown | Response | Promise<unknown | Response>;

type RpcValue = unknown | Response | RpcResolver;

type WorkerFetchOptions = {
  shouldRun?: boolean;
  rpc?: Record<string, RpcValue>;
  fallback?: (
    url: URL,
    init: RequestInit | undefined,
  ) => Response | Promise<Response>;
};

function responseFor(value: unknown | Response): Response {
  return value instanceof Response ? value : Response.json(value);
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  const raw = init?.body;
  return typeof raw === "string"
    ? (JSON.parse(raw) as Record<string, unknown>)
    : {};
}

export function rpcName(url: URL): string | null {
  const marker = "/rest/v1/rpc/";
  const index = url.pathname.indexOf(marker);
  return index === -1
    ? null
    : decodeURIComponent(url.pathname.slice(index + marker.length));
}

export function installWorkerFetch(options: WorkerFetchOptions = {}) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const name = rpcName(url);
    if (name === "worker_start") {
      return Response.json([
        { run_id: TEST_RUN_ID, should_run: options.shouldRun ?? true },
      ]);
    }
    if (name === "worker_finish") return Response.json(true);
    if (name && Object.hasOwn(options.rpc ?? {}, name)) {
      const configured = options.rpc?.[name];
      const value =
        typeof configured === "function"
          ? await configured(parseBody(init), url, init)
          : configured;
      return responseFor(value);
    }
    if (options.fallback) return options.fallback(url, init);
    throw new Error(`Unexpected fetch in scheduled-worker test: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export type WorkerFetchMock = MockedFunction<typeof fetch>;

export function rpcCallBodies(fetchMock: WorkerFetchMock, name: string) {
  return fetchMock.mock.calls.flatMap(([input, init]) => {
    const url = new URL(String(input));
    return rpcName(url) === name ? [parseBody(init)] : [];
  });
}

export function nonBookkeepingUrls(fetchMock: WorkerFetchMock) {
  return fetchMock.mock.calls.flatMap(([input]) => {
    const url = new URL(String(input));
    const name = rpcName(url);
    return name === "worker_start" || name === "worker_finish"
      ? []
      : [url.toString()];
  });
}
