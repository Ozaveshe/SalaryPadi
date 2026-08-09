import { describe, expect, it } from "vitest";

import { normalizeRemotiveJob } from "./normalize";
import {
  diversifyJobResults,
  filterAndSortJobs,
  hasAdvancedJobFilters,
  jobAlertSearchSpecSchema,
  nigeriaValueTier,
  paginateJobs,
  parseJobSearch,
  parseStoredJobAlertSearch,
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

  it("accepts a sparse but canonical stored alert search", () => {
    expect(
      jobAlertSearchSpecSchema.parse({
        schema_version: 1,
        q: "engineer",
        page: 2,
        salaryDisclosed: true,
      }),
    ).toMatchObject({
      schema_version: 1,
      q: "engineer",
      page: 2,
      salaryDisclosed: true,
      workMode: "all",
    });
  });

  it.each([
    { schema_version: 2 },
    { schema_version: 1, unreviewedFilter: true },
    { schema_version: 1, page: "2" },
    { schema_version: 1, salaryDisclosed: "on" },
    { schema_version: 1, q: " engineer " },
  ])("rejects a non-canonical stored alert search: %o", (searchSpec) => {
    expect(jobAlertSearchSpecSchema.safeParse(searchSpec).success).toBe(false);
  });

  it("rejects malformed hidden alert JSON instead of broadening the search", () => {
    expect(
      parseStoredJobAlertSearch(
        JSON.stringify({ q: "engineer", workMode: "banana" }),
      ),
    ).toBeNull();
    expect(
      parseStoredJobAlertSearch(
        JSON.stringify({ q: "engineer", salaryDisclosed: "on" }),
      ),
    ).toBeNull();
    expect(parseStoredJobAlertSearch("not-json")).toBeNull();
    expect(parseStoredJobAlertSearch(undefined)).toMatchObject({
      q: "",
      workMode: "all",
    });
  });

  it("keeps worldwide wording out of the explicit Nigeria filter", () => {
    // The fixture's evidence is "Worldwide": a Nigerian may apply, but the
    // source never named Nigeria. The explicit filter must not infer it.
    expect(
      filterAndSortJobs(jobs, parseJobSearch({ eligibility: "nigeria" })),
    ).toHaveLength(0);
    expect(
      filterAndSortJobs(jobs, parseJobSearch({ eligibility: "nigeria_open" })),
    ).toHaveLength(1);
    expect(
      filterAndSortJobs(jobs, parseJobSearch({ eligibility: "worldwide" })),
    ).toHaveLength(1);
    // Worldwide wording is not Africa evidence either.
    expect(
      filterAndSortJobs(jobs, parseJobSearch({ eligibility: "africa" })),
    ).toHaveLength(0);
  });

  it("matches the explicit Nigeria filter when the source names Nigeria", () => {
    const namedNigeria = normalizeRemotiveJob(
      { ...base, id: 12, candidate_required_location: "Nigeria" },
      "2026-07-10T00:00:00.000Z",
    );
    const matches = filterAndSortJobs(
      [...jobs, namedNigeria],
      parseJobSearch({ eligibility: "nigeria" }),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.eligibility.scope).toBe("nigeria");
  });

  it("returns no job for a mismatched company", () => {
    const search = parseJobSearch({ company: "Different company" });
    expect(filterAndSortJobs(jobs, search)).toHaveLength(0);
  });

  it("finds a job through role synonyms, ranked below literal matches", () => {
    const platform = normalizeRemotiveJob(
      { ...base, id: 11, title: "Platform Engineer", tags: [] },
      "2026-07-10T00:00:00.000Z",
    );
    const literal = normalizeRemotiveJob(
      { ...base, id: 12, title: "DevOps Lead", tags: [] },
      "2026-07-10T00:00:00.000Z",
    );

    const results = filterAndSortJobs(
      [platform, literal],
      parseJobSearch({ q: "devops", sort: "relevance" }),
    );

    expect(results.map((job) => job.title)).toEqual([
      "DevOps Lead",
      "Platform Engineer",
    ]);
  });

  it("does not let synonyms broaden an unrelated query", () => {
    const search = parseJobSearch({ q: "welder" });
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

  it("does not surface an expired job even if its stored status is open", () => {
    const expired = {
      ...jobs[0]!,
      validThrough: "2000-01-01T00:00:00.000Z",
    };
    expect(filterAndSortJobs([expired], parseJobSearch({}))).toEqual([]);
  });

  it("does not surface a job with publication evidence beyond clock tolerance", () => {
    const now = new Date("2026-07-10T00:00:00.000Z");
    const future = {
      ...jobs[0]!,
      postedAt: "2026-07-10T00:05:00.001Z",
    };
    expect(filterAndSortJobs([future], parseJobSearch({}), now)).toEqual([]);
  });

  it("anchors the local Nigeria path to a stated Nigerian workplace", () => {
    const locationDisplay = "Lagos, Nigeria";
    const unclear = {
      ...jobs[0]!,
      workMode: "unclear" as const,
      locationDisplay,
    };
    const hybrid = { ...unclear, workMode: "hybrid" as const };
    const remote = { ...unclear, workMode: "remote" as const };
    const search = parseJobSearch({ path: "local_nigeria" });

    expect(filterAndSortJobs([unclear], search)).toEqual([unclear]);
    expect(filterAndSortJobs([hybrid], search)).toEqual([hybrid]);
    expect(filterAndSortJobs([remote], search)).toEqual([]);
  });

  it("ranks Nigeria-local and Nigeria-eligible roles first by default", () => {
    const base = jobs[0]!;
    const newestForeign = {
      ...base,
      id: "newest-foreign",
      workMode: "remote" as const,
      eligibility: { ...base.eligibility, nigeria: "unclear" as const },
      postedAt: "2026-07-09T00:00:00.000Z",
    };
    const olderLagos = {
      ...base,
      id: "older-lagos",
      workMode: "unclear" as const,
      locationDisplay: "Lagos, Nigeria",
      postedAt: "2026-06-01T00:00:00.000Z",
    };
    const olderRemoteEligible = {
      ...base,
      id: "older-remote-eligible",
      workMode: "remote" as const,
      eligibility: { ...base.eligibility, nigeria: "eligible" as const },
      postedAt: "2026-06-15T00:00:00.000Z",
    };
    const now = new Date("2026-07-10T00:00:00.000Z");

    expect(
      filterAndSortJobs(
        [newestForeign, olderLagos, olderRemoteEligible],
        parseJobSearch({}),
        now,
      ).map((job) => job.id),
    ).toEqual(["older-lagos", "older-remote-eligible", "newest-foreign"]);
  });

  it("uses a bounded fallback when a caller supplies an invalid page size", () => {
    const repeated = Array.from({ length: 12 }, () => jobs[0]!);
    expect(paginateJobs(repeated, 1, 0).items).toHaveLength(10);
    expect(paginateJobs(repeated, 1, 1_000).items).toHaveLength(12);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5])(
    "uses the first page for an invalid direct page value: %s",
    (page) => {
      const repeated = Array.from({ length: 12 }, () => jobs[0]!);
      expect(paginateJobs(repeated, page, 5)).toMatchObject({
        page: 1,
        totalPages: 3,
        items: expect.any(Array),
      });
      expect(paginateJobs(repeated, page, 5).items).toHaveLength(5);
    },
  );

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
    // An explicit user sort is honoured verbatim: no employer reshuffle.
    expect(
      diversifyJobResults([...repeated, ...alternatives], "newest"),
    ).toEqual([...repeated, ...alternatives]);
    expect(
      diversifyJobResults([...repeated, ...alternatives], "salary"),
    ).toEqual([...repeated, ...alternatives]);

    expect(diversified).toHaveLength(10);
    expect(new Set(diversified.map((job) => job.id)).size).toBe(10);
    expect(
      new Set(diversified.slice(0, 3).map((job) => job.company.slug)),
    ).toEqual(new Set(["repeat", "other-a", "other-b"]));
  });
});

