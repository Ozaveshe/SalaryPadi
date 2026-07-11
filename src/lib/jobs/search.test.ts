import { describe, expect, it } from "vitest";

import { normalizeRemotiveJob } from "./normalize";
import { filterAndSortJobs, paginateJobs, parseJobSearch } from "./search";

const base = {
  id: 10,
  url: "https://remotive.com/remote-jobs/software-dev/example-10",
  title: "TypeScript Engineer",
  company_name: "Padi Labs",
  company_logo: null,
  company_logo_url: null,
  category: "Software Development",
  tags: ["TypeScript"],
  job_type: "full_time",
  publication_date: "2026-07-09T12:00:00+00:00",
  candidate_required_location: "Worldwide",
  salary: "$80k - $120k per year",
  description: "<p>Build products.</p>",
};

describe("job search", () => {
  const jobs = [normalizeRemotiveJob(base, "2026-07-10T00:00:00.000Z")];

  it("parses bounded URL filters", () => {
    const result = parseJobSearch({
      q: "engineer",
      page: "2",
      salaryDisclosed: "on",
    });
    expect(result).toMatchObject({
      q: "engineer",
      page: 2,
      salaryDisclosed: true,
    });
  });

  it("keeps valid filters when one query param is invalid", () => {
    const result = parseJobSearch({
      q: "engineer",
      eligibility: "nigeria",
      workMode: "banana",
      minSalary: "abc",
    });
    expect(result).toMatchObject({
      q: "engineer",
      eligibility: "nigeria",
      workMode: "all",
    });
    expect(result.minSalary).toBeUndefined();
  });

  it("filters explicitly Nigeria-eligible jobs", () => {
    const search = parseJobSearch({ eligibility: "nigeria" });
    expect(filterAndSortJobs(jobs, search)).toHaveLength(1);
  });

  it("returns no job for a mismatched company", () => {
    const search = parseJobSearch({ company: "Different company" });
    expect(filterAndSortJobs(jobs, search)).toHaveLength(0);
  });

  it("bounds pagination instead of loading an unbounded list", () => {
    const paginated = paginateJobs(
      Array.from({ length: 23 }, () => jobs[0]!),
      99,
      10,
    );
    expect(paginated.page).toBe(3);
    expect(paginated.items).toHaveLength(3);
  });
});
