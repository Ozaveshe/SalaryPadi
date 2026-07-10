import { describe, expect, it } from "vitest";

import { config } from "./tool-api-rate-limit";

describe("tool API edge protection", () => {
  it("uses one deployable rule for every tool endpoint", () => {
    expect(config).toEqual({
      path: "/api/tools/*",
      method: "POST",
      rateLimit: {
        action: "rate_limit",
        aggregateBy: ["ip", "domain"],
        windowSize: 60,
        windowLimit: 20,
      },
    });
  });
});
