import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_ROUTE_GROUPS,
} from "@/lib/analytics/catalog";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260713090000_analytics_consent_abuse_protection.sql",
  ),
  "utf8",
);

function sqlAllowList(marker: string): string[] {
  const match = migration.match(
    new RegExp(`-- ${marker}_BEGIN([\\s\\S]*?)-- ${marker}_END`),
  );
  if (!match?.[1]) throw new Error(`Missing SQL allow-list marker ${marker}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]!);
}

describe("analytics SQL allow-list drift tripwire", () => {
  it("keeps event names aligned with the database function", () => {
    const sqlEvents = sqlAllowList("ANALYTICS_EVENT_ALLOWLIST");

    expect([...new Set(sqlEvents)].sort()).toEqual(
      [...ANALYTICS_EVENT_NAMES].sort(),
    );
    expect(sqlEvents).toHaveLength(ANALYTICS_EVENT_NAMES.length);
  });

  it("keeps coarse route groups aligned with the database function", () => {
    const sqlRouteGroups = sqlAllowList("ANALYTICS_ROUTE_GROUP_ALLOWLIST");

    expect([...new Set(sqlRouteGroups)].sort()).toEqual(
      [...ANALYTICS_ROUTE_GROUPS].sort(),
    );
    expect(sqlRouteGroups).toHaveLength(ANALYTICS_ROUTE_GROUPS.length);
  });
});
