import Link from "next/link";

export function Pagination({
  currentPage,
  totalPages,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  searchParams: URLSearchParams;
}) {
  if (totalPages <= 1) return null;

  const pageHref = (page: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(page));
    return `/jobs?${next.toString()}`;
  };

  return (
    <nav className="pagination" aria-label="Job results pages">
      {currentPage > 1 ? (
        <Link
          className="button button-secondary"
          href={pageHref(currentPage - 1)}
        >
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span>
        Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
      </span>
      {currentPage < totalPages ? (
        <Link
          className="button button-secondary"
          href={pageHref(currentPage + 1)}
        >
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
