import { describe, expect, it } from "vitest";

import { JsonBodyError, noStoreJson, readBoundedJson } from "@/lib/http/json";

describe("bounded JSON bodies", () => {
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
