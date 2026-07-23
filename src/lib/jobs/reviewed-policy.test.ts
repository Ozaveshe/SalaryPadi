import { describe, expect, it } from "vitest";

import {
  REVIEWED_POLICY_SELECT_COLUMNS,
  reviewedPolicyMismatch,
  reviewedPolicyRowSchema,
  type ReviewedPolicyRow,
  type ReviewedSourceExpectation,
} from "./reviewed-policy";
import {
  HIMALAYAS_ADAPTER_KEY,
  HIMALAYAS_REQUIRED_DESTINATION_KIND,
  HIMALAYAS_SOURCE_POLICY,
  HIMALAYAS_TERMS_VERSION,
  JOBICY_ADAPTER_KEY,
  JOBICY_REQUIRED_DESTINATION_KIND,
  JOBICY_SOURCE_POLICY,
  JOBICY_TERMS_VERSION,
  REMOTIVE_ADAPTER_KEY,
  REMOTIVE_REQUIRED_DESTINATION_KIND,
  REMOTIVE_SOURCE_POLICY,
  REMOTIVE_TERMS_VERSION,
} from "./source-policy";

const remotiveReviewed: ReviewedSourceExpectation = {
  adapterKey: REMOTIVE_ADAPTER_KEY,
  policy: REMOTIVE_SOURCE_POLICY,
  termsVersion: REMOTIVE_TERMS_VERSION,
  requiredDestinationKind: REMOTIVE_REQUIRED_DESTINATION_KIND,
};

const jobicyReviewed: ReviewedSourceExpectation = {
  adapterKey: JOBICY_ADAPTER_KEY,
  policy: JOBICY_SOURCE_POLICY,
  termsVersion: JOBICY_TERMS_VERSION,
  requiredDestinationKind: JOBICY_REQUIRED_DESTINATION_KIND,
};

const himalayasReviewed: ReviewedSourceExpectation = {
  adapterKey: HIMALAYAS_ADAPTER_KEY,
  policy: HIMALAYAS_SOURCE_POLICY,
  termsVersion: HIMALAYAS_TERMS_VERSION,
  requiredDestinationKind: HIMALAYAS_REQUIRED_DESTINATION_KIND,
};

function matchingRow(reviewed: ReviewedSourceExpectation): ReviewedPolicyRow {
  return {
    adapter_key: reviewed.adapterKey,
    source_type: reviewed.policy.type,
    terms_url: reviewed.policy.termsUrl,
    terms_reviewed_at: "2026-07-14T00:00:00+00:00",
    terms_version: reviewed.termsVersion,
    attribution_required: true,
    may_store_full_description: reviewed.policy.canStoreFullDescription,
    may_index_jobs: reviewed.policy.canIndex,
    may_emit_jobposting_schema: reviewed.policy.canUseJobPostingStructuredData,
    allow_public_listing: true,
    required_destination_kind: reviewed.requiredDestinationKind,
    refresh_interval_seconds: reviewed.policy.refreshIntervalSeconds,
  };
}

describe("reviewedPolicyMismatch", () => {
  it("accepts a live row that matches each reviewed source policy exactly", () => {
    for (const reviewed of [
      remotiveReviewed,
      jobicyReviewed,
      himalayasReviewed,
    ]) {
      expect(reviewedPolicyMismatch(matchingRow(reviewed), reviewed)).toBe(
        false,
      );
    }
  });

  it("flags drift in every authorization-relevant field", () => {
    const drifted: Partial<ReviewedPolicyRow>[] = [
      { adapter_key: "jobicy" },
      { source_type: "partner" },
      { terms_url: "https://remotive.com/other-terms" },
      { terms_version: "remotive-terms-reviewed-earlier" },
      { attribution_required: false },
      { may_store_full_description: true },
      { may_index_jobs: true },
      { may_emit_jobposting_schema: true },
      { allow_public_listing: false },
      { required_destination_kind: "employer_url" },
      { refresh_interval_seconds: 3_600 },
    ];
    for (const drift of drifted) {
      const row = { ...matchingRow(remotiveReviewed), ...drift };
      expect(reviewedPolicyMismatch(row, remotiveReviewed)).toBe(true);
    }
  });

  it("treats a cleared attribution or public-listing flag as drift, not permission", () => {
    // These flags are required by every reviewed policy; a live row clearing
    // them is operator drift and must fail closed.
    expect(
      reviewedPolicyMismatch(
        { ...matchingRow(jobicyReviewed), attribution_required: false },
        jobicyReviewed,
      ),
    ).toBe(true);
    expect(
      reviewedPolicyMismatch(
        { ...matchingRow(himalayasReviewed), allow_public_listing: false },
        himalayasReviewed,
      ),
    ).toBe(true);
  });
});

describe("reviewedPolicyRowSchema", () => {
  it("parses a well-formed registry row", () => {
    expect(
      reviewedPolicyRowSchema.safeParse(matchingRow(remotiveReviewed)).success,
    ).toBe(true);
  });

  it("rejects rows with unexpected keys, insecure URLs or invalid cadence", () => {
    const row = matchingRow(remotiveReviewed);
    expect(
      reviewedPolicyRowSchema.safeParse({ ...row, extra: true }).success,
    ).toBe(false);
    expect(
      reviewedPolicyRowSchema.safeParse({
        ...row,
        terms_url: "http://remotive.com/terms-of-use",
      }).success,
    ).toBe(false);
    expect(
      reviewedPolicyRowSchema.safeParse({
        ...row,
        refresh_interval_seconds: 0,
      }).success,
    ).toBe(false);
  });

  it("names exactly the columns the registry read selects", () => {
    expect(REVIEWED_POLICY_SELECT_COLUMNS.split(",").sort()).toEqual(
      Object.keys(reviewedPolicyRowSchema.shape).sort(),
    );
  });
});
