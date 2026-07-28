import { containsTerm, SKILL_VOCABULARY } from "./vocabulary";

/**
 * How a CV relates to a specific posting.
 *
 * This is an *overlap*, not a verdict. The only claim made is that both
 * documents literally contain the same terms, which is checkable by reading
 * them. It never says the candidate is qualified, never says they would be
 * shortlisted, and never produces a number without naming what it counted.
 *
 * It sits beside the existing match score rather than inside it: that scorer
 * compares attested profile facts against published job facts, and mixing an
 * unverified document into it would make a stated fact and a read-off term
 * indistinguishable.
 */

export interface CvJobOverlap {
  /** Vocabulary terms present in both the CV and the posting. */
  sharedSkills: string[];
  /** Terms the posting names that the CV does not contain. */
  missingSkills: string[];
  /**
   * Shared terms as a share of the terms the posting names, 0..1. Null when the
   * posting names no vocabulary term at all — there is nothing to be a share of,
   * and reporting 0 would read as "no overlap" rather than "nothing to compare".
   */
  coverage: number | null;
}

/** Vocabulary terms a posting's own text names. */
export function readJobSkills(job: {
  title: string;
  description: string;
}): string[] {
  const haystack = `${job.title}\n${job.description}`.toLowerCase();
  const found: string[] = [];
  for (const skill of SKILL_VOCABULARY) {
    if (skill.aliases.some((alias) => containsTerm(haystack, alias))) {
      found.push(skill.label);
    }
  }
  return found;
}

export function compareCvToJob(
  cvSkills: readonly string[],
  job: { title: string; description: string },
): CvJobOverlap {
  const jobSkills = readJobSkills(job);
  const cvSet = new Set(cvSkills);
  const sharedSkills = jobSkills.filter((skill) => cvSet.has(skill));
  const missingSkills = jobSkills.filter((skill) => !cvSet.has(skill));
  return {
    sharedSkills,
    missingSkills,
    coverage:
      jobSkills.length === 0 ? null : sharedSkills.length / jobSkills.length,
  };
}

/**
 * The sentence shown under a job on the CV-match surface.
 *
 * States what was counted and where it came from. A posting that names no
 * recognised term says exactly that, rather than being ranked as a poor match
 * on the strength of a comparison that never happened.
 */
export function overlapStatement(overlap: CvJobOverlap): string {
  if (overlap.coverage === null) {
    return "This posting names none of the skills SalaryPadi can read, so there is nothing to compare your CV against.";
  }
  if (overlap.sharedSkills.length === 0) {
    return "Your CV does not mention any of the skills this posting names.";
  }
  const shared = overlap.sharedSkills.slice(0, 6).join(", ");
  return `Your CV and this posting both mention ${shared}.`;
}

/**
 * Ranking key for the CV-match surface.
 *
 * Ordered by how many terms are actually shared, then by the share of the
 * posting's terms covered. Postings with nothing to compare sort last rather
 * than being scored as zero overlap.
 */
export function overlapRank(overlap: CvJobOverlap): number {
  if (overlap.coverage === null) return -1;
  return overlap.sharedSkills.length + overlap.coverage;
}
