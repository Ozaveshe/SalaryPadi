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
  return (
    /\b(?:no|never|without)\b.{0,55}\b(?:fee|fees|payment|deposit|charge)\b/i.test(
      statement,
    ) ||
    /\b(?:do not|does not|will not|won't)\b.{0,35}\b(?:pay|charge|ask|request)\b/i.test(
      statement,
    )
  );
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
  const distance = editDistance(candidate, official);
  return (
    distance > 0 &&
    distance <= (Math.max(candidate.length, official.length) > 12 ? 2 : 1)
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
