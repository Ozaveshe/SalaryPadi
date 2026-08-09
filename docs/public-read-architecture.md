# Public read architecture

Entry point; depth in [product-architecture.md](product-architecture.md) and
[freshness-and-fallbacks.md](freshness-and-fallbacks.md).

## How a public page reads

27 `api.*` views (security_invoker + security_barrier) with explicit column
lists and bounded queries throughout (`limit n+1` overflow detection, paged
sitemap reads with explicit capacity-exceeded failure). Job publication is
enforced in one RLS policy (`jobs_public_read`): published, open,
non-fixture, deadline live, **cached** provenance present (per-row cache
after the 57014 timeout incident — never reintroduce per-row rights calls
into the policy), and the apply link not confirmed broken.

A failed read is never zero jobs: the jobs feed reports
live/degraded/disabled/unavailable, count labels say "Unavailable" or
"N available (partial)", and raw errors never reach a public surface
(structured server logs only; fixed public copy).

## Honest weaknesses (measured 9 Aug 2026)

1. **No public HTML caching**: every page serves
   `private,no-cache,no-store`; list routes measure 2.0–2.6 s against the
   ~800 ms cached-page target. `netlify.toml` has no headers block; no route
   sets `revalidate`. Only sitemaps carry cache headers.
2. **Two providers still fetch at request time on cache miss** (Remotive,
   ReliefWeb: `snapshotKey: null`) from the homepage and every sitemap
   request — bounded at 2.5 s, but acquisition belongs off the request path.
3. No performance budget or timing gate anywhere in CI; the
   `jobs.feed_assembled` telemetry is log-only.
4. `/api/health` is unauthenticated and names every worker, owner, timestamp
   and the supply canary — contradicting the project's own stated principle.
   Gating it requires coordinating the GitHub workflow secrets first.
5. The five-state freshness vocabulary is specification-under-test; no
   feed-level `stale` state ships (per-job age decay does).
