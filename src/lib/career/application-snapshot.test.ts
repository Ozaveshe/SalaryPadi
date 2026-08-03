import { describe, expect, it } from "vitest";

import {
  buildApplicationSnapshot,
  readApplicationSnapshot,
  resolveApplicationDisplay,
  type SnapshotSourceJob,
} from "./application-snapshot";

function job(overrides: Partial<SnapshotSourceJob> = {}): SnapshotSourceJob {
  return {
    id: "job-1",
    slug: "senior-analyst-abc123",
    title: "Senior Analyst",
    company: { name: "Moniepoint", slug: "moniepoint" },
    locationDisplay: "Lagos, Nigeria",
    workMode: "onsite",
    employmentType: "full_time",
    salary: { originalText: "₦600,000 - ₦700,000 per month" },
    applicationUrl: "https://boards.greenhouse.io/moniepoint/jobs/1",
    eligibility: { summary: "Open to Nigeria" },
    lastCheckedAt: "2026-08-02T10:00:00Z",
    ...overrides,
  };
}

describe("building a snapshot", () => {
  it("captures what the user saw", () => {
    const snapshot = buildApplicationSnapshot(job());
    expect(snapshot).toMatchObject({
      jobId: "job-1",
      title: "Senior Analyst",
      companyName: "Moniepoint",
      locationDisplay: "Lagos, Nigeria",
      salaryDisplay: "₦600,000 - ₦700,000 per month",
      eligibilitySummary: "Open to Nigeria",
    });
  });

  it("records an absent salary as absent rather than omitting it", () => {
    // "The posting did not state pay" is part of what they saw.
    const snapshot = buildApplicationSnapshot(job({ salary: null }));
    expect(snapshot.salaryDisplay).toBeNull();
    expect("salaryDisplay" in snapshot).toBe(true);
  });

  it("keeps the canonical job id so a slug change cannot orphan the record", () => {
    const snapshot = buildApplicationSnapshot(job({ slug: "renamed-slug" }));
    expect(snapshot.jobId).toBe("job-1");
  });
});

describe("reading a snapshot", () => {
  it("round-trips a built snapshot", () => {
    const built = buildApplicationSnapshot(job());
    const result = readApplicationSnapshot(built, "2026-08-02T10:00:00Z");
    expect(result.state).toBe("snapshot");
  });

  it("reports absence for an application recorded before snapshots existed", () => {
    expect(readApplicationSnapshot(null, null).state).toBe("absent");
  });

  it("treats a malformed snapshot as invalid rather than repairing it", () => {
    // Silently substituting live data would recreate the exact problem
    // snapshots exist to solve.
    expect(
      readApplicationSnapshot({ title: 42 }, "2026-08-02T10:00:00Z").state,
    ).toBe("invalid");
  });

  it("treats a snapshot with no capture time as invalid", () => {
    const built = buildApplicationSnapshot(job());
    expect(readApplicationSnapshot(built, null).state).toBe("invalid");
  });
});

describe("rendering a tracked application", () => {
  it("shows the historical record, not the live job", () => {
    const stored = readApplicationSnapshot(
      buildApplicationSnapshot(job()),
      "2026-08-02T10:00:00Z",
    );
    const retitled = job({
      title: "Lead Analyst",
      salary: { originalText: "₦900,000 per month" },
    });
    const display = resolveApplicationDisplay(stored, retitled);
    expect(display?.title).toBe("Senior Analyst");
    expect(display?.salaryDisplay).toBe("₦600,000 - ₦700,000 per month");
    expect(display?.fromSnapshot).toBe(true);
  });

  it("mentions what changed instead of silently overwriting it", () => {
    const stored = readApplicationSnapshot(
      buildApplicationSnapshot(job()),
      "2026-08-02T10:00:00Z",
    );
    const display = resolveApplicationDisplay(
      stored,
      job({ title: "Lead Analyst", salary: { originalText: "₦900,000" } }),
    );
    expect(display?.changedSinceApplied).toHaveLength(2);
    expect(display?.changedSinceApplied.join(" ")).toMatch(/title has changed/);
  });

  it("survives the live job being deleted entirely", () => {
    const stored = readApplicationSnapshot(
      buildApplicationSnapshot(job()),
      "2026-08-02T10:00:00Z",
    );
    const display = resolveApplicationDisplay(stored, null);
    expect(display?.title).toBe("Senior Analyst");
    expect(display?.changedSinceApplied).toEqual([]);
  });

  it("reports nothing changed when the job is unchanged", () => {
    const stored = readApplicationSnapshot(
      buildApplicationSnapshot(job()),
      "2026-08-02T10:00:00Z",
    );
    expect(
      resolveApplicationDisplay(stored, job())?.changedSinceApplied,
    ).toEqual([]);
  });

  it("falls back to the live job for a pre-snapshot application, and says so", () => {
    const display = resolveApplicationDisplay({ state: "absent" }, job());
    expect(display?.title).toBe("Senior Analyst");
    expect(display?.fromSnapshot).toBe(false);
  });

  it("returns nothing when there is neither a snapshot nor a live job", () => {
    expect(resolveApplicationDisplay({ state: "absent" }, null)).toBeNull();
  });
});
