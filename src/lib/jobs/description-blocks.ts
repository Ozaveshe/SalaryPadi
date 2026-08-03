/**
 * Reading structure back out of a stored job description.
 *
 * Descriptions are stored as plain text, deliberately: the provider's markup
 * is not ours to republish, and text is what the search index, the digest
 * emails and the structured data all consume. But rendering that text as one
 * paragraph turns a well-organised posting into a wall, which is what the job
 * page did — every heading and bullet ran into the sentence before it.
 *
 * `htmlToPlainText` preserves two things through the strip: a line per block,
 * and a `- ` prefix per list item. That is enough to rebuild a readable
 * document without storing markup or trusting the provider's.
 */

export type DescriptionBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

/** Bullet characters providers use, plus the one our own strip writes. */
const BULLET = /^[-•*·–—]\s+/;

/**
 * A line is treated as a heading when it reads like a label rather than a
 * sentence, and something follows it.
 *
 * Deliberately narrow. A false heading is a cosmetic error, but a paragraph
 * of real content promoted to a heading would misrepresent the posting's
 * emphasis, so the rule wants every signal at once: short, few words, no
 * sentence-ending punctuation, and not the last thing on the page.
 */
const MAX_HEADING_CHARS = 60;
const MAX_HEADING_WORDS = 8;

function isHeading(line: string, hasFollowingContent: boolean): boolean {
  if (!hasFollowingContent) return false;
  const text = line.replace(/:$/, "").trim();
  if (text.length === 0 || text.length > MAX_HEADING_CHARS) return false;
  if (text.split(/\s+/).length > MAX_HEADING_WORDS) return false;
  // A full stop, or any mid-line sentence punctuation, means prose.
  return !/[.!?,;]/.test(text);
}

export function toDescriptionBlocks(description: string): DescriptionBlock[] {
  const lines = description
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
