import { describe, expect, it } from "vitest";

import { config } from "../../../netlify/edge-functions/auth-api-rate-limit";

describe("auth API edge protection", () => {
  it("bounds scripted OTP sign-in abuse with the second deployable rule", () => {
    expect(config).toEqual({
      path: "/api/auth/*",
      method: "POST",
      rateLimit: {
        action: "rate_limit",
        aggregateBy: ["ip", "domain"],
        windowSize: 60,
        windowLimit: 10,
      },
    });
  });
});
