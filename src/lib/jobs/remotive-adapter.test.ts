import { describe, expect, it, vi } from "vitest";

import {
  fetchRemotiveJobs,
  REMOTIVE_ENDPOINT,
  RemotiveAdapterError,
  type RemotiveAdapterErrorCode,
  type RemotiveFetch,
} from "./remotive-adapter";

const requestedAt = new Date("2026-07-10T12:00:00.000Z");

function sourceJob(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    url: `https://remotive.com/remote-jobs/software-dev/example-${id}`,
    title: `Example role ${id}`,
    company_name: "Example employer",
    company_logo: null,
    company_logo_url: null,
    category: "Software Development",
    tags: ["TypeScript"],
    job_type: "full_time",
    publication_date: "2026-07-09T08:00:00",
    candidate_required_location: "Worldwide",
    salary: "$80k - $100k per year",
    description: "<p>Build useful things.</p>",
    ...overrides,
  };
}

function jsonResponse(
  payload: unknown,
  headers: HeadersInit = {},
  status = 200,
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

function fixedFetch(response: Response): RemotiveFetch {
  return vi.fn(async () => response) as unknown as RemotiveFetch;
}

async function captureAdapterError(
  run: () => Promise<unknown>,
  code: RemotiveAdapterErrorCode,
) {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(RemotiveAdapterError);
  expect(caught).toMatchObject({ code });
  return caught as RemotiveAdapterError;
}

describe("Remotive adapter", () => {
  it("normalizes jobs with one source-derived checked-at time", async () => {
    const fetchImpl = vi.fn(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("accept")).toBe("application/json");
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("cookie")).toBeNull();
      expect(init?.method).toBe("GET");
      expect(init?.credentials).toBe("omit");
      expect(init?.redirect).toBe("error");
      return jsonResponse(
        { jobs: [sourceJob(1), sourceJob(2)] },
        { Date: "Fri, 10 Jul 2026 06:00:00 GMT" },
      );
    }) as unknown as RemotiveFetch;

    const result = await fetchRemotiveJobs({
      fetch: fetchImpl,
      requestedAt,
      requestInit: {
        headers: {
          Authorization: "Bearer must-not-leave",
          Cookie: "session=must-not-leave",
          "X-Request-Label": "salarypadi",
        },
      },
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      REMOTIVE_ENDPOINT,
      expect.any(Object),
    );
    expect(result.checkedAt).toBe("2026-07-10T06:00:00.000Z");
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs.map((job) => job.lastCheckedAt)).toEqual([
      result.checkedAt,
      result.checkedAt,
    ]);
    expect(result.jobs[0]).toMatchObject({
      id: "remotive-1",
      sourceUrl: "https://remotive.com/remote-jobs/software-dev/example-1",
      description: "Build useful things.",
    });
  });

  it("rejects a successful non-JSON response before parsing its body", async () => {
    const response = new Response('{"jobs":[]}', {
      headers: { "Content-Type": "text/html" },
    });
    await captureAdapterError(
      () =>
        fetchRemotiveJobs({
          fetch: fixedFetch(response),
          requestedAt,
        }),
      "remotive_invalid_content_type",
    );
    expect(response.bodyUsed).toBe(true);
  });

  it("streams and rejects an oversized body even when Content-Length lies", async () => {
    const body = JSON.stringify({
      jobs: [sourceJob(1, { description: "x".repeat(512) })],
    });
    await captureAdapterError(
      () =>
        fetchRemotiveJobs({
          fetch: fixedFetch(
            new Response(body, {
              headers: {
                "Content-Type": "application/json",
                "Content-Length": "1",
              },
            }),
          ),
          requestedAt,
          maxResponseBytes: 128,
        }),
      "remotive_response_too_large",
    );
  });

  it("rejects a declared body larger than the configured bound", async () => {
    const response = new Response("{}", {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "129",
      },
    });
    await captureAdapterError(
      () =>
        fetchRemotiveJobs({
          fetch: fixedFetch(response),
          requestedAt,
          maxResponseBytes: 128,
        }),
      "remotive_response_too_large",
    );
    expect(response.bodyUsed).toBe(true);
  });

  it("returns a typed safe code for malformed JSON", async () => {
    await captureAdapterError(
      () =>
        fetchRemotiveJobs({
          fetch: fixedFetch(
            new Response("{not-json", {
              headers: { "Content-Type": "application/json" },
            }),
          ),
          requestedAt,
        }),
      "remotive_invalid_json",
    );
  });

  it("returns a typed safe code for schema drift", async () => {
    await captureAdapterError(
      () =>
        fetchRemotiveJobs({
          fetch: fixedFetch(jsonResponse({ jobs: [{ id: "wrong" }] })),
          requestedAt,
        }),
      "remotive_invalid_payload",
    );
  });

  it("rejects a valid but empty feed", async () => {
    await captureAdapterError(
      () =>
        fetchRemotiveJobs({
          fetch: fixedFetch(jsonResponse({ jobs: [] })),
          requestedAt,
        }),
      "remotive_empty",
    );
  });

  it("preserves an HTTP status without exposing a provider response", async () => {
    const response = new Response("private upstream detail", {
      status: 429,
      headers: { "Content-Type": "text/plain" },
    });
    const error = await captureAdapterError(
      () =>
        fetchRemotiveJobs({
          fetch: fixedFetch(response),
          requestedAt,
          maxAttempts: 1,
        }),
      "remotive_http_error",
    );

    expect(error.status).toBe(429);
    expect(error.message).not.toContain("private upstream detail");
    expect(response.bodyUsed).toBe(true);
  });

  it("retries transient provider failures and returns the recovered payload", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("temporary outage", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ jobs: [sourceJob(1)] }));

    const result = await fetchRemotiveJobs({
      fetch: fetchImpl as unknown as RemotiveFetch,
      requestedAt,
      retryDelayMs: 0,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.jobs).toHaveLength(1);
  });

  it("does not retry a non-transient provider rejection", async () => {
    const fetchImpl = fixedFetch(
      new Response("forbidden", {
        status: 403,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await captureAdapterError(
      () =>
        fetchRemotiveJobs({
          fetch: fetchImpl,
          requestedAt,
          retryDelayMs: 0,
        }),
      "remotive_http_error",
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("maps transport failures to a typed safe code", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("socket details must remain internal");
    }) as unknown as RemotiveFetch;

    const error = await captureAdapterError(
      () =>
        fetchRemotiveJobs({
          fetch: fetchImpl,
          requestedAt,
          maxAttempts: 1,
        }),
      "remotive_request_failed",
    );
    expect(error.message).not.toContain("socket details");
  });

  it("maps an unsafe provider destination to a normalization error", async () => {
    await captureAdapterError(
      () =>
        fetchRemotiveJobs({
          fetch: fixedFetch(
            jsonResponse({
              jobs: [sourceJob(1, { url: "https://evil.example/jobs/1" })],
            }),
          ),
          requestedAt,
        }),
      "remotive_normalization_failed",
    );
  });

  it("does not allow callers to raise the hard response limit", async () => {
    await captureAdapterError(
      () =>
        fetchRemotiveJobs({
          fetch: fixedFetch(jsonResponse({ jobs: [sourceJob(1)] })),
          requestedAt,
          maxResponseBytes: 2 * 1024 * 1024 + 1,
        }),
      "remotive_invalid_options",
    );
  });
});
