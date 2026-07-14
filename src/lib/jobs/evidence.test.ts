import { describe, expect, it } from "vitest";

import { normalizeRemotiveJob } from "./normalize";
import { getJobEvidenceLabels, hasJobEvidence } from "./evidence";

function jobWith(description: string) {
  return normalizeRemotiveJob(
    {
      id: 42,
      url: "https://remotive.com/remote-jobs/software-dev/example-42",
      title: "Operations Associate",
      company_name: "Padi Labs",
      company_logo: null,
      company_logo_url: null,
      category: "Operations",
      tags: [],
      job_type: "full_time",
      publication_date: "2026-07-09T12:00:00+00:00",
      candidate_required_location: "Nigeria",
      salary: "NGN 500,000 per month gross",
      description: `<p>${description}</p>`,
    },
    "2026-07-10T00:00:00.000Z",
  );
}

describe("African job evidence", () => {
  it("only labels evidence that is present in source-backed job text", () => {
    const job = jobWith(
      "BSc/HND accepted. Benefits include HMO, pension and a data allowance.",
    );

    expect(getJobEvidenceLabels(job).map(({ key }) => key)).toEqual(
      expect.arrayContaining([
        "hndAccepted",
        "pension",
        "hmo",
        "dataPowerAllowance",
      ]),
    );
    expect(hasJobEvidence(job, "fxPolicy")).toBe(false);
    expect(hasJobEvidence(job, "payReliability")).toBe(false);
  });

  it("does not treat an HND rejection as HND acceptance", () => {
    expect(
      hasJobEvidence(
        jobWith("HND is not accepted for this role."),
        "hndAccepted",
      ),
    ).toBe(false);
  });

  it("recognises explicit working and pay-practice evidence", () => {
    const job = jobWith(
      "Weekend shifts are expected. Salary is paid monthly on the stated pay date. The FX policy uses the month-end exchange rate.",
    );

    expect(hasJobEvidence(job, "overtimeWeekend")).toBe(true);
    expect(hasJobEvidence(job, "payReliability")).toBe(true);
    expect(hasJobEvidence(job, "fxPolicy")).toBe(true);
  });
});
