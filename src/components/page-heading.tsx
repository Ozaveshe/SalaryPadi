export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 className="page-title">{title}</h1>
      {description ? <p className="lede">{description}</p> : null}
    </header>
  );
}
