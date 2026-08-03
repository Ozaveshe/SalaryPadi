import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { PROTECTED_FIELDS, mayEmployerEdit } from "./data-boundaries";
import {
  EMPLOYER_SUPPLIED_NOT_BOUNDARY_FIELDS,
  EMPLOYER_WRITE_PATHS,
  auditEmployerWritePath,
} from "./write-paths";

const apiRoot = join(process.cwd(), "src", "app", "api");
const mutation = /export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)\b/;

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

/**
 * Employer-facing by path. A heuristic, deliberately a broad one: it is meant
 * to catch `api/employer-profile` on the day somebody adds it, not to be
 * exhaustive about what an employer might touch.
 */
function isEmployerFacing(repoPath: string): boolean {
  return /(^|\/)(employer|company)[-/]/.test(repoPath);
}

const employerMutationRoutes = routeFiles(apiRoot)
  .filter((file) => mutation.test(readFileSync(file, "utf8")))
  .map((file) => relative(process.cwd(), file).split(sep).join("/"))
  .filter(isEmployerFacing)
  .toSorted();

describe("employer write paths", () => {
  it("classifies every employer-facing mutation route on disk", () => {
    // A new employer route fails here until somebody says what it writes.
    expect(employerMutationRoutes).toEqual(
      Object.keys(EMPLOYER_WRITE_PATHS).toSorted(),
    );
  });

  it("declares only fields the boundary permits", () => {
    for (const [path, declaration] of Object.entries(EMPLOYER_WRITE_PATHS)) {
      const audit = auditEmployerWritePath(path, declaration);
      expect(audit).toMatchObject({ ok: true });
    }
  });

  it("refuses a declaration that reaches a protected field", () => {
    // The shape of the regression this file exists to catch: an employer
    // route that starts writing independent evidence.
    const audit = auditEmployerWritePath("src/app/api/pretend/route.ts", {
      fields: ["salary_confidence"],
      writes: "Hypothetical route used to prove the audit refuses.",
    });
    expect(audit.ok).toBe(false);
    if (!audit.ok) {
      expect(audit.reason).toMatch(/Confidence reflects evidence quality/);
    }
  });

  it("refuses a field nobody has classified", () => {
    const audit = auditEmployerWritePath("src/app/api/pretend/route.ts", {
      fields: ["employer_supplied_market_rate"],
      writes: "A plausible-sounding field with no classification.",
    });
    expect(audit.ok).toBe(false);
  });

  it("labels everything an employer writes as the employer's", () => {
    // No employer write is ever promoted to a SalaryPadi-verified fact by
    // virtue of who typed it.
    for (const declaration of Object.values(EMPLOYER_WRITE_PATHS)) {
      for (const field of declaration.fields) {
        expect(mayEmployerEdit(field)).toMatchObject({
          allowed: true,
          label: "employer_provided",
        });
      }
    }
  });

  it("keeps an employer-supplied input distinct from the protected field of the same name", () => {
    /*
     * The job submission form asks an employer to quote their own posting's
     * eligibility wording. The boundary's `eligibility_evidence` is
     * SalaryPadi's independent reading of that posting. Same name, opposite
     * owner — and no employer route may declare the protected one.
     */
    for (const field of EMPLOYER_SUPPLIED_NOT_BOUNDARY_FIELDS) {
      expect(Object.keys(PROTECTED_FIELDS)).toContain(field);
      expect(mayEmployerEdit(field).allowed).toBe(false);
      for (const declaration of Object.values(EMPLOYER_WRITE_PATHS)) {
        expect(declaration.fields).not.toContain(field);
      }
    }
  });
});
