import { canonicalizeJobDestination } from "../fingerprint";
import type { EmploymentArrangement } from "../types";
import { sourceAuthorityScore, type SourceAuthority } from "./policy";

export interface DedupeCandidate {
  id: string;
  fingerprint: string;
  title: string;
  company: string;
  location: string;
  arrangement: EmploymentArrangement;
  applicationUrl: string;
  authority: SourceAuthority;
  firstSeenAt: string;
}

export type DuplicateDecision =
  | { kind: "exact"; canonicalId: string; duplicateId: string }
  | {
      kind: "fuzzy_review";
      leftId: string;
      rightId: string;
      titleSimilarity: number;
      reasons: string[];
    }
  | { kind: "distinct"; reasons: string[] };

function normalizedWords(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizedText(value: string) {
  return normalizedWords(value).join(" ");
}

function tokenSimilarity(left: string, right: string) {
  const a = new Set(normalizedWords(left));
  const b = new Set(normalizedWords(right));
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return (2 * intersection) / (a.size + b.size);
}

function arrangementCompatible(
  left: EmploymentArrangement,
  right: EmploymentArrangement,
) {
  return left === right || left === "unknown" || right === "unknown";
}

function authoritativeFirst(left: DedupeCandidate, right: DedupeCandidate) {
  const authority =
    sourceAuthorityScore(right.authority) -
    sourceAuthorityScore(left.authority);
  if (authority !== 0) return authority;
  const seen = Date.parse(left.firstSeenAt) - Date.parse(right.firstSeenAt);
  if (seen !== 0) return seen;
  return left.id.localeCompare(right.id);
}

function assertCanonicalCandidate(candidate: DedupeCandidate) {
  if (
    !candidate.id ||
    candidate.id !== candidate.id.trim() ||
    !/^[0-9a-f]{64}$/.test(candidate.fingerprint) ||
    !Number.isFinite(Date.parse(candidate.firstSeenAt))
  ) {
    throw new Error("invalid_canonical_candidate");
  }
}

export function chooseCanonicalAuthority(
  candidates: readonly DedupeCandidate[],
) {
  if (candidates.length === 0) throw new Error("canonical_candidate_required");
  candidates.forEach(assertCanonicalCandidate);
  return [...candidates].sort(authoritativeFirst)[0]!;
}

export function classifyDuplicate(
  left: DedupeCandidate,
  right: DedupeCandidate,
): DuplicateDecision {
  if (left.id === right.id)
    return { kind: "distinct", reasons: ["same_record"] };
  if (left.fingerprint === right.fingerprint) {
    const canonical = chooseCanonicalAuthority([left, right]);
    return {
      kind: "exact",
      canonicalId: canonical.id,
      duplicateId: canonical.id === left.id ? right.id : left.id,
    };
  }

  const reasons: string[] = [];
  if (normalizedText(left.company) !== normalizedText(right.company)) {
    reasons.push("company_mismatch");
  }
  if (normalizedText(left.location) !== normalizedText(right.location)) {
    reasons.push("location_mismatch");
  }
  if (!arrangementCompatible(left.arrangement, right.arrangement)) {
    reasons.push("arrangement_mismatch");
  }
  const similarity = tokenSimilarity(left.title, right.title);
  if (similarity < 0.9) reasons.push("title_similarity_below_0_9");

  let leftDestination: URL;
  let rightDestination: URL;
  try {
    leftDestination = new URL(canonicalizeJobDestination(left.applicationUrl));
    rightDestination = new URL(
      canonicalizeJobDestination(right.applicationUrl),
    );
  } catch {
    return { kind: "distinct", reasons: [...reasons, "invalid_destination"] };
  }
  if (
    leftDestination.hostname !== rightDestination.hostname ||
    leftDestination.pathname === rightDestination.pathname
  ) {
    reasons.push(
      leftDestination.hostname !== rightDestination.hostname
        ? "destination_host_mismatch"
        : "same_destination_should_have_exact_identity",
    );
  }

  if (reasons.length > 0) return { kind: "distinct", reasons };
  return {
    kind: "fuzzy_review",
    leftId: left.id,
    rightId: right.id,
    titleSimilarity: similarity,
    reasons: ["same_company_location_arrangement_and_destination_host"],
  };
}
