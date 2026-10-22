import { describe, expect, it } from "vitest";
import { normalizeRemotiveJob } from "../../../src/lib/jobs/normalize";
import { jobAlertSearchSpecSchema } from "../../../src/lib/jobs/search";
import {
  alertJobKey,
  matchAlertJobs,
  type AlertClaim,
} from "./job-alert-delivery";

const now = new Date("2026-10-22T12:00:00Z");
const claim: AlertClaim = {
  delivery_id: "00000000-0000-4000-8000-000000000001",
  claim_token: "00000000-0000-4000-8000-000000000002",
  alert_id: "00000000-0000-4000-8000-000000000003",
  recipient_email: "reader@example.test",
  search_spec: jobAlertSearchSpecSchema.parse({
    schema_version: 1,
    applicantCountry: "KE",
  }),
  cadence: "daily",
  last_sent_at: "2026-10-21T12:00:00Z",
};
function job(id: number, country = "Worldwide") {
  const value = normalizeRemotiveJob(
    {
      id,
      url: `https://remotive.com/remote-jobs/engineering/role-${id}`,
      title: `Engineer ${id}`,
      company_name: "Example",
      company_logo: "",
      category: "Engineering",
      tags: [],
      job_type: "full_time",
      publication_date: "2026-10-18T12:00:00Z",
      candidate_required_location: country,
      salary: "",
      description: "<p>A real source fixture description.</p>",
    },
    now.toISOString(),
  );
  value.source = { ...value.source, canEmail: true };
  return value;
}

describe("country alert delivery", () => {
  it("includes late-discovered open jobs, but never repeats delivered roles", () => {
    const first = job(1);
    const jobs = [first, job(2)];
    expect(
      matchAlertJobs(claim, jobs, now, new Set([alertJobKey(first)])),
    ).toEqual([jobs[1]]);
  });
  it("deduplicates title variants sharing the same application destination", () => {
    const first = job(1);
    expect(
      matchAlertJobs(claim, [first, { ...first, title: "Updated title" }], now),
    ).toHaveLength(1);
  });
  it("carries overflow into a later digest instead of losing roles after ten", () => {
    const jobs = Array.from({ length: 13 }, (_, index) => job(index + 1));
    const first = matchAlertJobs(claim, jobs, now);
    const second = matchAlertJobs(
      claim,
      jobs,
      now,
      new Set(first.map(alertJobKey)),
    );
    expect(first).toHaveLength(10);
    expect(second).toHaveLength(3);
    expect(second.every((value) => !first.includes(value))).toBe(true);
  });
  it("excludes the wrong country, explicit exclusions, vague EMEA and expired jobs", () => {
    const excluded = job(3);
    excluded.eligibility.excludedCountries = ["KE"];
    const expired = job(4);
    expired.validThrough = "2026-10-21T12:00:00Z";
    const stale = job(5);
    stale.lastCheckedAt = "2026-10-20T12:00:00Z";
    const kenya = job(6, "Kenya");
    expect(
      matchAlertJobs(
        claim,
        [job(1, "Ghana"), job(2, "EMEA"), excluded, expired, stale, kenya],
        now,
      ),
    ).toEqual([kenya]);
  });
  it("uses only unrestricted worldwide roles when no country was selected", () => {
    const global = job(1);
    expect(
      matchAlertJobs(
        {
          ...claim,
          search_spec: jobAlertSearchSpecSchema.parse({ schema_version: 1 }),
        },
        [global, job(2, "Kenya")],
        now,
      ),
    ).toEqual([global]);
  });
});
