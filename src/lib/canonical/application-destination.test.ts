import { describe, expect, it } from "vitest";

import {
  classifyDestination,
  preferredDestination,
} from "./application-destination";

describe("destination classification", () => {
  it("treats a verified employer domain as the direct employer", () => {
    const result = classifyDestination(
      "https://careers.moniepoint.com/roles/1",
      ["moniepoint.com"],
    );
    expect(result.kind).toBe("direct_employer");
    expect(result.deterministic).toBe(true);
  });

  it("prefers employer-domain evidence over the ATS host table", () => {
    // A company hosting its board on its own domain is still the employer.
    const result = classifyDestination("https://jobs.example.com/apply", [
      "jobs.example.com",
    ]);
    expect(result.kind).toBe("direct_employer");
  });

  it("recognises applicant tracking systems the employer controls", () => {
    for (const url of [
      "https://boards.greenhouse.io/moniepoint/jobs/123",
      "https://jobs.lever.co/tala/abc",
      "https://jobs.ashbyhq.com/lemfi/xyz",
      "https://apply.workable.com/kuda/j/ABC/",
    ]) {
      expect(classifyDestination(url).kind).toBe("employer_ats");
    }
  });

  it("recognises aggregators that re-list other people's roles", () => {
    for (const url of [
      "https://www.linkedin.com/jobs/view/123",
      "https://ng.indeed.com/viewjob?jk=1",
      "https://www.glassdoor.com/job-listing/x",
    ]) {
      expect(classifyDestination(url).kind).toBe("aggregator");
    }
  });

  it("classifies email applications", () => {
    expect(classifyDestination("mailto:jobs@example.com").kind).toBe("email");
  });

  it("does not claim certainty about an unknown host", () => {
    const result = classifyDestination("https://some-unknown-board.example/x");
    expect(result.kind).toBe("external_board");
    expect(result.deterministic).toBe(false);
  });

  it("refuses to treat an unparseable destination as evidence", () => {
    const result = classifyDestination("not-a-url");
    expect(result.deterministic).toBe(false);
    expect(result.kind).toBe("external_board");
  });

  it("matches subdomains but not lookalike domains", () => {
    expect(
      classifyDestination("https://apply.moniepoint.com/x", ["moniepoint.com"])
        .kind,
    ).toBe("direct_employer");
    // A domain that merely ends with the same letters is a different company.
    expect(
      classifyDestination("https://notmoniepoint.com/x", ["moniepoint.com"])
        .kind,
    ).toBe("external_board");
  });
});

describe("preferred destination", () => {
  it("sends the candidate to the employer rather than an intermediary", () => {
    const chosen = preferredDestination([
      { url: "https://linkedin.com/jobs/1", kind: "aggregator" },
      { url: "https://boards.greenhouse.io/x/1", kind: "employer_ats" },
      { url: "https://careers.x.com/1", kind: "direct_employer" },
    ]);
    expect(chosen?.kind).toBe("direct_employer");
  });

  it("never prefers a broken link, however direct it is", () => {
    const chosen = preferredDestination([
      {
        url: "https://careers.x.com/1",
        kind: "direct_employer",
        linkState: "broken",
      },
      {
        url: "https://linkedin.com/jobs/1",
        kind: "aggregator",
        linkState: "healthy",
      },
    ]);
    // A dead employer page is worse than a working aggregator listing.
    expect(chosen?.kind).toBe("aggregator");
  });

  it("returns nothing when every destination is broken", () => {
    // The caller must withdraw the apply action rather than offer a dead link.
    expect(
      preferredDestination([
        {
          url: "https://a.example/1",
          kind: "direct_employer",
          linkState: "broken",
        },
        { url: "https://b.example/1", kind: "aggregator", linkState: "broken" },
      ]),
    ).toBeNull();
  });

  it("breaks ties on verified health", () => {
    const chosen = preferredDestination([
      {
        url: "https://a.example/1",
        kind: "employer_ats",
        linkState: "unchecked",
      },
      {
        url: "https://b.example/1",
        kind: "employer_ats",
        linkState: "healthy",
      },
    ]);
    expect(chosen?.url).toBe("https://b.example/1");
  });
});
