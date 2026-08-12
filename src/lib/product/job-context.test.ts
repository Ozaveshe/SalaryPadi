import { describe, expect, it } from "vitest";

import type { Job } from "@/lib/jobs/types";
import {
  contextAmountFor,
  contextIsNairaPaye,
  contextPeriodFitsCalculator,
  jobContextFrom,
  jobContextFromApplication,
  readJobContext,
  withJobContext,
} from "./job-context";

function job(overrides: Partial<Job> = {}): Job {
  return {
    slug: "senior-analyst-abc123",
    title: "Senior Analyst",
    company: { name: "Moniepoint", slug: "moniepoint" },
    salary: {
      originalText: "₦600,000 - ₦700,000 per month",
      currency: "NGN",
      minimum: 600_000,
      maximum: 700_000,
      payPeriod: "monthly",
      grossNet: "unknown",
    },
    ...overrides,
  } as unknown as Job;
}

describe("job context handoff", () => {
  it("carries role, employer and pay into a tool URL", () => {
    const url = withJobContext("/tools/take-home-pay", jobContextFrom(job()));
    const params = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/tools/take-home-pay?")).toBe(true);
    expect(params.get("from")).toBe("senior-analyst-abc123");
    expect(params.get("role")).toBe("Senior Analyst");
    expect(params.get("employer")).toBe("Moniepoint");
    expect(params.get("employerSlug")).toBe("moniepoint");
    expect(params.get("amount")).toBe("600000");
    expect(params.get("currency")).toBe("NGN");
    expect(params.get("period")).toBe("monthly");
  });

  it("round-trips through the tool page reader", () => {
    const url = withJobContext("/tools/offer-compare", jobContextFrom(job()));
    const params = Object.fromEntries(new URLSearchParams(url.split("?")[1]));
    const context = readJobContext(params);
    expect(context).toMatchObject({
      slug: "senior-analyst-abc123",
      title: "Senior Analyst",
      company: "Moniepoint",
      amount: 600_000,
      currency: "NGN",
      period: "monthly",
    });
  });

  it("prefills the lower bound of a range, never the top", () => {
    // Quoting the top of an advertised band would overstate the likely offer.
    expect(contextAmountFor(job())).toBe(600_000);
  });

  it("carries no amount when a job states no pay", () => {
    const context = jobContextFrom(job({ salary: null }));
    expect(context.amount).toBeNull();
    const params = new URLSearchParams(
      withJobContext("/tools/take-home-pay", context).split("?")[1],
    );
    expect(params.has("amount")).toBe(false);
  });

  it("carries an application to Offer Compare without inventing offer money", () => {
    const context = jobContextFromApplication({
      slug: "senior-analyst-abc123",
      title: "Senior Analyst",
      companyName: "Moniepoint",
      companySlug: "moniepoint",
    });
    const params = new URLSearchParams(
      withJobContext("/tools/offer-compare", context).split("?")[1],
    );

    expect(params.get("role")).toBe("Senior Analyst");
    expect(params.get("employer")).toBe("Moniepoint");
    expect(params.has("amount")).toBe(false);
    expect(params.has("currency")).toBe(false);
    expect(params.has("period")).toBe(false);
  });

  it("carries an hourly period for Offer Compare but bars it from the calculators", () => {
    // Offer Compare handles hourly/daily/weekly natively, so the period
    // travels; the monthly/annual calculators must refuse to prefill it —
    // silently treating an hourly rate as a monthly salary misstates pay.
    const hourly = job({
      salary: {
        originalText: "$40/hour",
        currency: "USD",
        minimum: 40,
        maximum: null,
        payPeriod: "hourly",
        grossNet: "unknown",
      },
    } as Partial<Job>);
    const url = withJobContext("/tools/offer-compare", jobContextFrom(hourly));
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("period")).toBe("hourly");
    const roundTripped = readJobContext(Object.fromEntries(params.entries()));
    expect(roundTripped?.period).toBe("hourly");
    expect(contextPeriodFitsCalculator(roundTripped)).toBe(false);
  });

  it("omits a period the tools cannot reason about at all", () => {
    const unknownPeriod = job({
      salary: {
        originalText: "Competitive",
        currency: "USD",
        minimum: 1000,
        maximum: null,
        payPeriod: "unknown",
        grossNet: "unknown",
      },
    } as Partial<Job>);
    const params = new URLSearchParams(
      withJobContext(
        "/tools/offer-compare",
        jobContextFrom(unknownPeriod),
      ).split("?")[1],
    );
    expect(params.has("period")).toBe(false);
  });

  it("rejects a malformed slug rather than rendering a broken link", () => {
    expect(readJobContext({ from: "../../etc/passwd" })).toBeNull();
    expect(readJobContext({ from: "Not A Slug" })).toBeNull();
    expect(readJobContext({})).toBeNull();
  });

  it("drops values that fail validation but keeps the job link", () => {
    const context = readJobContext({
      from: "valid-slug",
      amount: "not-a-number",
      currency: "naira",
      period: "fortnightly",
      employerSlug: "Bad Slug",
    });
    expect(context).toMatchObject({
      slug: "valid-slug",
      amount: null,
      currency: null,
      period: null,
      companySlug: null,
    });
  });

  it("treats only naira and unstated currency as PAYE-calculable", () => {
    expect(
      contextIsNairaPaye(readJobContext({ from: "a", currency: "NGN" })),
    ).toBe(true);
    expect(
      contextIsNairaPaye(readJobContext({ from: "a", currency: "USD" })),
    ).toBe(false);
  });
});
