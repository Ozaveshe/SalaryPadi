import { describe, expect, it, vi, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  countryEligibility,
  jobCountryUrl,
  type CountryEligibilityEvidence,
} from "./country-eligibility";
import { normalizeRemotiveJob } from "./normalize";
import {
  filterAndSortJobs,
  parseJobSearch,
  serializeJobSearch,
  jobAlertSearchSpecSchema,
} from "./search";
import { toCandidateProfile, toJobFacts } from "@/lib/match/adapt";
import { scoreJobMatch } from "@/lib/match/score";
import { publicEligibilityStatement } from "@/lib/presentation/public-field";
import { buildJobDecisionPlan } from "./decision-plan";
import { JobCard } from "@/components/jobs/job-card";
import {
  matchAlertJobs,
  renderAlertEmail,
} from "../../../netlify/functions/_shared/job-alert-delivery";

const now = new Date("2026-10-03T12:00:00Z");
function evidence(
  overrides: Partial<CountryEligibilityEvidence> = {},
): CountryEligibilityEvidence {
  return {
    scope: "worldwide",
    includedCountries: [],
    excludedCountries: [],
    nigeria: "eligible",
    ...overrides,
  };
}
function job(id: number, eligibility = evidence()) {
  const normalized = normalizeRemotiveJob(
    {
      id,
      title: "TypeScript Engineer",
      company_name: "Fixture employer",
      company_logo: null,
      company_logo_url: null,
      url: `https://remotive.com/remote-jobs/software-dev/fixture-${id}`,
      category: "Software Development",
      tags: ["TypeScript"],
      job_type: "full_time",
      publication_date: "2026-10-03T09:00:00Z",
      candidate_required_location: "Worldwide",
      salary: "",
      description: "Build TypeScript applications.",
    },
    now.toISOString(),
  );
  return {
    ...normalized,
    source: { ...normalized.source, canEmail: true },
    eligibility: {
      ...normalized.eligibility,
      ...eligibility,
      includedCountries: [...eligibility.includedCountries],
      excludedCountries: [...eligibility.excludedCountries],
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("applicant country evidence", () => {
  it.each([
    [evidence(), "KE", "eligible", "worldwide"],
    [evidence({ scope: "africa" }), "gh", "eligible", "africa"],
    [evidence({ scope: "africa" }), "Ghana", "eligible", "africa"],
    [evidence({ scope: "africa" }), "US", "unclear", "unclear"],
    [evidence({ scope: "emea" }), "NG", "unclear", "unclear"],
    [evidence({ scope: "unclear" }), "ZA", "unclear", "unclear"],
    [evidence({ scope: "restricted_region" }), "NG", "unclear", "unclear"],
    [evidence({ scope: "nigeria" }), "NG", "eligible", "named"],
    [evidence({ scope: "nigeria" }), "KE", "not_eligible", "excluded"],
    [
      evidence({
        scope: "named_countries",
        includedCountries: ["Kenya", "Ghana"],
      }),
      "KE",
      "eligible",
      "named",
    ],
    [
      evidence({ scope: "named_countries", includedCountries: ["KE"] }),
      "Ghana",
      "not_eligible",
      "excluded",
    ],
    [evidence({ scope: "named_countries" }), "KE", "unclear", "unclear"],
    [
      evidence({ excludedCountries: ["Kenya"] }),
      "KE",
      "not_eligible",
      "excluded",
    ],
    [
      evidence({ includedCountries: ["KE"], excludedCountries: ["Kenya"] }),
      "KE",
      "not_eligible",
      "excluded",
    ],
    [
      evidence({ scope: "africa", excludedCountries: ["NG"] }),
      "Nigeria",
      "not_eligible",
      "excluded",
    ],
    [
      evidence({ nigeria: "not_eligible", includedCountries: ["Nigeria"] }),
      "NG",
      "not_eligible",
      "excluded",
    ],
    [
      evidence({
        excludedCountries: ["unmapped location"],
        includedCountries: ["Kenya"],
      }),
      "KE",
      "unclear",
      "unclear",
    ],
    [
      evidence({ includedCountries: ["unmapped location"] }),
      "KE",
      "unclear",
      "unclear",
    ],
    [evidence(), "invalid", "unclear", "unclear"],
  ] as const)("resolves %j for %s as %s", (facts, country, state, basis) => {
    expect(countryEligibility(facts, country)).toMatchObject({ state, basis });
  });

  it("preserves an explicit country exclusion in all application surfaces", () => {
    const excluded = job(1, evidence({ excludedCountries: ["Ghana"] }));
    expect(publicEligibilityStatement(excluded, "africa", "GH")).toContain(
      "does not accept",
    );
    expect(
      buildJobDecisionPlan(excluded, now, "africa", "GH").checks[0],
    ).toMatchObject({ state: "check", action: "source" });
  });

  it("keeps unsupported regions out of confirmed search and country alerts", () => {
    const jobs = [
      job(1),
      job(2, evidence({ scope: "africa" })),
      job(
        3,
        evidence({ scope: "named_countries", includedCountries: ["Ghana"] }),
      ),
      job(4, evidence({ scope: "emea" })),
      job(5, evidence({ excludedCountries: ["Kenya"] })),
    ];
    const search = parseJobSearch({
      applicantCountry: "KE",
      path: "remote_africa",
    });
    expect(filterAndSortJobs(jobs, search, now).map((j) => j.id)).toEqual([
      "remotive-1",
      "remotive-2",
    ]);
    const needsConfirmation = { ...search, eligibility: "unclear" as const };
    expect(
      filterAndSortJobs(jobs, needsConfirmation, now).map((j) => j.id),
    ).toEqual(["remotive-4"]);
    const claim = {
      delivery_id: "00000000-0000-4000-8000-000000000001",
      claim_token: "00000000-0000-4000-8000-000000000002",
      alert_id: "00000000-0000-4000-8000-000000000003",
      recipient_email: "fixture@example.test",
      search_spec: { ...needsConfirmation, schema_version: 1 as const },
      cadence: "daily" as const,
      last_sent_at: null,
    };
    expect(matchAlertJobs(claim, jobs, now).map((j) => j.id)).toEqual([
      "remotive-1",
      "remotive-2",
    ]);
    expect(
      matchAlertJobs(
        claim,
        [{ ...jobs[0]!, source: { ...jobs[0]!.source, canEmail: false } }],
        now,
      ),
    ).toEqual([]);
  });

  it("normalizes source names against profile codes on the shipped match adapter", () => {
    const role = job(
      1,
      evidence({
        scope: "named_countries",
        includedCountries: ["Kenya"],
        nigeria: "not_eligible",
      }),
    );
    const profile = toCandidateProfile({
      experience_level: "mid",
      desired_work_arrangement: "remote",
      desired_salary_min: null,
      desired_salary_max: null,
      desired_currency_code: null,
      desired_pay_period: null,
      location_country: "KE",
      open_to_relocation: false,
    });
    expect(
      scoreJobMatch(profile, toJobFacts(role)).dimensions.find(
        (d) => d.code === "location",
      ),
    ).toMatchObject({ state: "scored", score: 1 });
    expect(
      scoreJobMatch(
        { ...profile, locationCountry: "NG", openToRelocation: true },
        toJobFacts(role),
      ).dimensions.find((d) => d.code === "location"),
    ).toMatchObject({ state: "scored", score: 0 });
    expect(
      scoreJobMatch(
        profile,
        toJobFacts(job(2, evidence({ scope: "emea" }))),
      ).dimensions.find((d) => d.code === "location"),
    ).toMatchObject({ state: "unknown" });
  });

  it("round-trips selected country and retains schema-v1 alerts without it", () => {
    const parsed = parseJobSearch({
      applicantCountry: "ke",
      q: "engineer",
      page: "2",
    });
    expect(parsed.applicantCountry).toBe("KE");
    expect(
      parseJobSearch(Object.fromEntries(serializeJobSearch(parsed))),
    ).toEqual({ ...parsed, page: 1 });
    expect(
      jobAlertSearchSpecSchema.parse({ schema_version: 1, q: "engineer" })
        .applicantCountry,
    ).toBe("");
    expect(
      jobAlertSearchSpecSchema.safeParse({
        schema_version: 1,
        applicantCountry: "US",
      }).success,
    ).toBe(false);
    expect(
      parseJobSearch({ applicantCountry: "invalid", q: "engineer" }),
    ).toMatchObject({ applicantCountry: "", q: "engineer" });
    expect(jobCountryUrl("role", "ke")).toBe("/jobs/role?applicantCountry=KE");
    expect(jobCountryUrl("role", "invalid")).toBe("/jobs/role");
  });

  it("shows a country explanation and preserves the country on details and email links", () => {
    const role = job(1);
    const html = renderToStaticMarkup(
      createElement(JobCard, {
        job: role,
        applicantCountry: "KE",
        eligibilityAudience: "africa",
      }),
    );
    expect(html).toContain("worldwide hiring, including Kenya");
    expect(html).toContain(`href="/jobs/${role.slug}?applicantCountry=KE"`);
    vi.stubGlobal("Netlify", {
      env: {
        get: (key: string) =>
          key === "NEXT_PUBLIC_APP_URL" ? "https://salarypadi.com" : undefined,
      },
    });
    const email = renderAlertEmail([role], "KE");
    expect(email.subject).toContain("Kenya");
    expect(email.text).toContain("worldwide hiring, including Kenya");
    expect(email.html).toContain("/jobs/remotive-1?applicantCountry=KE");
  });
});
