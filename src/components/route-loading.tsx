export function RouteLoading({ resource }: { resource: string }) {
  return (
    <div className="site-shell stack-lg" aria-busy="true" aria-live="polite">
      <section className="empty-state route-skeleton">
        <p className="visually-hidden">Loading {resource}…</p>
        <div className="route-skeleton-copy" aria-hidden="true">
          <span className="route-skeleton-line route-skeleton-line-short" />
          <span className="route-skeleton-line route-skeleton-line-title" />
          <span className="route-skeleton-line" />
        </div>
        <div className="route-skeleton-card" aria-hidden="true">
          <span className="route-skeleton-line route-skeleton-line-medium" />
          <span className="route-skeleton-line" />
          <span className="route-skeleton-line route-skeleton-line-short" />
        </div>
      </section>
    </div>
  );
}
