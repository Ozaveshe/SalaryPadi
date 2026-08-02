import { describe, expect, it } from "vitest";

import {
  SOURCE_RIGHTS_CLASSIFICATIONS,
  mayPublishUnderRights,
  rightsCapability,
} from "./source-rights";

describe("source rights", () => {
  it("blocks publication for every non-permissive classification", () => {
    for (const classification of [
      "review_required",
      "prohibited",
      "disabled",
    ] as const) {
      expect(mayPublishUnderRights(classification)).toBe(false);
    }
  });

  it("fails closed on an absent or unrecognised classification", () => {
    // The absence of a recorded right is not the presence of one.
    expect(mayPublishUnderRights(null)).toBe(false);
    expect(mayPublishUnderRights(undefined)).toBe(false);
    expect(mayPublishUnderRights("")).toBe(false);
    expect(mayPublishUnderRights("looks_fine_to_me")).toBe(false);
  });

  it("never lets a link-only or metadata-only source be indexed", () => {
    // Indexing a page whose body may not carry the source's text would ship
    // a thin page and imply rights we do not hold.
    for (const classification of [
      "factual_link_only",
      "metadata_only",
    ] as const) {
      const capability = rightsCapability(classification);
      expect(capability.publish).toBe(true);
      expect(capability.storeDescription).toBe(false);
      expect(capability.index).toBe(false);
      expect(capability.structuredData).toBe(false);
    }
  });

  it("never grants structured data without description rights", () => {
    // Google's JobPosting markup requires a description; emitting it without
    // the right to store one would publish an empty or placeholder claim.
    for (const classification of SOURCE_RIGHTS_CLASSIFICATIONS) {
      const capability = rightsCapability(classification);
      if (capability.structuredData) {
        expect(capability.storeDescription).toBe(true);
      }
    }
  });

  it("never grants indexing without publication", () => {
    for (const classification of SOURCE_RIGHTS_CLASSIFICATIONS) {
      const capability = rightsCapability(classification);
      if (capability.index) {
        expect(capability.publish).toBe(true);
      }
    }
  });

  it("explains every classification", () => {
    for (const classification of SOURCE_RIGHTS_CLASSIFICATIONS) {
      expect(rightsCapability(classification).note.length).toBeGreaterThan(20);
    }
  });
});
