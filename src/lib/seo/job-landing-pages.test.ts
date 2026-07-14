import { describe, expect, it } from "vitest";

import type { Job } from "@/lib/jobs/types";

import {
  evaluateJobLandingIndexability,
  getJobLandingDefinition,
  matchesJobLanding,
  type JobLandingMetrics,
} from "./job-landing-pages";

function metrics(
  overrides: Partial<JobLandingMetrics> = {},
): JobLandingMetrics {
  return {
    key: "remote_nigeria",
    activeUniqueJobs: 20,
    uniqueJobsSeen90Days: 30,
    companyCount: 3,
    stableDemandSignal: true,
    lastModified: "2026-07-14T00:00:00.000Z",
    measuredAt: "2026-07-14T00:00:00.000Z",
    ...overrides,
  };
}

const job = {
  status: "open",
  workMode: "remote",
  eligibility: {
    nigeria: "eligible",
    visaSponsorship: "no",
    lastVerifiedAt: "2026-07-14T00:00:00.000Z",
  },
  locationDisplay: "Worldwide",
  experienceLevel: "mid",
  employmentType: "full_time",
  title: "Software Engineer",
  category: "Software Development",
  company: { name: "Padi Labs" },
  description: "Build software.",
  postedAt: "2026-07-14T00:00:00.000Z",
  lastCheckedAt: "2026-07-14T00:00:00.000Z",
  validThrough: null,
} as Job;

describe("programmatic job landing gates", () => {
  it("requires every exact threshold and a reviewed demand signal", () => {
    const definition = getJobLandingDefinition("remote_nigeria");
    if (!definition) throw new Error("definition missing");
    expect(
      evaluateJobLandingIndexability(definition, metrics()).indexable,
    ).toBe(true);
    expect(
      evaluateJobLandingIndexability(
        definition,
        metrics({ activeUniqueJobs: 19, stableDemandSignal: false }),
      ),
    ).toMatchObject({
      indexable: false,
      reasons: expect.arrayContaining([
        "active_unique_jobs_below_20",
        "stable_demand_signal_missing",
      ]),
    });
  });

  it("keeps generic remote unclear and requires positive sponsorship evidence", () => {
    expect(matchesJobLanding(job, "remote_nigeria")).toBe(true);
    expect(
      matchesJobLanding(
        {
          ...job,
          eligibility: { ...job.eligibility, nigeria: "unclear" },
        },
        "remote_nigeria",
      ),
    ).toBe(false);
    expect(matchesJobLanding(job, "visa_sponsorship_nigeria")).toBe(false);
    expect(
      matchesJobLanding(
        {
          ...job,
          eligibility: { ...job.eligibility, visaSponsorship: "yes" },
        },
        "visa_sponsorship_nigeria",
      ),
    ).toBe(true);
  });

  it("requires a physical work mode for local Nigeria and Lagos landings", () => {
    const unclear = {
      ...job,
      workMode: "unclear" as const,
      locationDisplay: "Lagos, Nigeria",
    };
    const hybrid = { ...unclear, workMode: "hybrid" as const };

    expect(matchesJobLanding(unclear, "nigeria_local")).toBe(false);
    expect(matchesJobLanding(unclear, "city_lagos")).toBe(false);
    expect(matchesJobLanding(hybrid, "nigeria_local")).toBe(true);
    expect(matchesJobLanding(hybrid, "city_lagos")).toBe(true);
  });
});
