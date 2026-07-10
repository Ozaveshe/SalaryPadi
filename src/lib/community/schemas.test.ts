import { describe, expect, it } from "vitest";

import {
  feedPostSchema,
  forumReplySchema,
  forumThreadSchema,
  removeCommunityContentSchema,
} from "@/lib/community/schemas";

describe("community form schemas", () => {
  it("accepts a state-specific feed post", () => {
    expect(
      feedPostSchema.safeParse({
        display_name: "Ada Career",
        state_code: "LA",
        category: "career_update",
        body: "I finished a portfolio project and documented the result.",
      }).success,
    ).toBe(true);
  });

  it("allows a nationwide post without a state code", () => {
    expect(
      feedPostSchema.safeParse({
        display_name: "Ada Career",
        state_code: "",
        category: "opportunity",
        body: "A nationwide career event opens registration next week.",
      }).success,
    ).toBe(true);
  });

  it("rejects oversized or malformed community input", () => {
    expect(
      forumThreadSchema.safeParse({
        display_name: "A",
        state_code: "LAGOS",
        topic_slug: "Career Growth",
        title: "Short",
        body: "Too short",
      }).success,
    ).toBe(false);
  });

  it("requires UUID identifiers for replies and removal", () => {
    expect(
      forumReplySchema.safeParse({
        display_name: "Ada Career",
        state_code: "LA",
        thread_id: "not-an-id",
        body: "Useful answer",
      }).success,
    ).toBe(false);
    expect(
      removeCommunityContentSchema.safeParse({
        content_kind: "forum_reply",
        content_id: "not-an-id",
      }).success,
    ).toBe(false);
  });
});