describe("advanced filter disclosure", () => {
  it("stays closed for a plain keyword search", () => {
    expect(hasAdvancedJobFilters(parseJobSearch({ q: "engineer" }))).toBe(
      false,
    );
  });

  it("opens when a choice, flag, text, sort or salary filter is applied", () => {
    const cases: Record<string, unknown>[] = [
      { workMode: "remote" },
      { visaSponsorship: "on" },
      { company: "Moniepoint" },
      { timezone: "GMT+1" },
      { sort: "newest" },
      { minSalary: "500000" },
      { postedWithin: "7" },
    ];
    for (const input of cases) {
      expect(
        hasAdvancedJobFilters(parseJobSearch(input)),
        JSON.stringify(input),
      ).toBe(true);
    }
  });

  it("ignores the always-visible controls", () => {
    expect(
      hasAdvancedJobFilters(
        parseJobSearch({
          q: "engineer",
          location: "Lagos",
          eligibility: "nigeria",
          page: "3",
        }),
      ),
    ).toBe(false);
  });
});

describe("nigeriaValueTier", () => {
  const checkedAt = "2026-07-10T00:00:00.000Z";
  const remoteFor = (location: string, id: number) =>
    normalizeRemotiveJob(
      { ...base, id, candidate_required_location: location },
      checkedAt,
    );

  it("does not lift a Nigeria-excluded Africa role above an eligibility-unclear one", () => {
    // "Kenya, Ghana": Africa-eligible but Nigeria not_eligible. It must not
    // outrank a plain-remote role of unclear eligibility — the exact card ↔
    // ranker contradiction (the card labels it "not including Nigeria").
    const excludedAfrica = remoteFor("Kenya, Ghana", 21);
    const unclearRemote = remoteFor("Remote", 22);
    expect(excludedAfrica.eligibility.nigeria).toBe("not_eligible");
    expect(excludedAfrica.eligibility.africa).toBe("eligible");
    expect(nigeriaValueTier(excludedAfrica)).toBe(0);
    expect(nigeriaValueTier(excludedAfrica)).toBeLessThanOrEqual(
      nigeriaValueTier(unclearRemote),
    );
  });

  it("still lifts an Africa-inclusive role that does not exclude Nigeria", () => {
    // EMEA remote: Africa-eligible, Nigeria unclear (not excluded) — a Nigerian
    // may well be able to apply, so it keeps its lift above unclear roles.
    const emeaRemote = remoteFor("EMEA", 23);
    expect(emeaRemote.eligibility.africa).toBe("eligible");
    expect(emeaRemote.eligibility.nigeria).not.toBe("not_eligible");
    expect(nigeriaValueTier(emeaRemote)).toBe(1);
  });
});
