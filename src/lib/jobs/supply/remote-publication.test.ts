import { describe, expect, it } from "vitest";

import {
  evaluateRemotePublication,
  inferRemoteArrangement,
  remoteEligibilityEvidence,
} from "./remote-publication";

const verifiedAt = "2026-07-14T00:00:00.000Z";

describe("remote job publication policy", () => {
  it.each([
    ["Worldwide", "worldwide"],
    ["Remote - Africa", "africa"],
    ["EMEA", "emea"],
    ["Remote (Nigeria)", "nigeria"],
    ["Remote - Kenya or Ghana", "named_african_country"],
  ] as const)(
    "accepts explicit African access evidence: %s",
    (evidence, reason) => {
      expect(
        evaluateRemotePublication({
          arrangement: "remote",
          evidenceText: evidence,
          verifiedAt,
        }),
      ).toMatchObject({ eligible: true, reason });
    },
  );

  it.each([
    ["Remote - United States", "geography_restricted"],
    ["Remote - Europe only", "geography_restricted"],
    ["Remote", "eligibility_unclear"],
  ] as const)(
    "rejects ineligible or unproven geography: %s",
    (evidence, reason) => {
      expect(
        evaluateRemotePublication({
          arrangement: "remote",
          evidenceText: evidence,
          verifiedAt,
        }),
      ).toMatchObject({ eligible: false, reason });
    },
  );

  it("rejects a worldwide label overridden by a work-authorization restriction", () => {
    expect(
      evaluateRemotePublication({
        arrangement: "remote",
        evidenceText:
          "Worldwide. Candidates must have authorization to work in the United States.",
        verifiedAt,
      }),
    ).toMatchObject({
      eligible: false,
      reason: "work_authorization_restricted",
    });
  });

  it("does not confuse an African customer market with candidate eligibility", () => {
    const evidence = remoteEligibilityEvidence(
      "Remote",
      "Build reliable systems for customers across Africa.",
    );
    expect(evidence).toBe("Remote");
    expect(
      evaluateRemotePublication({
        arrangement: "remote",
        evidenceText: evidence,
        verifiedAt,
      }),
    ).toMatchObject({ eligible: false, reason: "eligibility_unclear" });
  });

  it("extracts a candidate-location sentence and infers a remote arrangement", () => {
    const description =
      "Build reliable systems. This role is open to candidates worldwide. Work with a small team.";
    expect(remoteEligibilityEvidence(null, description)).toBe(
      "This role is open to candidates worldwide.",
    );
    expect(inferRemoteArrangement("Remote", null, description)).toBe("remote");
  });

  it("never publishes hybrid or onsite arrangements", () => {
    for (const arrangement of ["hybrid", "onsite", "unspecified"] as const) {
      expect(
        evaluateRemotePublication({
          arrangement,
          evidenceText: "Worldwide",
          verifiedAt,
        }),
      ).toMatchObject({ eligible: false, reason: "not_remote" });
    }
  });
});
