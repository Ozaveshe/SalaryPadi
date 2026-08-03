import { describe, expect, it } from "vitest";

import { looksLikeEdgeChallenge } from "../e2e/support/public-surface";

/**
 * Guards the one decision that separates "production is broken" from
 * "our own test client was blocked at the edge".
 *
 * Both directions matter, and they are not symmetric. A missed challenge wastes
 * an investigation at the wrong layer. A FALSE challenge is worse: it would
 * excuse a real outage as an infrastructure block, which is exactly the kind of
 * quiet green this suite exists to prevent.
 */

/** Verbatim from the challenge served to CI on 2026-08-03 (run 30779783574). */
const OBSERVED_CHALLENGE = `
salarypadi.com
We are verifying your connection.
This will only take a few seconds...
Security by Netlify
Challenge ID: 01KZ2QXN8MKAW5YYR090CC977Z
`;

/** Verbatim from a real (if unstreamed) SalaryPadi page in the same run. */
const OBSERVED_REAL_PAGE = `
Skip to main content Salary Padi Jobs Companies Pay & offers My career Sign in
Post a job Loading the latest verified information… Salary Padi Fresh jobs
Africans can actually apply for, with pay, company truth and decision tools in
one path. Missing evidence stays missing. © 2026 SalaryPadi. Explore Jobs
Companies Salaries Tools Insights Contribute Trust About Methodology Trust &
safety Privacy Terms Optional analytics Read the privacy notice.
`;

describe("looksLikeEdgeChallenge", () => {
  it("recognises the challenge that actually blocked production acceptance", () => {
    expect(looksLikeEdgeChallenge(OBSERVED_CHALLENGE)).toBe(true);
  });

  it("does not flag a real page, even one stuck on its loading skeleton", () => {
    expect(looksLikeEdgeChallenge(OBSERVED_REAL_PAGE)).toBe(false);
  });

  it("does not flag ordinary copy that happens to contain one marker", () => {
    // "Security by" is normal English on a trust page. One marker is not enough.
    expect(
      looksLikeEdgeChallenge(
        "Trust & safety. Security by design: we never sell your salary data.",
      ),
    ).toBe(false);
  });

  it("survives the typographic folding normalize() applies", () => {
    // Curly apostrophes, an ellipsis character and a non-breaking space are all
    // things a CDN template can emit; none of them should hide a challenge.
    expect(
      looksLikeEdgeChallenge(
        "We are verifying your connection… Challenge ID: ABC123",
      ),
    ).toBe(true);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(
      looksLikeEdgeChallenge(
        "  WE ARE VERIFYING YOUR CONNECTION\n\n\n   CHALLENGE ID:   XYZ  ",
      ),
    ).toBe(true);
  });

  it("treats empty and whitespace-only text as not a challenge", () => {
    expect(looksLikeEdgeChallenge("")).toBe(false);
    expect(looksLikeEdgeChallenge("   \n\t  ")).toBe(false);
  });
});
