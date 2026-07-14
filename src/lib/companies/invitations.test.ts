import { describe, expect, it } from "vitest";

import { companyEvidenceInvitations } from "./invitations";

describe("company evidence invitations", () => {
  it("stay neutral, first-party, and incentive free", () => {
    const copy = Object.values(companyEvidenceInvitations).join(" ");

    expect(copy).toMatch(/own|first-party/i);
    expect(copy).not.toMatch(/reward|cash|gift|bonus|win|guaranteed/i);
    expect(copy).not.toMatch(/Glassdoor|Indeed|LinkedIn|Reddit/i);
  });
});
