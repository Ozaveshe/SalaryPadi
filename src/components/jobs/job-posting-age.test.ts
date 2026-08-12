import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { JobCard } from "@/components/jobs/job-card";
import { JobTrustSummary } from "@/components/jobs/job-trust-summary";
import type { Job } from "@/lib/jobs/types";

const DAY_MS = 86_400_000;

/**
 * A minimal open role. Only the posting date varies across these cases —
 * everything else is held constant so the assertions are about the age
 * treatment and nothing else.
 */
function jobPostedDaysAgo(days: number): Job {
  return {
    id: "age-fixture",
    slug: "age-fixture",
    status: "open",
    workMode: "onsite",
    arrangement: "unknown",
    eligibility: {
      nigeria: "eligible",
      africa: "eligible",
      scope: "country",
      includedCountries: ["Nigeria"],
      excludedCountries: [],
      requiredTimezone: null,
      workAuthorization: null,
      visaSponsorship: "unclear",
      relocationSupport: "unclear",
      evidenceText:
        "The employer source explicitly lists Nigeria among the accepted hiring locations.",
      provenance: "source_provided",
      lastVerifiedAt: new Date(Date.now() - DAY_MS).toISOString(),
    },
    locationDisplay: "Lagos, Nigeria",
    experienceLevel: "mid",
    employmentType: "full_time",
    title: "Operations Analyst",
    category: null,
    skills: [],
    company: { name: "Test Employer", slug: "test-employer" },
    description: "A role used only by the posting-age regression test.",
    salary: null,
    postedAt: new Date(Date.now() - days * DAY_MS).toISOString(),
    lastCheckedAt: new Date(Date.now() - DAY_MS).toISOString(),
    validThrough: null,
    sourceUrl: "https://example.test/job",
    applicationUrl: "https://example.test/job/apply",
    source: {
      id: "src",
      name: "Test Source",
      type: "permitted_api",
      termsUrl: null,
    },
  } as unknown as Job;
}

function cardMarkup(days: number) {
  return renderToStaticMarkup(
    createElement(JobCard, { job: jobPostedDaysAgo(days) }),
  );
}

describe("job card posting-age decay", () => {
  it("shows the evidence behind eligibility and identifies the source relationship", () => {
    const html = cardMarkup(10);
    expect(html).toContain("Why this eligibility label:");
    expect(html).toContain(
      "The employer source explicitly lists Nigeria among the accepted hiring locations.",
    );
    expect(html).toContain("Reviewed job source");
    expect(html).not.toContain("permitted_api");
  });

  it("labels a direct employer source without claiming every source is direct", () => {
    const direct = jobPostedDaysAgo(10);
    direct.source.type = "employer";
    const html = renderToStaticMarkup(createElement(JobCard, { job: direct }));
    expect(html).toContain("Direct employer source");
    expect(html).not.toContain("Reviewed partner source");
  });

  it("bounds long eligibility evidence on a result card", () => {
    const verbose = jobPostedDaysAgo(10);
    verbose.eligibility.evidenceText = `Nigeria is explicitly named ${"evidence ".repeat(50)}`;
    const html = renderToStaticMarkup(createElement(JobCard, { job: verbose }));
    expect(html).toContain("Nigeria is explicitly named");
    expect(html).toContain("…");
    expect(html).not.toContain("evidence ".repeat(30));
  });

  it("leaves a recent role undecorated", () => {
    const html = cardMarkup(10);
    expect(html).toContain('data-posting-age="current"');
    expect(html).not.toContain("Posted over");
  });

  it("decays a role posted more than three months ago", () => {
    const html = cardMarkup(120);
    expect(html).toContain('data-posting-age="aging"');
    expect(html).toContain("Posted over 3 months ago");
    expect(html).toContain("status-warning");
  });

  it("hardens the decay past six months", () => {
    const html = cardMarkup(200);
    expect(html).toContain('data-posting-age="stale"');
    expect(html).toContain("Posted over 6 months ago");
  });

  it("keeps the decayed role fully applicable, not visually removed", () => {
    const html = cardMarkup(200);
    expect(html).toContain("View role and apply");
    expect(html).toContain("Operations Analyst");
  });
});

describe("job detail posting-age caution", () => {
  it("labels an unknown apply host without claiming employer ownership", () => {
    const html = renderToStaticMarkup(
      createElement(JobTrustSummary, { job: jobPostedDaysAgo(10) }),
    );
    expect(html).toContain("Apply destination:");
    expect(html).toContain("External application page (example.test)");
    expect(html).toContain("employer ownership is not verified");
  });

  it("identifies a known employer ATS and known aggregator deterministically", () => {
    const ats = jobPostedDaysAgo(10);
    ats.applicationUrl = "https://boards.greenhouse.io/example/jobs/123";
    const atsHtml = renderToStaticMarkup(
      createElement(JobTrustSummary, { job: ats }),
    );
    expect(atsHtml).toContain("Employer applicant tracking system");
    expect(atsHtml).toContain("boards.greenhouse.io");

    const aggregator = jobPostedDaysAgo(10);
    aggregator.applicationUrl = "https://linkedin.com/jobs/view/123";
    const aggregatorHtml = renderToStaticMarkup(
      createElement(JobTrustSummary, { job: aggregator }),
    );
    expect(aggregatorHtml).toContain("Job aggregator (linkedin.com)");
  });

  it("says nothing about age for a recent role", () => {
    const html = renderToStaticMarkup(
      createElement(JobTrustSummary, { job: jobPostedDaysAgo(10) }),
    );
    expect(html).not.toContain("still carries this posting");
    expect(html).not.toContain("Age of the source posting");
  });

  it("states exactly what the source evidence supports", () => {
    const html = renderToStaticMarkup(
      createElement(JobTrustSummary, { job: jobPostedDaysAgo(200) }),
    );
    expect(html).toContain("The source still carries this posting");
    expect(html).toContain("more than 6 months old");
    expect(html).toContain(
      "Remaining listed is not evidence that the role is still open",
    );
    expect(html).toContain("Age of the source posting");
    expect(html).toContain("200 days");
  });

  it("never asserts the vacancy is filled or closed", () => {
    const html = renderToStaticMarkup(
      createElement(JobTrustSummary, { job: jobPostedDaysAgo(200) }),
    );
    expect(html).not.toMatch(
      /\bthis (?:role|vacancy) (?:is|has been) filled\b/i,
    );
    expect(html).not.toMatch(/\bno longer (?:open|accepting)\b/i);
  });
});
