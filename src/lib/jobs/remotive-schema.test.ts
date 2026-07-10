import { describe, expect, it } from "vitest";

import { remotiveResponseSchema } from "@/lib/jobs/remotive-schema";

const baseJob = {
  id: 1,
  url: "https://remotive.com/remote-jobs/software-dev/example-1",
  title: "Example role",
  company_name: "Example employer",
  tags: [],
  job_type: "full_time",
  candidate_required_location: "Worldwide",
  salary: "",
  description: "<p>Example</p>",
};

describe("Remotive response validation", () => {
  it("treats the source's timezone-less publication timestamp as UTC", () => {
    const parsed = remotiveResponseSchema.parse({
      "job-count": 1,
      jobs: [
        {
          ...baseJob,
          publication_date: "2026-07-07T09:04:10",
        },
      ],
    });

    expect(parsed.jobs[0]?.publication_date).toBe("2026-07-07T09:04:10Z");
  });

  it("preserves an explicit source offset", () => {
    const parsed = remotiveResponseSchema.parse({
      jobs: [
        {
          ...baseJob,
          publication_date: "2026-07-07T09:04:10+01:00",
        },
      ],
    });

    expect(parsed.jobs[0]?.publication_date).toBe("2026-07-07T09:04:10+01:00");
  });
});
