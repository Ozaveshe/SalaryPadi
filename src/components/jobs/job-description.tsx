import { toDescriptionBlocks } from "@/lib/jobs/description-blocks";

/**
 * Renders a stored job description.
 *
 * Every value here is React text, never `dangerouslySetInnerHTML`. The stored
 * description is plain text by design, and the page keeps it that way: if a
 * provider's markup ever survives ingestion again, it renders as the visible
 * mistake it is rather than executing.
 */
export function JobDescription({ description }: { description: string }) {
  const blocks = toDescriptionBlocks(description);
  if (blocks.length === 0) return null;

  return (
    <div className="job-description">
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === "heading") {
          return (
            <h3 className="job-description-heading" key={key}>
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
