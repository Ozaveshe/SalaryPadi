# SEO and indexing

Entry point; operations detail in
[SEO_CONTENT_OPERATIONS.md](SEO_CONTENT_OPERATIONS.md) (note: its sitemap
"before" narrative predates the shipped six-part index).

## What ships

- **JobPosting markup is rights- and truth-gated**: emitted only when the
  source permits it, the page has a real description (140-char floor,
  metadata-only sentinel refused), and the job is currently publishable.
  Salary appears in markup only when visible on the page;
  `directApply: false` is hardcoded because every apply is outbound.
- **Indexing is evidence-gated per route**: job pages need a canonical id +
  source `may_index_jobs` + real content; company pages need an indexable
  active job or published cited evidence; salary pages need a ready read
  with data; `/jobs` and its filter combinations are deliberately noindex
  (the landing pages are the indexable entries); company community subroutes
  are noindex,follow.
- **Six child sitemaps** (jobs, companies, salaries, tools, guides,
  insights) + index; every entry passes the same indexability predicate as
  its page; `lastmod` is a product timestamp; a degraded inventory returns
  HTTP 503 rather than an empty set.
- **Indexing outbox** for Google notifications: collapse-before-claim
  (superseded-by-deletion, superseded-by-newer), dead-lettering with
  reasons, 200/day quota respected, fail-closed behind
  `GOOGLE_INDEXING_ENABLED` (default off).
- Robots disallow derives from the same protected-path list as the proxy and
  the no-store rules; canonicals asserted per-route by the crawl contract
  (`tests/e2e/seo-crawl.spec.ts` + fixture).

## Known gaps

Expired canonical jobs 404 with no closed-status tombstone or related-jobs
recirculation (the view hides expired rows before the page can say
"closed"); no 410 policy. "Similar jobs" never renders for database-backed
jobs (single-job feed). Landing pages all sit noindex until their demand
signal is set.
