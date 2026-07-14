import { describe, expect, it } from "vitest";

import {
  buildJobFingerprint,
  classifyEligibility,
  htmlToPlainText,
  normalizeRemotiveJob,
  PAY_PERIOD_ANNUALIZATION_FACTORS,
  parseSalary,
  SALARY_ANNUALIZATION_ASSUMPTIONS,
} from "./normalize";
import {
  buildLegacyJobFingerprint,
  canonicalizeJobDestination,
  JOB_FINGERPRINT_VERSION,
} from "./fingerprint";

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

  it.each([
    ["Remote (Nigeria preferred)", "nigeria", "eligible"],
    ["Africa & EMEA", "africa", "eligible"],
    ["LATAM/Africa", "africa", "eligible"],
  ] as const)(
    "handles compound eligibility evidence: %s",
    (value, scope, nigeria) => {
      const result = classifyEligibility(value, checkedAt);
      expect(result).toMatchObject({ scope, nigeria });
      expect(result.evidenceText).toBe(value);
    },
  );

  it.each([
    ["Côte d'Ivoire", "Côte d'Ivoire"],
    ["Ivory Coast", "Côte d'Ivoire"],
    ["DRC", "Democratic Republic of the Congo"],
    ["UAE", "United Arab Emirates"],
  ])("recognizes the country variant %s", (value, country) => {
    const result = classifyEligibility(value, checkedAt);
    expect(result.scope).toBe("named_countries");
    expect(result.includedCountries).toContain(country);
  });

  it.each(["Remote", "Flexible", "Work from wherever the team agrees"])(
    "keeps unsupported evidence unclear: %s",
    (value) => {
      expect(classifyEligibility(value, checkedAt)).toMatchObject({
        scope: "unclear",
        nigeria: "unclear",
      });
    },
  );
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

  it.each([
    "https://evil.example/jobs/1",
    "https://evilremotive.com/jobs/1",
    "https://user:secret@remotive.com/jobs/1",
    "https://remotive.com:8443/jobs/1",
  ])("rejects a destination outside Remotive: %s", (url) => {
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
  });
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

  it("does not read a following word as a magnitude multiplier", () => {
    expect(parseSalary("40000 - 60000 Kč")).toMatchObject({
      minimum: 40_000,
      maximum: 60_000,
    });
    expect(parseSalary("$4,000 - $6,000 monthly")).toMatchObject({
      currency: "USD",
      minimum: 4_000,
      maximum: 6_000,
      payPeriod: "monthly",
    });
    expect(parseSalary("₦250,000 monthly")).toMatchObject({
      currency: "NGN",
      minimum: 250_000,
      maximum: 250_000,
      payPeriod: "monthly",
    });
  });

  it("honors attached and spaced magnitude suffixes", () => {
    expect(parseSalary("$120k - $150k per year")).toMatchObject({
      currency: "USD",
      minimum: 120_000,
      maximum: 150_000,
      payPeriod: "annual",
    });
    expect(parseSalary("$120 k - $150 k per year")).toMatchObject({
      currency: "USD",
      minimum: 120_000,
      maximum: 150_000,
      payPeriod: "annual",
    });
  });

  it("orders a reversed salary range before exposing it", () => {
    expect(parseSalary("$150k - $120k per year")).toMatchObject({
      currency: "USD",
      minimum: 120_000,
      maximum: 150_000,
      payPeriod: "annual",
    });
  });

  it.each([
    "0 monthly",
    "99999999999999999999 monthly",
    "$100,000,000 per year",
    "$100,000 per hour",
    "EUR 100,000,000 per year",
    "GBP 100,000,000 per year",
    "NGN 100,000,000,000 monthly",
    "KES 1,000,000,000 per year",
    "GHS 200,000,000 per year",
    "ZAR 200,000,000 per year",
  ])("drops an implausible salary instead of blocking the job: %s", (value) => {
    expect(parseSalary(value)).toBeNull();
  });

  it("rejects a mixed-currency range instead of guessing a currency", () => {
    expect(parseSalary("USD 80,000 - NGN 120,000 per year")).toBeNull();
  });

  it("keeps a plain-number salary currency unknown", () => {
    expect(parseSalary("40,000 - 60,000 monthly")).toMatchObject({
      currency: null,
      minimum: 40_000,
      maximum: 60_000,
      payPeriod: "monthly",
    });
  });

  it("derives annualization factors from documented work-year assumptions", () => {
    expect(PAY_PERIOD_ANNUALIZATION_FACTORS).toMatchObject({
      hourly:
        SALARY_ANNUALIZATION_ASSUMPTIONS.weeksPerYear *
        SALARY_ANNUALIZATION_ASSUMPTIONS.workHoursPerWeek,
      daily:
        SALARY_ANNUALIZATION_ASSUMPTIONS.weeksPerYear *
        SALARY_ANNUALIZATION_ASSUMPTIONS.workDaysPerWeek,
      weekly: SALARY_ANNUALIZATION_ASSUMPTIONS.weeksPerYear,
      monthly: 12,
      annual: 1,
      unknown: null,
    });
  });

  it("degrades a rejected source salary to no salary on the job", () => {
    const job = normalizeRemotiveJob(
      {
        id: 43,
        url: "https://remotive.com/remote-jobs/software-dev/example-43",
        title: "Product Engineer",
        company_name: "Padi Labs",
        company_logo: null,
        company_logo_url: null,
        category: "Software Development",
        tags: [],
        job_type: "full_time",
        publication_date: "2026-07-09T12:00:00+00:00",
        candidate_required_location: "Worldwide",
        salary: "$100,000,000 per year",
        description: "<p>Build useful things.</p>",
      },
      checkedAt,
    );

    expect(job.salary).toBeNull();
  });

  it("creates stable duplicate fingerprints", () => {
    const first = buildJobFingerprint({
      title: "Senior Engineer",
      company: "Acme!",
      location: "Worldwide",
      arrangement: "employee",
      destination: "https://jobs.example.test/openings/123",
    });
    const second = buildJobFingerprint({
      title: " senior  engineer ",
      company: "ACME",
      location: "worldwide",
      arrangement: "employee",
      destination: "https://jobs.example.test/openings/123",
    });
    expect(first).toBe(second);
  });

  it("keeps distinct openings with the same visible facts separate", () => {
    const first = buildJobFingerprint({
      title: "Engineer",
      company: "Acme",
      location: "Lagos",
      arrangement: "employee",
      destination: "https://jobs.example.test/openings/123",
    });
    const second = buildJobFingerprint({
      title: "Engineer",
      company: "Acme",
      location: "Lagos",
      arrangement: "employee",
      destination: "https://jobs.example.test/openings/456",
    });

    expect(first).not.toBe(second);
  });

  it("removes destination tracking noise but retains identity parameters", () => {
    const first = buildJobFingerprint({
      title: "Engineer",
      company: "Acme",
      location: "Lagos, Nigeria",
      arrangement: "employee",
      destination:
        "https://JOBS.EXAMPLE.TEST:443/openings/123?utm_source=feed&gclid=123&ref=remotive&source=api&department=engineering#apply",
    });
    const second = buildJobFingerprint({
      title: "Engineer",
      company: "Acme",
      location: "lagos nigeria",
      arrangement: "employee",
      destination:
        "https://jobs.example.test/openings/123?department=engineering",
    });
    const distinctDepartment = buildJobFingerprint({
      title: "Engineer",
      company: "Acme",
      location: "Lagos, Nigeria",
      arrangement: "employee",
      destination: "https://jobs.example.test/openings/123?department=sales",
    });

    expect(first).toBe(second);
    expect(first).not.toBe(distinctDepartment);
  });

  it.each([
    [
      "https://jobs.lever.co/acme/role-123/apply?utm_campaign=hiring",
      "https://jobs.lever.co/acme/role-123",
    ],
    [
      "https://jobs.ashbyhq.com/acme/role-123/application?fbclid=123",
      "https://jobs.ashbyhq.com/acme/role-123",
    ],
  ])("folds a known ATS apply page into its posting path", (apply, posting) => {
    expect(canonicalizeJobDestination(apply)).toBe(
      canonicalizeJobDestination(posting),
    );
  });

  it("versions v2 without losing the exact legacy transition key", () => {
    const input = {
      title: "Engineer",
      company: "Acme",
      location: "Lagos",
      arrangement: "employee" as const,
      destination: "https://jobs.example.test/openings/123?utm_source=feed",
    };

    expect(JOB_FINGERPRINT_VERSION).toBe(2);
    expect(buildJobFingerprint(input)).not.toBe(
      buildLegacyJobFingerprint(input),
    );
  });

  it("keeps the pre-v2 hash byte-compatible for transition lookups", () => {
    expect(
      buildLegacyJobFingerprint({
        title: "Ingénieur",
        company: "Côte Labs",
        location: "Lagos",
        arrangement: "employee",
        destination:
          "https://Jobs.Example.test/openings/123?utm_source=feed#apply",
      }),
    ).toBe("ab7a6d7b897dcceff293192ca3592aeb7f98021fa14c811ec9175d04953312bc");
  });
});
