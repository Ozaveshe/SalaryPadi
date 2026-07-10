export function JsonLd({
  data,
  nonce,
}: {
  data: Record<string, unknown>;
  nonce?: string | null;
}) {
  const serialized = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      nonce={nonce ?? undefined}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: serialized }}
    />
  );
}
