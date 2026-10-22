# Africa discovery and mobile search release

- Jobicy uses the documented /api/jobs cursor endpoint (200/page), resumes bounded batches, and starts a fresh pass six hours after completion. Expired cursors restart. Filters remain unchanged.
- Himalayas rotates through every African country supported by the eligibility model plus worldwide. Each country keeps its own next page; only empty pages reset it. First pages refresh every six hours without losing deeper progress.
- Scheduled runs use independent source batches every 15 minutes, paced at one request per second. A platform deadline or provider failure retains successful work and retry progress. Per-job evidence timestamps are never refreshed by merging. Records not checked in 24 hours are removed from the rolling snapshot; this is not a claim that the employer closed them.
- Source URLs and country exclusions stay intact. Source snapshot writes validate and quarantine malformed individual rows. Provider display, indexing and email policy remains explicit.
- Three previously paused employer boards are restored through docs/data/2026-10-22-expand-africa-discovery.sql after current public API probes. Activation is not proof of successful ingestion; check subsequent import runs.
- Mobile primary search has role and country; evidence filtering is in More filters. Blank salary inputs no longer remove undisclosed-pay jobs or poison alerts. Broadening an empty search preserves the country and path. Alert creation and saved alerts link to their exact matching search.

Provider references checked 2026-10-22: https://jobicy.com/jobs-rss-feed and https://himalayas.app/api.
No paid provider account required. API backoff and bounded execution are infrastructure protections, not fixed catalogue caps.
