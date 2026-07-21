import type { MatchResult } from "./types";

export type MatchBadgeTone = "success" | "neutral";

export interface MatchBadgeView {
  tone: MatchBadgeTone;
  /** Compact text for the pill itself. */
  label: string;
  /** The honest, self-contained version for screen readers and tooltips. */
  description: string;
}

const TIER_LABELS = {
  strong_match: "Strong match",
  possible_match: "Possible match",
  limited_match: "Limited match",
} as const;

function coverageNote(coverage: number): string {
  if (coverage >= 1) {
    return "Every comparable point was compared.";
  }
  const percent = Math.round(coverage * 100);
  return `Based on ${percent}% of the comparable points; the rest were not stated by you or by this posting.`;
}

/**
 * Turns a match result into a card badge, or null when there is nothing honest
 * to show. A bare number is not shown without the wording that says what it
 * compares, so `description` always travels with `label`.
 */
export function matchBadgeView(result: MatchResult): MatchBadgeView | null {
  // Nothing comparable is not a low score, and a card is the wrong place to
  // explain why — the profile page invites the missing details instead.
  if (result.tier === "insufficient_data" || result.score === null) {
    return null;
  }

  return {
    tone: result.tier === "strong_match" ? "success" : "neutral",
    label: `${TIER_LABELS[result.tier]} · ${result.score}`,
    description: `${TIER_LABELS[result.tier]}, scoring ${result.score} out of 100 against what you attested about yourself. ${coverageNote(result.coverage)} This is not an assessment of your suitability.`,
  };
}
