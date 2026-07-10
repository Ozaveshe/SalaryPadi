import { describe, expect, it } from "vitest";

import {
  buildJobFingerprint,
  classifyEligibility,
  htmlToPlainText,
  normalizeRemotiveJob,
  parseSalary,
} from "./normalize";

const checkedAt = "2026-07-10T00:00:00.000Z";

describe("eligibility classification", () => {
  it.each(["Worldwide", "World"])(
    "treats %s as explicitly eligible",
    (value) => {
      const result = classifyEligibility(value, checkedAt);
      expect(result.scope).toBe("worldwide");
      expect(result.nigeria).toBe("eligible");
      expect(result.evidenceText).toBe(value);
      expect(result.provenance).toBe("source_provided");
    },
  );

  it("treats an explicit named Nigeria list as eligible", () => {
    const result = classifyEligibility("Nigeria, Ghana", checkedAt);
    expect(result.scope).toBe("named_countries");
    expect(result.nigeria).toBe("eligible");
  });

  it.each(["EMEA", "Europe, Middle East and Africa"])(
    "does not overstate ambiguous region %s",
    (value) => {
      const result = classifyEligibility(value, checkedAt);
      expect(result.nigeria).toBe("unclear");
    },
  );

  it("does not confuse South Africa with Africa-wide eligibility", () => {
    const result = classifyEligibility("South Africa", checkedAt);
    expect(result.scope).toBe("named_countries");
    expect(result.nigeria).toBe("not_eligible");
  });
});

describe("job normalization", () => {
  it("removes active HTML while preserving readable text", () => {
    const result = htmlToPlainText(
      "<p>Hello &amp; welcome</p><script>alert(1)</script><p>Next</p>",
    );
    expect(result).toContain("Hello & welcome");
    expect(result).toContain("Next");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("<script");
  });

  it("normalizes a Remotive record and keeps attribution", () => {
    const job = normalizeRemotiveJob(
      {
        id: 42,
        url: "https://remotive.com/remote-jobs/software-dev/example-42",
        title: "Senior Product Engineer",
        company_name: "Padi Labs",
        company_logo: null,
        company_logo_url: null,
        category: "Software Development",
        tags: ["TypeScript", "Remote"],
        job_type: "full_time",
        publication_date: "2026-07-09T12:00:00+00:00",
        candidate_required_location: "Worldwide",
        salary: "$80k - $120k per year",
        description: "<p>Build useful things.</p>",
      },
      checkedAt,
    );

    expect(job.source.name).toBe("Remotive");
    expect(job.source.canUseJobPostingStructuredData).toBe(false);
    expect(job.eligibility.nigeria).toBe("eligible");
    expect(job.salary).toMatchObject({
      minimum: 80_000,
      maximum: 120_000,
      currency: "USD",
      payPeriod: "annual",
    });
    expect(job.fingerprint).toHaveLength(64);
  });

  it.each(["https://evil.example/jobs/1", "https://evilremotive.com/jobs/1"])(
    "rejects a destination outside Remotive: %s",
    (url) => {
      expect(() =>
        normalizeRemotiveJob(
          {
            id: 1,
            url,
            title: "Role",
            company_name: "Company",
            company_logo: null,
            company_logo_url: null,
            category: null,
            tags: [],
            job_type: "full_time",
            publication_date: "2026-07-09T12:00:00+00:00",
            candidate_required_location: "Worldwide",
            salary: null,
            description: "<p>Text</p>",
          },
          checkedAt,
        ),
      ).toThrow(/outside/);
    },
  );
});

describe("salary and duplicate normalization", () => {
  it("preserves unknown salary context without inventing a period", () => {
    expect(parseSalary("NGN 900,000 - 1.2m")).toMatchObject({
      currency: "NGN",
      minimum: 900_000,
      maximum: 1_200_000,
      payPeriod: "unknown",
    });
  });

  it("creates stable duplicate fingerprints", () => {
    const first = buildJobFingerprint({
      title: "Senior Engineer",
      company: "Acme!",
      location: "Worldwide",
      arrangement: "employee",
    });
    const second = buildJobFingerprint({
      title: " senior  engineer ",
      company: "ACME",
      location: "worldwide",
      arrangement: "employee",
    });
    expect(first).toBe(second);
  });
});
