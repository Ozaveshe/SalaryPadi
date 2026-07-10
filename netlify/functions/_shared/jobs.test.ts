import { describe, expect, it } from "vitest";

import { normalizeRemotiveJob } from "../../../src/lib/jobs/normalize";
import type { RemotiveJob } from "../../../src/lib/jobs/remotive-schema";

import { createAlertCatalog, parseAlertCatalog } from "./jobs";

const sourceJob: RemotiveJob = {
  id: 42,
  url: "https://remotive.com/remote-jobs/software-dev/example-42",
  title: "Senior Platform Engineer",
  company_name: "Example Ltd",
  company_logo: "",
  category: "Software Development",
  tags: ["TypeScript", "PostgreSQL"],
  job_type: "full_time",
  publication_date: "2026-07-09T09:00:00Z",
  candidate_required_location: "Worldwide",
  salary: "$70,000-$90,000",
  description:
    "<p>Private source description must not enter the alert cache.</p>",
};

describe("alert job catalog", () => {
  it("retains matching facts but removes source descriptions", () => {
    const job = normalizeRemotiveJob(sourceJob, "2026-07-10T06:00:00Z");
    const catalog = createAlertCatalog([job], "2026-07-10T06:00:00Z");

    expect(catalog.jobs[0]).toMatchObject({
      title: "Senior Platform Engineer",
      description: "",
      requirements: null,
      benefits: null,
      riskIndicators: [],
    });
    expect(JSON.stringify(catalog)).not.toContain("Private source description");
  });

  it("rejects a stale catalog instead of silently skipping alerts", () => {
    const job = normalizeRemotiveJob(sourceJob, "2026-07-09T00:00:00Z");
    const catalog = createAlertCatalog([job], "2026-07-09T00:00:00Z");

    expect(() =>
      parseAlertCatalog(catalog, new Date("2026-07-10T00:00:01Z")),
    ).toThrow("alert_catalog_stale");
  });

  it("uses the same fourteen-hour freshness boundary as worker health", () => {
    const job = normalizeRemotiveJob(sourceJob, "2026-07-09T00:00:00Z");
    const catalog = createAlertCatalog([job], "2026-07-09T00:00:00Z");

    expect(
      parseAlertCatalog(catalog, new Date("2026-07-09T13:59:59Z")),
    ).toHaveLength(1);
    expect(() =>
      parseAlertCatalog(catalog, new Date("2026-07-09T14:00:01Z")),
    ).toThrow("alert_catalog_stale");
  });
});
