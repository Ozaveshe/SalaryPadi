import { describe, expect, it } from "vitest";

import { normalizeRemotiveJob } from "./normalize";
import { isJobCurrentlyPublishable } from "./publication";

const now = new Date("2026-07-14T12:00:00.000Z");
const job = normalizeRemotiveJob(
  {
    id: 10,
    url: "https://remotive.com/remote-jobs/software-dev/example-10",
    title: "TypeScript Engineer",
    company_name: "Padi Labs",
    company_logo: null,
    company_logo_url: null,
    category: "Software Development",
    tags: ["TypeScript"],
    job_type: "full_time",
    publication_date: "2026-07-14T10:00:00+00:00",
    candidate_required_location: "Worldwide",
    salary: "$80k - $120k per year",
    description: "<p>Build products.</p>",
  },
  "2026-07-14T11:00:00.000Z",
);

describe("job publication state", () => {
  it("accepts a coherent current open job", () => {
    expect(isJobCurrentlyPublishable(job, now)).toBe(true);
  });

  it.each([
    ["closed lifecycle", { status: "expired" as const }],
    ["past deadline", { validThrough: "2026-07-14T11:59:59.000Z" }],
    ["malformed deadline", { validThrough: "not-a-date" }],
    ["future publication", { postedAt: "2026-07-14T12:05:00.001Z" }],
    ["future source check", { lastCheckedAt: "2026-07-14T12:05:00.001Z" }],
    [
      "future eligibility evidence",
      {
        eligibility: {
          ...job.eligibility,
          lastVerifiedAt: "2026-07-14T12:05:00.001Z",
        },
      },
    ],
  ])("rejects %s", (_label, override) => {
    expect(isJobCurrentlyPublishable({ ...job, ...override }, now)).toBe(false);
  });

  it("allows the documented five-minute source clock tolerance", () => {
    expect(
      isJobCurrentlyPublishable(
        { ...job, postedAt: "2026-07-14T12:05:00.000Z" },
        now,
      ),
    ).toBe(true);
  });
});
