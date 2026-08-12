import { toDescriptionBlocks } from "@/lib/jobs/description-blocks";

function headingId(prefix: string, text: string, index: number) {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${prefix}-${slug || "section"}-${index + 1}`;
}

/**
 * Renders a stored job description.
 *
 * Every value here is React text, never `dangerouslySetInnerHTML`. The stored
 * description is plain text by design, and the page keeps it that way: if a
 * provider's markup ever survives ingestion again, it renders as the visible
 * mistake it is rather than executing.
 */
export function JobDescription({
  description,
  idPrefix = "job-description",
  sourceOnly = false,
  sourceName,
  sourceUrl,
}: {
  description: string;
  idPrefix?: string;
  sourceOnly?: boolean;
  sourceName?: string;
  sourceUrl?: string;
}) {
  const blocks = toDescriptionBlocks(description);
  if (blocks.length === 0) return null;

  const headings = blocks
    .map((block, index) =>
      block.kind === "heading"
        ? { id: headingId(idPrefix, block.text, index), text: block.text }
        : null,
    )
    .filter((heading): heading is NonNullable<typeof heading> =>
      Boolean(heading),
    );

  return (
    <div className="job-description">
      {sourceOnly ? (
        <div className="job-description-source-note">
          <p>{description}</p>
          {sourceUrl && sourceName ? (
            <a
              className="text-link"
              href={sourceUrl}
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              Read the full description on {sourceName}
            </a>
          ) : null}
        </div>
      ) : null}
      {!sourceOnly && headings.length >= 2 ? (
        <nav
          className="job-description-index"
          aria-label="Sections in this listing"
        >
          <span>In this listing</span>
          <div>
            {headings.slice(0, 8).map((heading) => (
              <a href={`#${heading.id}`} key={heading.id}>
                {heading.text}
              </a>
            ))}
          </div>
        </nav>
      ) : null}
      {sourceOnly
        ? null
        : blocks.map((block, index) => {
            const key = `${block.kind}-${index}`;
            if (block.kind === "heading") {
              const id = headingId(idPrefix, block.text, index);
              return (
                <h3 className="job-description-heading" id={id} key={key}>
                  {block.text}
                </h3>
              );
            }
            if (block.kind === "list") {
              return (
                <ul className="job-description-list" key={key}>
                  {block.items.map((item, itemIndex) => (
                    <li key={`${key}-${itemIndex}`}>{item}</li>
                  ))}
                </ul>
              );
            }
            return <p key={key}>{block.text}</p>;
          })}
    </div>
  );
}
