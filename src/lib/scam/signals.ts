import { getDomain } from "tldts";

const PAYMENT_ACTIONS = new Set([
  "pay",
  "send",
  "transfer",
  "deposit",
  "remit",
  "drop",
]);
const FEE_TERMS = new Set([
  "fee",
  "fees",
  "payment",
  "payments",
  "deposit",
  "charge",
  "charges",
]);
const NEGATION_TOKENS = new Set(["no", "not", "never", "without"]);

const KNOWN_LEGIT_DOMAIN_GROUPS = [
  new Set([
    "yahoo.com",
    "yahoo.co.uk",
    "yahoo.com.au",
    "yahoo.com.ng",
    "yahoo.co.in",
  ]),
  new Set(["outlook.com", "outlook.co.uk", "outlook.de", "outlook.fr"]),
  new Set(["gmx.com", "gmx.net"]),
  new Set(["proton.me", "protonmail.com"]),
] as const;

export function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function splitIntoStatements(text: string): string[] {
  return text
    .replace(/([.!?])\s+/g, "$1\n")
    .split(/\r?\n+/)
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function evidenceSnippet(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= 180 ? compact : `${compact.slice(0, 177)}...`;
}

export function findStatement(
  statements: readonly string[],
  patterns: readonly RegExp[],
  reject?: (statement: string) => boolean,
): string | null {
  for (const statement of statements) {
    if (reject?.(statement)) continue;
    if (patterns.some((pattern) => pattern.test(statement))) {
      return evidenceSnippet(statement);
    }
  }
  return null;
}

export function feeIsNegated(statement: string): boolean {
  if (
    /\b(?:company|employer|we)\b.{0,30}\b(?:will\s+)?(?:pay|cover|reimburse)\b.{0,45}\b(?:fee|fees|payment|deposit|charge)\b/i.test(
      statement,
    ) ||
    /\b(?:fee|fees|payment|deposit|charge)\b.{0,35}\b(?:paid|covered|reimbursed)\s+by\s+(?:the\s+)?(?:company|employer|us)\b/i.test(
      statement,
    )
  ) {
    return true;
  }
  // A positive instruction in a separate nearby clause must not be hidden by
  // a broad "no fee" phrase elsewhere in the same statement.
  if (feeRequestInTokenWindow(statement)) return false;
  return (
    /\b(?:no|never|without)\b.{0,55}\b(?:fee|fees|payment|deposit|charge)\b/i.test(
      statement,
    ) ||
    /\b(?:do not|does not|will not|won't|don't|doesn't)\b.{0,35}\b(?:pay|charge|ask|request)\b/i.test(
      statement,
    )
  );
}

export function feeRequestInTokenWindow(statement: string): boolean {
  const normalized = statement
    .toLowerCase()
    .replace(/(?:do|does|did)n['’]t/g, "$1 not")
    .replace(/won['’]t/g, "will not")
    .replace(/can['’]t/g, "can not");
  const tokens = normalized.match(/[a-z0-9₦]+/g) ?? [];
  for (let actionIndex = 0; actionIndex < tokens.length; actionIndex += 1) {
    if (!PAYMENT_ACTIONS.has(tokens[actionIndex] ?? "")) continue;
    for (let feeIndex = 0; feeIndex < tokens.length; feeIndex += 1) {
      if (!FEE_TERMS.has(tokens[feeIndex] ?? "")) continue;
      if (Math.abs(actionIndex - feeIndex) > 8) continue;
      const scopeStart = Math.max(0, Math.min(actionIndex, feeIndex) - 3);
      const scopeEnd = Math.max(actionIndex, feeIndex);
      const scope = tokens.slice(scopeStart, scopeEnd + 1);
      if (scope.some((token) => NEGATION_TOKENS.has(token))) continue;
      const subject = tokens.slice(Math.max(0, actionIndex - 1), actionIndex);
      if (
        subject.some((token) => ["company", "employer", "we"].includes(token))
      ) {
        continue;
      }
      return true;
    }
  }
  return false;
}

export function safetyWarningIsNegated(statement: string): boolean {
  return (
    /\b(?:never|do not|does not|will not|won't|must not|should not)\b.{0,60}\b(?:send|share|provide|enter|give|submit|pay|request|ask|conduct|use|pressure)\b/i.test(
      statement,
    ) ||
    /\b(?:never|do not|does not|will not|won't|must not|should not)\b.{0,60}\b(?:password|pin|otp|cvv|passport|identity|crypto|bitcoin|whatsapp|telegram)\b/i.test(
      statement,
    )
  );
}

export function normalizeDomain(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim().toLowerCase();
  const emailDomain = trimmed.includes("@") ? trimmed.split("@").at(-1) : null;
  const candidate = emailDomain ?? trimmed;

  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
        ? candidate
        : `https://${candidate}`,
    );
    return url.hostname.replace(/^www\./, "").replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

export function registrableDomain(value: string): string | null {
  const normalized = normalizeDomain(value);
  if (!normalized) return null;
  return getDomain(normalized, {
    allowPrivateDomains: false,
    validateHostname: false,
  });
}

export function normalizeConfusableDomain(domain: string): string {
  return domain
    .split(".")
    .map((label) =>
      label.replace(/rn/g, "m").replace(/0/g, "o").replace(/1/g, "l"),
    )
    .join(".");
}

export function isSameOrSubdomain(
  candidate: string,
  expected: string,
): boolean {
  return candidate === expected || candidate.endsWith(`.${expected}`);
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + substitutionCost,
      );
    }
    previous = current;
  }

  return previous[right.length] ?? Math.max(left.length, right.length);
}

export function couldBeLookalike(candidate: string, official: string): boolean {
  if (candidate.includes("xn--")) return true;
  if (isSameOrSubdomain(candidate, official)) return false;
  const candidateDomain = registrableDomain(candidate);
  const officialDomain = registrableDomain(official);
  if (!candidateDomain || !officialDomain || candidateDomain === officialDomain)
    return false;
  if (
    KNOWN_LEGIT_DOMAIN_GROUPS.some(
      (group) => group.has(candidateDomain) && group.has(officialDomain),
    )
  ) {
    return false;
  }

  const normalizedCandidate = normalizeConfusableDomain(candidateDomain);
  const normalizedOfficial = normalizeConfusableDomain(officialDomain);
  if (
    normalizedCandidate === normalizedOfficial &&
    candidateDomain !== officialDomain
  ) {
    return true;
  }

  const distance = editDistance(normalizedCandidate, normalizedOfficial);
  const length = Math.max(
    normalizedCandidate.length,
    normalizedOfficial.length,
  );
  const threshold = length <= 12 ? 1 : length <= 24 ? 2 : 3;
  const maximumRatio = length <= 6 ? 0.25 : length <= 12 ? 0.15 : 0.12;
  return (
    distance > 0 && distance <= threshold && distance / length <= maximumRatio
  );
}

export function extractEmails(text: string): string[] {
  return unique(
    text.match(
      /[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)+/gi,
    ) ?? [],
  );
}

export interface ExtractedUrl {
  raw: string;
  domain: string;
  statement: string;
}

export function extractUrls(statements: readonly string[]): ExtractedUrl[] {
  const urls: ExtractedUrl[] = [];
  statements.forEach((statement) => {
    const matches = statement.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) ?? [];
    matches.forEach((match) => {
      const raw = match.replace(/[),.;!?]+$/, "");
      const domain = normalizeDomain(raw);
      if (domain) urls.push({ raw, domain, statement });
    });
  });
  return urls;
}
