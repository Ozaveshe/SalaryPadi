import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { trustedClientNetworkAddress } from "./client-network";

function request(headers: HeadersInit) {
  return new Request("https://salarypadi.com/api/example", { headers });
}

describe("trusted client network address", () => {
  it.each(["203.0.113.8", "2001:db8::1"])(
    "accepts a platform-supplied IP address: %s",
    (address) => {
      expect(
        trustedClientNetworkAddress(
          request({ "x-nf-client-connection-ip": address }),
        ),
      ).toBe(address);
    },
  );

  it("ignores forwarding headers without the trusted platform header", () => {
    expect(
      trustedClientNetworkAddress(
        request({ "x-forwarded-for": "203.0.113.8" }),
      ),
    ).toBe("unknown");
  });

  it.each(["", "not-an-ip", "203.0.113.8, 198.51.100.2"])(
    "rejects an invalid platform value: %s",
    (address) => {
      expect(
        trustedClientNetworkAddress(
          request({ "x-nf-client-connection-ip": address }),
        ),
      ).toBe("unknown");
    },
  );
});
