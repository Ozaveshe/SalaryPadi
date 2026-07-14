import { describe, expect, it } from "vitest";

import { discardResponseBody } from "@/lib/http/body";
import { JsonBodyError, noStoreJson, readBoundedJson } from "@/lib/http/json";

describe("bounded JSON bodies", () => {
  it("discards an unread response body without surfacing cleanup failures", async () => {
    const response = new Response("provider detail");
    await expect(discardResponseBody(response)).resolves.toBeUndefined();
    expect(response.bodyUsed).toBe(true);
    await expect(discardResponseBody(response)).resolves.toBeUndefined();
  });

  it("enforces the actual streamed byte count without Content-Length", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"value":"'));
        controller.enqueue(encoder.encode(`${"x".repeat(32)}"}`));
        controller.close();
      },
    });
    const request = new Request("https://salarypadi.test/api/example", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect(request.headers.get("content-length")).toBeNull();
    await expect(readBoundedJson(request, 20)).rejects.toMatchObject({
      code: "too_large",
    } satisfies Partial<JsonBodyError>);
  });

  it("cancels an oversized declared response before rejecting it", async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "Content-Length": "100" } },
    );

    await expect(readBoundedJson(response, 20)).rejects.toMatchObject({
      code: "too_large",
    } satisfies Partial<JsonBodyError>);
    expect(cancelled).toBe(true);
    expect(response.bodyUsed).toBe(true);
  });

  it("parses a body below the byte limit", async () => {
    const request = new Request("https://salarypadi.test/api/example", {
      method: "POST",
      body: JSON.stringify({ value: "ok" }),
    });

    await expect(readBoundedJson(request, 100)).resolves.toEqual({
      value: "ok",
    });
  });

  it("marks JSON responses as no-store", () => {
    expect(noStoreJson({ ok: true }).headers.get("cache-control")).toBe(
      "no-store",
    );
  });
});
