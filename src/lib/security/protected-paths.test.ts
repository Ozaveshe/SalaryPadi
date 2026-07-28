import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  getAppOrigin: () => "https://salarypadi.com",
}));

import robots from "@/app/robots";
import {
  isProtectedPagePath,
  PROTECTED_CRAWLER_DISALLOW,
  PROTECTED_PAGE_PREFIXES,
} from "@/lib/security/protected-paths";

function disallowRules(): string[] {
  const rules = robots().rules;
  const first = Array.isArray(rules) ? rules[0] : rules;
  const disallow = first?.disallow ?? [];
  return Array.isArray(disallow) ? disallow : [disallow];
}

describe("protected page paths", () => {
  it("treats every listed prefix and its descendants as protected", () => {
    for (const prefix of PROTECTED_PAGE_PREFIXES) {
      expect(isProtectedPagePath(prefix), prefix).toBe(true);
      expect(isProtectedPagePath(`${prefix}/nested`), prefix).toBe(true);
    }
  });

  it("keeps public company evidence pages unprotected", () => {
    expect(isProtectedPagePath("/companies/example-ltd")).toBe(false);
    expect(isProtectedPagePath("/companies/example-ltd/reviews")).toBe(false);
    expect(isProtectedPagePath("/contribute")).toBe(false);
  });

  it("protects the per-company claim and respond actions", () => {
    expect(isProtectedPagePath("/companies/example-ltd/claim")).toBe(true);
    expect(isProtectedPagePath("/companies/example-ltd/respond")).toBe(true);
  });
});

describe("robots.txt agreement with the request proxy", () => {
  it("disallows every path the proxy protects", () => {
    const disallow = disallowRules();
    for (const rule of PROTECTED_CRAWLER_DISALLOW) {
      expect(disallow, rule).toContain(rule);
    }
  });

  it("never advertises a protected path as allowed", () => {
    const rules = robots().rules;
    const first = Array.isArray(rules) ? rules[0] : rules;
    const allow = first?.allow ?? [];
    const allowed = Array.isArray(allow) ? allow : [allow];
    for (const path of allowed) {
      // "/" is the root grant that the disallow list narrows.
      if (path === "/") continue;
      expect(isProtectedPagePath(path.replace(/\/$/, "")), path).toBe(false);
    }
  });
});
