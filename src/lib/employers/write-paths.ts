/**
 * Every route an employer can write through, and what each one writes.
 *
 * `data-boundaries.ts` states which fields an employer may edit. Stating it
 * is not enforcing it: the boundary had no callers, because SalaryPadi has no
 * employer profile editor yet. That is precisely when this registry is worth
 * having. The failure in the risk register is not a single bad decision, it is
 * one field at a time under commercial pressure — and the cheapest field to
 * classify is the first one, before anybody has promised a customer anything.
 *
 * Two things hold the line underneath this file:
 *
 *   1. `anon` and `authenticated` hold no INSERT, UPDATE or DELETE grant on
 *      any table in `app`, `api` or `private`. Every employer write goes
 *      through a security-definer RPC. Pinned by pgTAP so a convenience grant
 *      cannot reintroduce direct writes.
 *   2. Every employer write below lands in a moderation queue, not on a
 *      public record.
 *
 * This registry adds the third: a new employer-reachable route fails CI until
 * somebody says which boundary fields it writes.
 */

import { mayEmployerEdit } from "./data-boundaries";

export interface EmployerWritePath {
  /**
   * Boundary-classified fields this route writes. Empty is a real answer —
   * most employer writes create a case for review rather than editing a
   * company record — but it has to be said out loud.
   */
  fields: readonly string[];
  /** What the route actually does, in one line. */
  writes: string;
}

/**
 * Keyed by repository path. The test asserts this covers every mutating
 * employer-facing route on disk, so adding one without classifying it fails.
 */
export const EMPLOYER_WRITE_PATHS: Record<string, EmployerWritePath> = {
  "src/app/api/employer-submissions/route.ts": {
    fields: [],
    writes:
      "Submits a job for moderation. Creates a submission case; edits no company record.",
  },
  "src/app/api/employer-responses/route.ts": {
    fields: ["response_statement"],
    writes:
      "Submits a factual correction or right of reply, labelled as the employer's own words.",
  },
  "src/app/api/company-claims/route.ts": {
    fields: [],
    writes:
      "Claims a company profile. Creates a claim case for staff verification; grants nothing on its own.",
  },
};

/**
 * A field name an employer form uses that is NOT the protected boundary field
 * of the same name.
 *
 * The employer job submission form asks for `eligibility_evidence`: the
 * employer quoting their own posting's wording about who may apply. The
 * boundary's `eligibility_evidence` is SalaryPadi's independent reading of
 * that posting. An employer supplying the first can never edit the second,
 * and the two must not be confused by a future reader — in either direction.
 */
export const EMPLOYER_SUPPLIED_NOT_BOUNDARY_FIELDS = [
  "eligibility_evidence",
] as const;

export type EmployerWriteAudit =
  | { ok: true; path: string; labelled: readonly string[] }
  | { ok: false; path: string; field: string; reason: string };

/**
 * Check one declared route against the boundary.
 *
 * Fails closed on anything the boundary refuses, including a field nobody has
 * classified — a field nobody has classified is a field nobody has thought
 * about.
 */
export function auditEmployerWritePath(
  path: string,
  declaration: EmployerWritePath,
): EmployerWriteAudit {
  for (const field of declaration.fields) {
    const decision = mayEmployerEdit(field);
    if (!decision.allowed) {
      return { ok: false, path, field, reason: decision.reason };
    }
  }
  return { ok: true, path, labelled: declaration.fields };
}
