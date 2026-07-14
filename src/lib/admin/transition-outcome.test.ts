import { describe, expect, it } from "vitest";

import { getAdminTransitionNotice } from "@/lib/admin/transition-outcome";

describe("getAdminTransitionNotice", () => {
  it("distinguishes a completed transition from a failed one", () => {
    expect(getAdminTransitionNotice("true")).toMatchObject({
      heading: "Transition completed.",
      role: "status",
    });
    expect(getAdminTransitionNotice("error")).toMatchObject({
      heading: "Transition failed.",
      role: "alert",
    });
  });

  it("warns operators not to repeat a completed write when propagation is incomplete", () => {
    const notice = getAdminTransitionNotice("degraded");

    expect(notice).toMatchObject({
      heading: "Transition completed with incomplete propagation.",
      role: "status",
    });
    expect(notice?.detail).toContain("Do not submit the transition again");
  });

  it.each([null, "", "unknown"])(
    "ignores an unsupported outcome value %s",
    (outcome) => {
      expect(getAdminTransitionNotice(outcome)).toBeNull();
    },
  );
});
