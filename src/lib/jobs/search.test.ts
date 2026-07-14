import { describe, expect, it } from "vitest";

import { normalizeRemotiveJob } from "./normalize";
import {
  diversifyJobResults,
  filterAndSortJobs,
  paginateJobs,
  parseJobSearch,
  serializeJobSearch,
} from "./search";

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

  it("round-trips Africa-specific evidence filters through the URL", () => {
    const search = parseJobSearch({
      path: "remote_africa",
      hndAccepted: true,
      hmo: "true",
      fxPolicy: "1",
    });
    expect(serializeJobSearch(search).toString()).toContain(
      "path=remote_africa",
    );
    expect(serializeJobSearch(search).toString()).toContain("hndAccepted=true");
    expect(serializeJobSearch(search).toString()).toContain("hmo=true");
    expect(serializeJobSearch(search).toString()).toContain("fxPolicy=true");
  });

  it("filters only on evidence actually present in job text", () => {
    const evidenced = {
      ...jobs[0]!,
      description: "BSc/HND accepted. HMO and a data allowance are provided.",
    };
    expect(
      filterAndSortJobs(
        [evidenced],
        parseJobSearch({ hndAccepted: "on", hmo: "on" }),
      ),
    ).toHaveLength(1);
    expect(
      filterAndSortJobs([evidenced], parseJobSearch({ payReliability: "on" })),
    ).toHaveLength(0);
  });

  it("interleaves repeated employers and locations without dropping jobs", () => {
    const repeated = Array.from({ length: 8 }, (_, index) => ({
      ...jobs[0]!,
      id: `repeat-${index}`,
      slug: `repeat-${index}`,
      company: { ...jobs[0]!.company, name: "Repeat Ltd", slug: "repeat" },
      locationDisplay: index % 2 === 0 ? "Lagos, Nigeria" : "Lagos / Nigeria",
    }));
    const alternatives = [
      {
        ...jobs[0]!,
        id: "other-a",
        slug: "other-a",
        company: { ...jobs[0]!.company, name: "Other A", slug: "other-a" },
        locationDisplay: "Abuja, Nigeria",
      },
      {
        ...jobs[0]!,
        id: "other-b",
        slug: "other-b",
        company: { ...jobs[0]!.company, name: "Other B", slug: "other-b" },
        locationDisplay: "Accra, Ghana",
      },
    ];
    const diversified = diversifyJobResults([...repeated, ...alternatives]);

    expect(diversified).toHaveLength(10);
    expect(new Set(diversified.map((job) => job.id)).size).toBe(10);
    expect(
      new Set(diversified.slice(0, 3).map((job) => job.company.slug)),
    ).toEqual(new Set(["repeat", "other-a", "other-b"]));
  });
});
