import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { JobCard } from "@/components/jobs/job-card";
import {
  JobQuickFacts,
  JobTrustSummary,
} from "@/components/jobs/job-trust-summary";
import type { Job } from "@/lib/jobs/types";

import {
  PROHIBITED_PUBLIC_LABELS,
  publicEligibilityStatement,
  publicEnum,
  publicLocation,
} from "./public-field";

/**
 * A job whose every uncertain field carries an internal uncertainty
 * sentinel. Public components must render it without printing any of the
 * prohibited internal labels — uncertain fields are omitted, not labelled.
 */
function uncertainJob(): Job {
  return {
    id: "test-uncertain",
    slug: "test-uncertain",
    status: "open",
    workMode: "unclear",
    arrangement: "unknown",
    eligibility: {
      nigeria: "unclear",
      africa: "unclear",
      scope: "unclear",
      includedCountries: [],
      excludedCountries: [],
      requiredTimezone: null,
      workAuthorization: null,
      visaSponsorship: "unclear",
      relocationSupport: "unclear",
      evidenceText: "",
      provenance: "inferred",
      lastVerifiedAt: "2026-07-14T00:00:00.000Z",
    },
    locationDisplay: "Location not stated",
    experienceLevel: "unknown",
    employmentType: "unknown",
    title: "Test Role",
    category: null,
    skills: [],
    company: { name: "Test Employer", slug: "test-employer" },
    description: "A role used only by the prohibited-label regression test.",
    salary: null,
    postedAt: "2026-07-14T00:00:00.000Z",
    lastCheckedAt: "2026-07-14T00:00:00.000Z",
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

describe("public presentation of uncertain fields", () => {
  it("maps uncertainty sentinels to omission, never to labels", () => {
    expect(publicEnum("unknown")).toBeNull();
    expect(publicEnum("unspecified")).toBeNull();
    expect(publicEnum("unclear")).toBeNull();
    expect(publicEnum(null)).toBeNull();
    expect(publicEnum("full_time")).toBe("Full Time");
    expect(publicLocation(uncertainJob())).toBeNull();
    expect(publicEligibilityStatement(uncertainJob())).toBeNull();
  });

  it("resolves one candidate-facing eligibility statement", () => {
    const base = uncertainJob();
    expect(
      publicEligibilityStatement({
        ...base,
        workMode: "remote",
        eligibility: { ...base.eligibility, nigeria: "eligible" },
      } as Job),
    ).toBe("Applicants in Nigeria can apply");
    expect(
      publicEligibilityStatement({
        ...base,
        workMode: "onsite",
        locationDisplay: "Lagos, Nigeria",
      } as Job),
    ).toBe("On-site role in Nigeria");
    expect(
      publicEligibilityStatement({
        ...base,
        workMode: "unclear",
        locationDisplay: "Lagos, Nigeria",
      } as Job),
    ).toBe("Role based in Nigeria");
    expect(
      publicEligibilityStatement({
        ...base,
        workMode: "remote",
        eligibility: { ...base.eligibility, nigeria: "not_eligible" },
      } as Job),
    ).toBe("Not open to applicants in Nigeria");
  });
});

describe("prohibited public labels regression", () => {
  it("job cards never print internal uncertainty or diagnostic labels", () => {
    const html = renderToStaticMarkup(
      createElement(JobCard, { job: uncertainJob() }),
    );

    for (const label of PROHIBITED_PUBLIC_LABELS) {
      expect(html).not.toContain(label);
    }
  });

  it("job detail quick facts and trust drawer never print internal labels", () => {
    const job = uncertainJob();
    const html =
      renderToStaticMarkup(createElement(JobQuickFacts, { job })) +
      renderToStaticMarkup(createElement(JobTrustSummary, { job }));

    for (const label of PROHIBITED_PUBLIC_LABELS) {
      expect(html).not.toContain(label);
    }
    expect(html).toContain("How SalaryPadi verified this information");
  });

  it("job cards for known values still render the useful facts", () => {
    const base = uncertainJob();
    const html = renderToStaticMarkup(
      createElement(JobCard, {
        job: {
          ...base,
          workMode: "remote",
          employmentType: "full_time",
          experienceLevel: "senior",
          locationDisplay: "Worldwide",
          eligibility: { ...base.eligibility, nigeria: "eligible" },
        } as Job,
      }),
    );

    expect(html).toContain("Applicants in Nigeria can apply");
    expect(html).toContain("Full Time");
    expect(html).toContain("Senior");
    for (const label of PROHIBITED_PUBLIC_LABELS) {
      expect(html).not.toContain(label);
    }
  });
});
