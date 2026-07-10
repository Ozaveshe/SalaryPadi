import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ getAppOrigin: vi.fn() }));

import { getAppOrigin } from "@/lib/env";
import { isSameOriginRequest } from "@/lib/security/origin";

const mockedGetAppOrigin = vi.mocked(getAppOrigin);

describe("request origin boundary", () => {
  beforeEach(() =>
    mockedGetAppOrigin.mockReturnValue("https://salarypadi.com"),
  );

  it("accepts the exact application origin", () => {
    expect(
      isSameOriginRequest(
        new Request("https://salarypadi.com/api/test", {
          headers: { Origin: "https://salarypadi.com" },
        }),
      ),
    ).toBe(true);
  });

  it("accepts an exact Referer only when Origin is absent", () => {
    expect(
      isSameOriginRequest(
        new Request("https://salarypadi.com/api/test", {
          headers: { Referer: "https://salarypadi.com/tools" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        new Request("https://salarypadi.com/api/test", {
          headers: {
            Origin: "https://evil.example",
            Referer: "https://salarypadi.com/tools",
          },
        }),
      ),
    ).toBe(false);
  });

  it("rejects a cross-origin request and a missing Origin header", () => {
    expect(
      isSameOriginRequest(
        new Request("https://salarypadi.com/api/test", {
          headers: { Origin: "https://evil.example" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(new Request("https://salarypadi.com/api/test")),
    ).toBe(false);
  });

  it("permits loopback only for a reserved test canonical domain", () => {
    mockedGetAppOrigin.mockReturnValue("https://salarypadi.test");
    expect(
      isSameOriginRequest(
        new Request("http://127.0.0.1:3000/api/test", {
          headers: { Origin: "http://127.0.0.1:3000" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        new Request("http://[::1]:3000/api/test", {
          headers: { Origin: "http://[::1]:3000" },
        }),
      ),
    ).toBe(true);

    mockedGetAppOrigin.mockReturnValue("https://salarypadi.com");
    expect(
      isSameOriginRequest(
        new Request("http://127.0.0.1:3000/api/test", {
          headers: { Origin: "http://127.0.0.1:3000" },
        }),
      ),
    ).toBe(false);
  });

  it("requires the test Origin to match the exact loopback request port", () => {
    mockedGetAppOrigin.mockReturnValue("https://salarypadi.test");

    expect(
      isSameOriginRequest(
        new Request("http://localhost:3000/api/test", {
          headers: { Origin: "http://127.0.0.1:3000" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        new Request("http://127.0.0.1:3000/api/test", {
          headers: { Origin: "http://127.0.0.1:4000" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        new Request("https://preview.example/api/test", {
          headers: { Origin: "http://127.0.0.1:3000" },
        }),
      ),
    ).toBe(false);
  });

  it("permits an exact loopback Referer for production-mode browser tests", () => {
    mockedGetAppOrigin.mockReturnValue("https://salarypadi.test");

    expect(
      isSameOriginRequest(
        new Request("http://127.0.0.1:3000/api/test", {
          headers: { Referer: "http://127.0.0.1:3000/tools" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        new Request("http://127.0.0.1:3000/api/test", {
          headers: { Referer: "http://127.0.0.1:4000/tools" },
        }),
      ),
    ).toBe(false);
  });
});
