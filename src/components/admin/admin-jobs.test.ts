import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdminJobStatusControl } from "@/components/admin/admin-job-detail-view";
import { AdminJobSearchResults } from "@/components/admin/admin-job-search-results";

const jobId = "ac000000-0000-4000-8000-000000000020";

describe("admin job operations markup", () => {
  it("links every search result to evidence and labels open reports", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminJobSearchResults, {
        rows: [
          {
            id: jobId,
            title: "Senior Platform Engineer",
            company_name: "Evidence Company",
            source_name: "Employer careers",
            source_adapter: "evidence_company",
            external_source_id: "vacancy-20",
            slug: "senior-platform-engineer",
            status: "pending",
            updated_at: "2026-08-11T00:00:00+00:00",
            version: 3,
            open_report_count: 2,
          },
        ],
        query: "platform",
        status: null,
        canTransition: false,
      }),
    );

    expect(markup).toContain(`/admin/jobs/${jobId}`);
    expect(markup).toContain("2 open");
    expect(markup).toContain("read-only for job status changes");
  });

  it("does not render a mutation form for data-quality access", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminJobStatusControl, {
        jobId,
        version: 3,
        status: "pending",
        canTransition: false,
      }),
    );

    expect(markup).toContain("Data-quality access is read-only");
    expect(markup).not.toContain("/api/admin/jobs/transition");
    expect(markup).not.toContain("Apply status change");
  });

  it("renders only state-valid, optimistic admin actions", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminJobStatusControl, {
        jobId,
        version: 3,
        status: "published",
        canTransition: true,
      }),
    );

    expect(markup).toContain('action="/api/admin/jobs/transition"');
    expect(markup).toContain('name="expected_version" value="3"');
    expect(markup).toContain('value="expire"');
    expect(markup).toContain('value="remove"');
    expect(markup).not.toContain('value="approve"');
    expect(markup).not.toContain('value="restore"');
  });
});
