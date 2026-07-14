import { describe, expect, it } from "vitest";

import {
  contributionDraftResponseSchema,
  contributionDraftSaveRequestSchema,
} from "@/lib/contributions/draft-contract";

describe("contribution draft contract", () => {
  it("accepts a bounded saved draft", () => {
    expect(
      contributionDraftResponseSchema.safeParse({
        draft: {
          id: "00000000-0000-4000-8000-000000000001",
          kind: "review",
          payload: { company: "Acme", consent: true },
          updated_at: "2026-07-14T10:00:00.000Z",
          expires_at: "2026-08-14T10:00:00.000Z",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects unsafe field names and oversized field sets", () => {
    expect(
      contributionDraftSaveRequestSchema.safeParse({
        kind: "review",
        payload: { "../company": "Acme" },
      }).success,
    ).toBe(false);
    expect(
      contributionDraftSaveRequestSchema.safeParse({
        kind: "review",
        payload: Object.fromEntries(
          Array.from({ length: 101 }, (_, index) => [`field_${index}`, index]),
        ),
      }).success,
    ).toBe(false);
  });

  it("rejects malformed database envelopes", () => {
    expect(
      contributionDraftResponseSchema.safeParse({
        draft: { payload: { company: "Acme" }, private_notes: "secret" },
      }).success,
    ).toBe(false);
  });
});
