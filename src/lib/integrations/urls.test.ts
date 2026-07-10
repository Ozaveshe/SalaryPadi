import { describe, expect, it } from "vitest";

import {
  DEFAULT_AFROTOOLS_API_BASE,
  getAfroToolsApiBase,
} from "@/lib/integrations/urls";

describe("external integration URL boundaries", () => {
  it("canonicalizes the approved AfroTools API base", () => {
    expect(getAfroToolsApiBase("https://afrotools.com/api/v1/")).toBe(
      DEFAULT_AFROTOOLS_API_BASE,
    );
  });

  it.each([
    "https://evil.example/api/v1",
    "https://api.afrotools.com/api/v1",
    "http://afrotools.com/api/v1",
    "https://afrotools.com/api/v2",
    "https://key@afrotools.com/api/v1",
  ])("rejects an unapproved AfroTools credential destination: %s", (url) => {
    expect(() => getAfroToolsApiBase(url)).toThrow(/AfroTools API/);
  });

  it("allows a local API only when explicitly requested", () => {
    expect(
      getAfroToolsApiBase("http://127.0.0.1:8788/api/v1", {
        allowLocal: true,
      }),
    ).toBe("http://127.0.0.1:8788/api/v1");
    expect(
      getAfroToolsApiBase("http://[::1]:8788/api/v1", {
        allowLocal: true,
      }),
    ).toBe("http://[::1]:8788/api/v1");
  });
});
