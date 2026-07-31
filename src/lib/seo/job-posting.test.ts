import { describe, expect, it } from "vitest";

import { normalizeRemotiveJob } from "@/lib/jobs/normalize";

import {
  buildJobPostingStructuredData,
  hasIndexableDescription,
  METADATA_ONLY_DESCRIPTION_SENTINEL,
} from "./job-posting";

const sourceJob = normalizeRemotiveJob(
  {
    id: 44,
    url: "https://remotive.com/remote-jobs/software-dev/example-44",
    title: "Platform Engineer",
    company_name: "Padi Labs",
    company_logo: null,
    company_logo_url: null,
    category: "Software Development",
    tags: ["TypeScript", "PostgreSQL"],
    job_type: "full_time",
    publication_date: "2026-07-09T12:00:00+00:00",
    candidate_required_location: "Nigeria, Ghana",
    salary: "USD 6000 - 8000 per month",
    description:
      "<p>Build trusted career systems for millions of Nigerian job seekers: design ingestion pipelines, verify employer evidence, and keep provenance visible on every posting so applicants can trust what they read before they apply.</p>",
  },
  "2026-07-10T00:00:00.000Z",
);

describe("JobPosting structured data", () => {
  it("refuses markup when the source policy does not permit it", () => {
    expect(
      buildJobPostingStructuredData(
        sourceJob,
        "https://salarypadi.example/jobs/platform-engineer",
      ),
    ).toBeNull();
  });

  it("refuses markup for a source occurrence that is not canonical data", () => {
    expect(
      buildJobPostingStructuredData(
        {
          ...sourceJob,
          source: {
            ...sourceJob.source,
            canIndex: true,
            canUseJobPostingStructuredData: true,
          },
        },
        "https://salarypadi.example/jobs/platform-engineer",
      ),
    ).toBeNull();
  });

  it("emits source-permitted remote eligibility and compensation evidence", () => {
    const job = {
      ...sourceJob,
      databaseId: "canonical-job-id",
      source: {
        ...sourceJob.source,
        type: "employer" as const,
        canIndex: true,
        canUseJobPostingStructuredData: true,
      },
      company: {
        ...sourceJob.company,
        verification: "employer_verified" as const,
      },
    };

    expect(
      buildJobPostingStructuredData(
        job,
        "https://salarypadi.example/jobs/platform-engineer",
      ),
    ).toMatchObject({
      "@type": "JobPosting",
      directApply: false,
      employmentType: "FULL_TIME",
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: [
        { "@type": "Country", name: "Nigeria" },
        { "@type": "Country", name: "Ghana" },
      ],
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "USD",
        value: {
          "@type": "QuantitativeValue",
          minValue: 6000,
          maxValue: 8000,
          unitText: "MONTH",
        },
      },
    });
  });

  it("refuses markup for expired jobs", () => {
    const job = {
      ...sourceJob,
      databaseId: "canonical-job-id",
      status: "expired" as const,
      source: {
        ...sourceJob.source,
        canIndex: true,
        canUseJobPostingStructuredData: true,
      },
    };

    expect(
      buildJobPostingStructuredData(
        job,
        "https://salarypadi.example/jobs/platform-engineer",
      ),
    ).toBeNull();
  });

  it("publishes a country alongside the locality for a physical location", () => {
    const job = {
      ...sourceJob,
      databaseId: "canonical-job-id",
      workMode: "onsite" as const,
      locationDisplay: "Lagos, Nigeria",
      source: {
        ...sourceJob.source,
        canIndex: true,
        canUseJobPostingStructuredData: true,
      },
    };

    const structuredData = buildJobPostingStructuredData(
      job,
      "https://salarypadi.example/jobs/platform-engineer",
    );

    expect(structuredData?.jobLocation).toEqual({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Lagos",
        addressCountry: "NG",
      },
    });
  });

  it("states no country when the source location never named one", () => {
    const job = {
      ...sourceJob,
      databaseId: "canonical-job-id",
      workMode: "onsite" as const,
      locationDisplay: "Head office",
      source: {
        ...sourceJob.source,
        canIndex: true,
        canUseJobPostingStructuredData: true,
      },
    };

    const structuredData = buildJobPostingStructuredData(
      job,
      "https://salarypadi.example/jobs/platform-engineer",
    );

    expect(structuredData?.jobLocation).toEqual({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Head office",
      },
    });
  });

  it("refuses markup when an otherwise-open job has passed validThrough", () => {
    const job = {
      ...sourceJob,
      databaseId: "canonical-job-id",
      validThrough: "2000-01-01T00:00:00.000Z",
      source: {
        ...sourceJob.source,
        canIndex: true,
        canUseJobPostingStructuredData: true,
      },
    };

    expect(
      buildJobPostingStructuredData(
        job,
        "https://salarypadi.example/jobs/platform-engineer",
      ),
    ).toBeNull();
  });
});

describe("hasIndexableDescription", () => {
  const base = { description: "x".repeat(200) } as Parameters<
    typeof hasIndexableDescription
  >[0];

  it("accepts a substantial stored description", () => {
    expect(hasIndexableDescription(base)).toBe(true);
  });

  it("rejects the metadata-only placeholder verbatim", () => {
    expect(
      hasIndexableDescription({
        ...base,
        description: METADATA_ONLY_DESCRIPTION_SENTINEL,
      }),
    ).toBe(false);
  });

  it("rejects thin descriptions under the floor", () => {
    expect(
      hasIndexableDescription({ ...base, description: "Short role blurb." }),
    ).toBe(false);
  });
});
