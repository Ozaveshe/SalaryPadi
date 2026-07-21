/**
 * Curated role-vocabulary synonyms so a search finds the jobs it means, not
 * only the jobs that share its exact wording. Groups are tuned to how
 * Nigerian and wider African job-seekers actually phrase roles. A group
 * activates only when every word of one of its phrases appears in the query,
 * which keeps expansion conservative: "frontend developer" activates the
 * frontend group, but "developer" alone never drags in unrelated groups.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["frontend", "front end", "ui developer", "ui engineer"],
  ["backend", "back end", "server side"],
  ["fullstack", "full stack"],
  [
    "devops",
    "platform engineer",
    "site reliability",
    "sre",
    "infrastructure engineer",
  ],
  ["software engineer", "software developer", "programmer"],
  ["data analyst", "business intelligence", "bi analyst"],
  ["data scientist", "machine learning", "ml engineer", "ai engineer"],
  ["product manager", "product owner"],
  ["qa", "quality assurance", "test engineer", "software tester", "sdet"],
  ["ux designer", "ui designer", "product designer", "ux researcher"],
  [
    "customer support",
    "customer service",
    "customer success",
    "call center",
    "contact centre",
    "customer care",
  ],
  [
    "sales representative",
    "business development",
    "bdr",
    "sdr",
    "account executive",
  ],
  ["accountant", "bookkeeper", "account officer"],
  [
    "digital marketing",
    "growth marketing",
    "performance marketing",
    "social media manager",
  ],
  ["copywriter", "content writer", "content creator"],
  [
    "virtual assistant",
    "executive assistant",
    "administrative assistant",
    "personal assistant",
  ],
  ["human resources", "people operations", "talent acquisition", "recruiter"],
  ["cybersecurity", "information security", "security analyst", "infosec"],
  [
    "mobile developer",
    "android developer",
    "ios developer",
    "flutter",
    "react native",
  ],
  ["project manager", "programme manager", "program manager"],
];

const MAX_EXPANSIONS = 12;

function normalizeQuery(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseActivated(phrase: string, queryWords: readonly string[]) {
  const phraseWords = phrase.split(" ");
  return phraseWords.every((word) => queryWords.includes(word));
}

/**
 * Returns the equivalent role phrases for a query, never including the query
 * itself and never exceeding a small bound. An empty result means the query
 * has no known synonyms and matching proceeds exactly as before.
 */
export function expandJobSearchQuery(query: string): string[] {
  const normalized = normalizeQuery(query);
  if (normalized.length < 2) return [];
  const queryWords = normalized.split(" ");
  const expansions: string[] = [];
  for (const group of SYNONYM_GROUPS) {
    if (!group.some((phrase) => phraseActivated(phrase, queryWords))) continue;
    for (const phrase of group) {
      if (phraseActivated(phrase, queryWords)) continue;
      if (expansions.includes(phrase)) continue;
      expansions.push(phrase);
      if (expansions.length >= MAX_EXPANSIONS) return expansions;
    }
  }
  return expansions;
}
