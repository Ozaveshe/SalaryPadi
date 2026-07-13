import { describe, expect, it, vi } from "vitest";

import {
  executeToolRequest,
  toolRequestError,
  toolRequestReducer,
  toolResponseError,
  type ToolRequestState,
} from "./use-tool-request";

describe("useToolRequest shared behavior", () => {
  it("owns the result, error and loading state transitions", () => {
    const initial: ToolRequestState<{ value: number }> = {
      result: { value: 1 },
      error: "old error",
      loading: false,
    };
    const started = toolRequestReducer(initial, { type: "start" });
    expect(started).toEqual({ result: null, error: null, loading: true });

    const succeeded = toolRequestReducer(started, {
      type: "success",
      result: { value: 2 },
    });
    expect(toolRequestReducer(succeeded, { type: "finish" })).toEqual({
      result: { value: 2 },
      error: null,
      loading: false,
    });

    const failed = toolRequestReducer(started, {
      type: "failure",
      error: "Unavailable",
    });
    expect(toolRequestReducer(failed, { type: "finish" })).toEqual({
      result: null,
      error: "Unavailable",
      loading: false,
    });
  });

  it("posts a typed JSON payload and delegates response validation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ result: { value: 7 } }));
    const parseResponse = vi.fn(
      (_response: Response, body: unknown) =>
        (body as { result: { value: number } }).result,
    );

    await expect(
      executeToolRequest({
        endpoint: "/api/tools/example",
        createPayload: () => ({ input: { amount: 5 } }),
        parseResponse,
        fetcher,
      }),
    ).resolves.toEqual({ value: 7 });
    expect(fetcher).toHaveBeenCalledWith("/api/tools/example", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { amount: 5 } }),
    });
    expect(parseResponse).toHaveBeenCalledOnce();
  });

  it("does not call fetch when local request validation fails", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      executeToolRequest({
        endpoint: "/api/tools/example",
        createPayload: () => {
          throw new Error("Check the entered amount.");
        },
        parseResponse: () => ({ value: 1 }),
        fetcher,
      }),
    ).rejects.toThrow("Check the entered amount.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps approved error copy but bounds untrusted response messages", () => {
    expect(
      toolResponseError(
        { error: "No verified conversion is available." },
        "Conversion failed.",
      ),
    ).toBe("No verified conversion is available.");
    expect(
      toolResponseError({ error: "x".repeat(301) }, "Safe fallback."),
    ).toBe("Safe fallback.");
    expect(
      toolRequestError({ message: "not an Error" }, "Safe fallback."),
    ).toBe("Safe fallback.");
  });
});
