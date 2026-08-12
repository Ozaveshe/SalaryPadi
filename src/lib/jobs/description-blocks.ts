/**
 * Reading structure back out of a stored job description.
 *
 * Descriptions stay plain text: provider markup is neither trusted nor
 * required. The import layer preserves block lines and bullet prefixes, which
 * is enough to rebuild a readable document without interpreting HTML.
 */

export type DescriptionBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

const BULLET = /^[-\u2022*\u00b7\u2013\u2014]\s+/;
const MAX_HEADING_CHARS = 60;
const MAX_HEADING_WORDS = 8;

const SECTION_LABEL = [
  "about(?: the)? (?:company|organisation|organization|role|team|job|position)",
  "about (?:us|you|this role)",
  "about [a-z0-9&'\\u2019 .-]+",
  "the role",
  "the role entails",
  "role (?:overview|summary|purpose)",
  "job (?:overview|summary|description|purpose)",
  "position (?:overview|summary|purpose)",
  "what you['\\u2019]?ll do",
  "what you will do",
  "what we['\\u2019]?re looking for",
  "what we are looking for",
  "what we are looking for in you",
  "what (?:we|you) (?:do|bring)",
  "what your day will look like",
  "what success looks like(?: in this role)?",
  "what we (?:offer colleagues|offer you|can offer you)",
  "what you['\\u2019]?ll (?:help us achieve|do|get to do)",
  "how you['\\u2019]?ll help us achieve it",
  "you might be a good fit if you",
  "who we are",
  "who you are",
  "your (?:role|impact|responsibilities|profile)",
  "key (?:responsibilities|duties|tasks|requirements|qualifications)",
  "responsibilities",
  "duties",
  "requirements",
  "qualifications",
  "skills(?: and experience)?",
  "skills (?:&|and) competencies",
  "nice-to-have skills",
  "additional skills that (?:you might also bring|we value)",
  "experience",
  "experience (?:&|and) background",
  "education",
  "benefits",
  "compensation(?: and benefits)?",
  "our offer",
  "what we offer",
  "we offer",
  "key details",
  "job purpose",
  "job location",
  "eligibility",
  "application deadline",
  "preferred start date",
  "preferred qualifications",
  "preferred",
  "career growth and development",
  "our (?:mission|team)",
  "recruitment process",
  "what to expect in the hiring process",
  "how to apply",
  "application process",
  "equal opportunity",
  "commitment to safeguarding",
  "reasonable accommodations",
  "voluntary self-identification",
  "referrals",
  "working at [a-z0-9&'\\u2019 .-]+",
  "cross-functional collaboration",
].join("|");

const COMMON_SECTION_HEADING = new RegExp(`^(?:${SECTION_LABEL})$`, "i");

/**
 * A provider label needs explicit structural evidence. This deliberately does
 * not treat every short, unpunctuated phrase as a heading: doing so promoted
 * ordinary lines such as "We build products" and changed their emphasis.
 */
function isHeading(line: string, hasFollowingContent: boolean): boolean {
  if (!hasFollowingContent) return false;
  const text = line.replace(/:$/, "").trim();
  if (text.length === 0 || text.length > MAX_HEADING_CHARS) return false;
  if (text.split(/\s+/).length > MAX_HEADING_WORDS) return false;
  if (COMMON_SECTION_HEADING.test(text)) return true;
  if (line.trim().endsWith(":")) return !/[.!?,;]/.test(text);

  const letters = text.replace(/[^A-Za-z]/g, "");
  return letters.length >= 2 && text === text.toUpperCase();
}

/**
 * Some feeds flatten `Responsibilities: ... Requirements: ...` into one line.
 * Restore only a closed vocabulary of provider section labels; the source
 * words and ordering remain untouched and no summary is invented.
 */
function restoreInlineStructure(description: string): string {
  return description
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+(?=[\u2022\u00b7]\s+)/g, "\n")
    .replace(
      new RegExp(`(^|\\s)(?=(${SECTION_LABEL}):\\s+)`, "gi"),
      (prefix) => (prefix.includes("\n") ? prefix : "\n"),
    )
    .replace(new RegExp(`^(${SECTION_LABEL}):\\s*(.+)$`, "gim"), "$1\n$2")
    .replace(/^\n+/, "");
}

export function toDescriptionBlocks(description: string): DescriptionBlock[] {
  const lines = restoreInlineStructure(description)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const blocks: DescriptionBlock[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ kind: "list", items: listItems });
      listItems = [];
    }
  };

  lines.forEach((line, index) => {
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, "").trim();
      if (item.length > 0) listItems.push(item);
      return;
    }
    flushList();
    const hasFollowingContent = index < lines.length - 1;
    blocks.push(
      isHeading(line, hasFollowingContent)
        ? { kind: "heading", text: line.replace(/:$/, "").trim() }
        : { kind: "paragraph", text: line },
    );
  });
  flushList();

  return blocks;
}
