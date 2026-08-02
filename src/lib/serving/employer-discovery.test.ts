import { describe, expect, it } from "vitest";

import {
  buildDiscoveryQueue,
  scoreEmployerCandidate,
  type EmployerCandidate,
} from "./employer-discovery";

const NOW = new Date("2026-08-02T00:00:00Z");

function candidate(
  overrides: Partial<EmployerCandidate> = {},
): EmployerCandidate {
  return {
    name: "Example Ltd",
    domain: "example.com",
    atsTenant: "greenhouse:example",
    discoveredVia: "careers_page_link",
    nigeriaPresence: true,
    africaPresence: true,
    remoteHiringEvidence: false,
    observedOpenRoles: 12,
    latestPostingAt: "2026-07-28T00:00:00Z",
    userRequestCount: 0,
    underrepresentedFunctions: [],
    alreadyRegistered: false,
    ...overrides,
  };
}

describe("employer discovery scoring", () => {
  it("ranks a Nigerian employer with a direct ATS board highest", () => {
    const nigerian = scoreEmployerCandidate(candidate(), NOW);
    const elsewhere = scoreEmployerCandidate(
      candidate({ nigeriaPresence: false, africaPresence: false }),
      NOW,
    );
    expect(nigerian.score).toBeGreaterThan(elsewhere.score);
    expect(nigerian.reasons.join(" ")).toContain("Hires in Nigeria");
  });

  it("prefers a direct ATS board over a bare careers domain", () => {
    const withAts = scoreEmployerCandidate(candidate(), NOW);
    const withoutAts = scoreEmployerCandidate(
      candidate({ atsTenant: null }),
      NOW,
    );
    expect(withAts.score).toBeGreaterThan(withoutAts.score);
  });

  it("trusts a careers-page link more than a vendor sweep", () => {
    const linked = scoreEmployerCandidate(candidate(), NOW);
    const swept = scoreEmployerCandidate(
      candidate({ discoveredVia: "vendor_sweep" }),
      NOW,
    );
    expect(linked.score).toBeGreaterThan(swept.score);
  });

  it("caps the value of raw volume so one huge board cannot dominate", () => {
    // 84.3% concentration came from exactly this shape.
    const modest = scoreEmployerCandidate(
      candidate({ observedOpenRoles: 10 }),
      NOW,
    );
    const enormous = scoreEmployerCandidate(
      candidate({ observedOpenRoles: 2_000 }),
      NOW,
    );
    expect(enormous.score - modest.score).toBeLessThanOrEqual(10);
  });

  it("rewards an employer that fills a thin job category", () => {
    const filler = scoreEmployerCandidate(
      candidate({ underrepresentedFunctions: ["nursing", "education"] }),
      NOW,
    );
    expect(filler.score).toBeGreaterThan(
      scoreEmployerCandidate(candidate(), NOW).score,
    );
  });

  it("counts user demand but does not let it swamp evidence", () => {
    const requested = scoreEmployerCandidate(
      candidate({ userRequestCount: 50 }),
      NOW,
    );
    const base = scoreEmployerCandidate(candidate(), NOW);
    expect(requested.score - base.score).toBeLessThanOrEqual(15);
  });
});

describe("discovery blockers", () => {
  it("blocks a zombie board whose newest posting is a year old", () => {
    const zombie = scoreEmployerCandidate(
      candidate({ latestPostingAt: "2025-06-01T00:00:00Z" }),
      NOW,
    );
    expect(zombie.reviewable).toBe(false);
    expect(zombie.blockers.join(" ")).toMatch(/dormant/);
  });

  it("blocks a board probed with zero open roles", () => {
    const empty = scoreEmployerCandidate(
      candidate({ observedOpenRoles: 0 }),
      NOW,
    );
    expect(empty.reviewable).toBe(false);
  });

  it("blocks a candidate whose identity cannot be resolved deterministically", () => {
    // A name alone is not an identity — the lesson from greenhouse:carbon.
    const nameOnly = scoreEmployerCandidate(
      candidate({ domain: null, atsTenant: null }),
      NOW,
    );
    expect(nameOnly.reviewable).toBe(false);
    expect(nameOnly.blockers.join(" ")).toMatch(/deterministically/);
  });

  it("blocks an employer already in the registry", () => {
    const existing = scoreEmployerCandidate(
      candidate({ alreadyRegistered: true }),
      NOW,
    );
    expect(existing.reviewable).toBe(false);
  });

  it("never marks a candidate publishable — only reviewable", () => {
    const scored = scoreEmployerCandidate(candidate(), NOW);
    expect(scored.reviewable).toBe(true);
    // Nothing in the result grants publication; registration is a human step.
    expect(Object.keys(scored)).not.toContain("publishable");
  });
});

describe("discovery queue", () => {
  it("orders reviewable candidates by score and keeps blocked ones visible", () => {
    const queue = buildDiscoveryQueue(
      [
        candidate({
          name: "Weak",
          nigeriaPresence: false,
          africaPresence: false,
          atsTenant: null,
          discoveredVia: "vendor_sweep",
        }),
        candidate({ name: "Strong" }),
        candidate({ name: "Zombie", latestPostingAt: "2024-01-01T00:00:00Z" }),
      ],
      NOW,
    );
    expect(queue.reviewable.map((entry) => entry.candidate.name)).toEqual([
      "Strong",
      "Weak",
    ]);
    // Blocked candidates are reported, not silently dropped, so the same
    // dormant boards are not rediscovered every sweep.
    expect(queue.blocked.map((entry) => entry.candidate.name)).toEqual([
      "Zombie",
    ]);
  });

  it("explains every score so a reviewer can disagree with it", () => {
    const queue = buildDiscoveryQueue([candidate()], NOW);
    expect(queue.reviewable[0]?.reasons.length).toBeGreaterThan(2);
  });
});
