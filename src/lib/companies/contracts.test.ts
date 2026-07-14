import { describe, expect, it } from "vitest";

import {
  companyCitationSchema,
  employerResponseSchema,
  ratingSchema,
} from "./contracts";

describe("company intelligence public contracts", () => {
  it("rejects a rating below five independent reviews", () => {
    expect(
      ratingSchema.safeParse({
        company_slug: "acme",
        sample_size: 4,
        overall_rating: 4.9,
        confidence_label: "low",
        computed_at: "2026-07-14T00:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("accepts only an approved factual source kind", () => {
    const base = {
      id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      fact_key: "website",
      source_url: "https://example.com/about",
      source_title: "Official company page",
      source_published_at: null,
      retrieved_at: "2026-07-14T00:00:00Z",
      fact_checked_at: "2026-07-14T00:00:00Z",
      review_due_at: "2027-01-14T00:00:00Z",
      status: "current",
    };
    expect(
      companyCitationSchema.safeParse({ ...base, source_kind: "official_site" })
        .success,
    ).toBe(true);
    expect(
      companyCitationSchema.safeParse({ ...base, source_kind: "review_site" })
        .success,
    ).toBe(false);
  });

  it("keeps employer responses anonymous at the public boundary", () => {
    const response = employerResponseSchema.parse({
      id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      company_slug: "acme",
      response_kind: "right_of_reply",
      statement: "We have updated the published policy.",
      source_url: "https://example.com/policy",
      published_at: "2026-07-14T00:00:00Z",
      updated_at: "2026-07-14T00:00:00Z",
      provenance_label: "Verified employer response",
      author_user_id: "private-user-id",
      work_email: "person@example.com",
    });

    expect(response).not.toHaveProperty("author_user_id");
    expect(response).not.toHaveProperty("work_email");
  });
});
