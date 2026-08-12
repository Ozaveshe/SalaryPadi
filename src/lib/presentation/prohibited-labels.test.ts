import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { JobCard } from "@/components/jobs/job-card";
import { JobPreviewPanel } from "@/components/jobs/job-preview-panel";
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

  it("keeps a description dumped into the location field out of the location", () => {
    const base = uncertainJob();
    // Observed on live ATS rows: the feed appends the whole description, markup
    // included, to the location string.
    expect(
      publicLocation({
        ...base,
        locationDisplay:
          "Home based - Worldwide. <p>We are hiring <strong>2026 Graduate Software Engineers</strong> into engineering teams around the world.</p>",
      } as Job),
    ).toBe("Home based - Worldwide.");
    expect(
      publicLocation({
        ...base,
        locationDisplay: `We are hiring engineers. ${"Long prose without any markup at all. ".repeat(5)}`,
      } as Job),
    ).toBeNull();
    expect(
      publicLocation({
        ...base,
        locationDisplay:
          "Cameroon; Ethiopia; Kenya; Niger; Nigeria; Togo; Uganda; Zambia",
      } as Job),
    ).toBe("Cameroon; Ethiopia; Kenya; Niger; Nigeria; Togo; Uganda; Zambia");
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

  it("shows unresolved readiness checks without exposing internal labels", () => {
    // The uncertain fixture now has evidence checks to resolve. The summary
    // row therefore has real user-facing content instead of being an empty
    // labelled container.
    const html = renderToStaticMarkup(
      createElement(JobCard, { job: uncertainJob() }),
    );

    expect(html).toContain('aria-label="Role summary"');
    expect(html).toContain("2 checks before applying");
    for (const label of PROHIBITED_PUBLIC_LABELS) {
      expect(html).not.toContain(label);
    }

    // Existing public eligibility evidence continues to share the same row.
    const withBadge = renderToStaticMarkup(
      createElement(JobCard, {
        job: {
          ...uncertainJob(),
          workMode: "remote",
          eligibility: {
            ...uncertainJob().eligibility,
            nigeria: "eligible",
          },
        } as Job,
      }),
    );
    expect(withBadge).toContain('aria-label="Role summary"');
    expect(withBadge).toContain("Applicants in Nigeria can apply");
  });

  it("the jobs quick-view panel never prints internal labels", () => {
    const html = renderToStaticMarkup(
      createElement(JobPreviewPanel, { job: uncertainJob() }),
    );

    for (const label of PROHIBITED_PUBLIC_LABELS) {
      expect(html).not.toContain(label);
    }
    // The panel summarises a role, so it must carry the same caution the
    // detail page does rather than reading as a confirmed listing.
    expect(html).toContain("Test Source");
    expect(html).toContain("Full details");
  });

  it("the quick-view panel repeats the unconfirmed remote-eligibility caution", () => {
    const base = uncertainJob();
    const html = renderToStaticMarkup(
      createElement(JobPreviewPanel, {
        job: { ...base, workMode: "remote" } as Job,
      }),
    );

    expect(html).toContain(
      "Generic remote wording is not proof that applicants in Nigeria can apply",
    );
    for (const label of PROHIBITED_PUBLIC_LABELS) {
      expect(html).not.toContain(label);
    }
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
