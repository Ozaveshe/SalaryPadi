import styles from "./editorial-markdown.module.css";

type Block =
  | { kind: "heading"; level: 2 | 3; text: string; id: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

function headingId(text: string, index: number) {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return slug || `section-${index + 1}`;
}

export function parseEditorialMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ kind: "paragraph", text });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.items.length) blocks.push({ kind: "list", ...list });
    list = null;
  };

  for (const line of lines) {
    const heading = /^(##|###)\s+(.+)$/.exec(line.trim());
    const item = /^(?:(\d+)\.|[-*])\s+(.+)$/.exec(line.trim());
    if (heading) {
      flushParagraph();
      flushList();
      const text = heading[2]!.trim();
      blocks.push({
        kind: "heading",
        level: heading[1] === "##" ? 2 : 3,
        text,
        id: headingId(text, blocks.length),
      });
    } else if (item) {
      flushParagraph();
      const ordered = Boolean(item[1]);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(item[2]!.trim());
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function EditorialMarkdown({ markdown }: { markdown: string }) {
  const blocks = parseEditorialMarkdown(markdown);
  return (
    <div className={styles.prose}>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return block.level === 2 ? (
            <h2 id={block.id} key={`${block.id}-${index}`}>
              {block.text}
            </h2>
          ) : (
            <h3 id={block.id} key={`${block.id}-${index}`}>
              {block.text}
            </h3>
          );
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={`list-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{item}</li>
              ))}
            </List>
          );
        }
        return <p key={`paragraph-${index}`}>{block.text}</p>;
      })}
    </div>
  );
}
