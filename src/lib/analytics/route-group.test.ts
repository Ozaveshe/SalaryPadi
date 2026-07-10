import { describe, expect, it } from "vitest";

import { analyticsRouteGroup } from "./route-group";

describe("analytics route minimisation", () => {
  it.each([
    ["/jobs/senior-writer", "/jobs"],
    ["/companies/example", "/companies"],
    ["/tools/offer-compare", "/tools"],
    ["/privacy", "/privacy"],
    ["/unexpected/private/value", "/other"],
  ])("maps %s to a coarse allowlisted group", (path, expected) => {
    expect(analyticsRouteGroup(path)).toBe(expected);
  });
});
