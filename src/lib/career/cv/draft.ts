import {
  containsTerm,
  ROLE_NOUNS,
  SENIORITY_MARKERS,
  SKILL_VOCABULARY,
} from "./vocabulary";

/**
 * What a CV proposes for the career profile.
 *
 * Every field here is a *proposal*, never a saved claim. The profile form is
 * pre-filled with it and the owner has to save before any of it counts —
 * `private.candidate_profiles.attested_at` only advances on that save, so an
 * unconfirmed reading never reaches match scoring or anything public.
 *
 * Each proposal carries the evidence it came from, so the owner can see the
 * exact line that produced it and correct a wrong reading rather than having to
 * guess why a field was filled in.
 */
export interface CvProposal<T> {
  value: T;
  /** The literal text from the CV that produced this value. */
  evidence: string;
}

export interface CvDraft {
  headline: CvProposal<string> | null;
  yearsExperience: CvProposal<number> | null;
  experienceLevel: CvProposal<
    "entry" | "junior" | "mid" | "senior" | "lead" | "executive"
  > | null;
  locationCountry: CvProposal<string> | null;
  /** Vocabulary terms the document literally contains, in document order. */
  skills: string[];
}

/**
 * Countries a location line is recognised for.
 *
 * Nigeria-first, then the markets SalaryPadi already publishes eligibility for.
 * An unrecognised country is left absent rather than guessed: a wrong country
 * silently narrows every future match.
 */
const COUNTRY_MARKERS: readonly { code: string; phrases: readonly string[] }[] =
  [
    {
      code: "NG",
      phrases: [
        "nigeria",
        "lagos",
        "abuja",
        "port harcourt",
        "ibadan",
        "kano",
        "enugu",
        "benin city",
        "kaduna",
      ],
    },
    { code: "GH", phrases: ["ghana", "accra", "kumasi"] },
    { code: "KE", phrases: ["kenya", "nairobi", "mombasa"] },
    { code: "ZA", phrases: ["south africa", "johannesburg", "cape town"] },
    { code: "EG", phrases: ["egypt", "cairo"] },
    { code: "RW", phrases: ["rwanda", "kigali"] },
    { code: "UG", phrases: ["uganda", "kampala"] },
    { code: "TZ", phrases: ["tanzania", "dar es salaam"] },
    { code: "GB", phrases: ["united kingdom", "london", "manchester"] },
    { code: "US", phrases: ["united states", "new york", "san francisco"] },
    { code: "CA", phrases: ["canada", "toronto"] },
  ];

/** The line a phrase occurs on, trimmed for display as evidence. */
function lineContaining(text: string, phrase: string): string {
  const lines = text.split("\n");
  const found = lines.find((line) => containsTerm(line.toLowerCase(), phrase));
  return (found ?? phrase).trim().slice(0, 160);
}

/**
 * A headline, taken only from a line near the top that actually reads like a
 * role.
 *
 * The top of a CV is a name, a role and contact details in some order, and
 * position alone does not say which is which — taking "the second line" would
 * propose someone's own name as their headline about as often as not. A line
 * has to contain a role word to be offered, and when none does, nothing is
 * proposed.
 */
function readHeadline(text: string): CvProposal<string> | null {
  const headline = text
    .split("\n")
    .slice(0, 8)
    .map((line) => line.trim())
    .filter((line) => line.length >= 6 && line.length <= 120)
    // Contact lines are not a headline.
    .filter((line) => !/@|https?:|\+\d|\bwww\./iu.test(line))
    .find((line) =>
      ROLE_NOUNS.some((noun) => containsTerm(line.toLowerCase(), noun)),
    );
  if (!headline) return null;
  return { value: headline, evidence: headline };
}

/**
 * Years of experience, only when the document states a number of years.
 *
 * Deliberately not derived by subtracting the earliest date found: a CV that
 * lists a 2009 degree does not thereby claim 17 years of work, and inventing
 * that number would put a fabricated figure in front of employers.
 */
function readYearsExperience(text: string): CvProposal<number> | null {
  const pattern =
    /(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|hands-on\s+)?experience/giu;
  let best: { years: number; match: string } | null = null;
  for (const match of text.matchAll(pattern)) {
    const years = Number(match[1]);
    if (!Number.isFinite(years) || years < 0 || years > 60) continue;
    if (!best || years > best.years) best = { years, match: match[0] };
  }
  if (!best) return null;
  return {
    value: best.years,
    evidence: lineContaining(text, best.match.toLowerCase()),
  };
}

function readExperienceLevel(text: string): CvDraft["experienceLevel"] {
  const haystack = text.toLowerCase();
  for (const marker of SENIORITY_MARKERS) {
    const phrase = marker.phrases.find((candidate) =>
      containsTerm(haystack, candidate),
    );
    if (phrase) {
      return { value: marker.level, evidence: lineContaining(text, phrase) };
    }
  }
  return null;
}

function readLocationCountry(text: string): CvProposal<string> | null {
  const haystack = text.toLowerCase();
  for (const country of COUNTRY_MARKERS) {
    const phrase = country.phrases.find((candidate) =>
      containsTerm(haystack, candidate),
    );
    if (phrase) {
      return { value: country.code, evidence: lineContaining(text, phrase) };
    }
  }
  return null;
}

/** Vocabulary terms the document literally contains, in order of appearance. */
export function readCvSkills(text: string): string[] {
  const haystack = text.toLowerCase();
  const found: { label: string; at: number }[] = [];
  for (const skill of SKILL_VOCABULARY) {
    let earliest = Number.POSITIVE_INFINITY;
    for (const alias of skill.aliases) {
      if (!containsTerm(haystack, alias)) continue;
      earliest = Math.min(earliest, haystack.indexOf(alias));
    }
    if (Number.isFinite(earliest)) {
      found.push({ label: skill.label, at: earliest });
    }
  }
  return found.toSorted((a, b) => a.at - b.at).map((entry) => entry.label);
}

/**
 * Reads a CV into a set of proposals for the profile form.
 *
 * A field the document does not state is left null. There is no default, no
 * "most likely" fill, and no partial guess — an absent field stays absent all
 * the way to the form, where the owner supplies it or does not.
 */
export function readCvDraft(text: string): CvDraft {
  return {
    headline: readHeadline(text),
    yearsExperience: readYearsExperience(text),
    experienceLevel: readExperienceLevel(text),
    locationCountry: readLocationCountry(text),
    skills: readCvSkills(text),
  };
}

/** How much of the form a draft can fill, for the "we read N of 5" line. */
export function draftFieldCount(draft: CvDraft): number {
  return (
    (draft.headline ? 1 : 0) +
    (draft.yearsExperience ? 1 : 0) +
    (draft.experienceLevel ? 1 : 0) +
    (draft.locationCountry ? 1 : 0) +
    (draft.skills.length > 0 ? 1 : 0)
  );
}

export const DRAFT_FIELD_TOTAL = 5;
