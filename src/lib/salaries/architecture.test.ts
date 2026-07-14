import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260714101000_verified_salary_benchmark_lanes.sql",
  ),
  "utf8",
);

describe("salary evidence architecture", () => {
  it("keeps external benchmarks out of first-party privacy aggregation", () => {
    const aggregateFunction = migration.slice(
      migration.indexOf("create or replace view api.salary_aggregates"),
    );

    expect(aggregateFunction).toContain("'first_party_contributions'::text");
    expect(aggregateFunction).toContain("'verified_online_benchmark'::text");
    expect(aggregateFunction).toContain("union all");
    expect(migration).not.toMatch(
      /refresh_salary_aggregates[\s\S]+salary_benchmarks/,
    );
  });

  it("requires current source and record review before public display", () => {
    expect(migration).toMatch(
      /salary_benchmarks_public_read[\s\S]+review_status = 'approved'[\s\S]+source\.status = 'enabled'/,
    );
    expect(migration).toContain("source.review_due_at > now()");
    expect(migration).toContain("benchmark.review_status = 'approved'");
  });

  it("keeps rejected source diagnostics private and text-free", () => {
    const rejectionTable = migration.slice(
      migration.indexOf(
        "create table if not exists private.salary_source_rejections",
      ),
      migration.indexOf("create table if not exists app.salary_benchmarks"),
    );

    expect(rejectionTable).toContain("record_digest text not null");
    expect(rejectionTable).toContain("error_code text not null");
    expect(rejectionTable).not.toMatch(
      /payload|source_text|raw_text|record_text/,
    );
    expect(migration).toContain(
      "alter table private.salary_source_rejections force row level security",
    );
  });

  it("does not let a database URL create a generic crawler", () => {
    expect(migration).toContain(
      "adapter_key in ('bls_oews', 'ons_ashe', 'statcan_wages', 'statssa_qes', 'reviewed_snapshot')",
    );
    expect(migration).toContain("authorization_evidence_ref is not null");
    expect(migration).toContain("cardinality(allowed_fields) > 0");
  });
});
