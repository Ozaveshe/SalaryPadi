# Freshness and fallbacks

A public surface answers two questions at once: _what can I show you_, and
_how current is it_. Collapsing them is how a source outage becomes the
sentence "no jobs found" — a claim about the Nigerian job market rather than
about our pipeline, and a false one.

## The five states

Implemented in [`src/lib/serving/freshness.ts`](../src/lib/serving/freshness.ts).

| State             | Meaning                                                         | Shows records? |
| ----------------- | --------------------------------------------------------------- | -------------- |
| `current`         | Everything processed within the freshness target                | Yes            |
| `partial`         | Some approved sources delayed; shown jobs individually verified | Yes            |
| `stale`           | Latest verified snapshot older than the target                  | Yes            |
| `unavailable`     | No trustworthy snapshot can be served                           | No             |
| `confirmed_empty` | The read succeeded and genuinely matched nothing                | No             |

Classification order is load-bearing. A failed read is checked **first** and
can never fall through to `confirmed_empty`, because the only thing that
entitles us to tell someone there are no matching jobs is a read that
actually completed. Equally, zero records while any source is delayed is
`partial`, never `confirmed_empty`.

## Consumer language

Every state carries a message written for a job seeker. Source names, error
codes, queue states and parser errors never appear; a test asserts every
message against a list of forbidden operational vocabulary.

| State           | Message                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| current         | "Updated 2 August at 14:20."                                                                                                             |
| partial         | "Updated … Some sources are delayed, but the jobs shown below are from the latest verified snapshot."                                    |
| stale           | "Updated … These jobs are from our latest verified snapshot, which is older than usual — check the employer's own page before applying." |
| unavailable     | "We could not load jobs just now. This does not mean there are no jobs — please try again shortly."                                      |
| confirmed_empty | "Updated … No jobs match this search right now."                                                                                         |

Each verdict also carries an `operatorNote` with the detail — delayed counts,
snapshot age — which is for logs and the private dashboard only.

## Public status

`toPublicStatus()` reduces the five internal states to four public ones:
`current`, `delayed`, `partial`, `unavailable`, plus the last successful
update time. Nothing else is exposed. A status endpoint is a public surface,
and naming which provider is failing tells the world where our supply comes
from and when it is weak.

Note that `confirmed_empty` maps to `current`: an empty search result is a
healthy system, not a fault.

## The fallback that was removed

Public rendering used to read a worker-written snapshot and, if that snapshot
was stale, **fall through to a live provider fetch**. That single fallback is
what made public latency a function of provider latency.

Measured before the change, on the homepage:

```
{"event":"jobs.feed_assembled","total_ms":5625,"budget_ms":2500,
 "source_ms":{"remotive":19,"reliefweb":18,"himalayas":5624,"jobicy":5624,"database":5620}}
```

The request path now stops at the snapshot. When none is fresh, the source is
reported as delayed (`<source>_awaiting_refresh`), the page keeps serving
everything else it has, and the freshness classifier turns that into "some
sources are delayed" — not into a smaller job count presented as fact.
Acquisition belongs to the scheduled worker, which is entirely independent of
the request path.

## Measured effect

Same dev server, same remote database, before and after.

| Source in the assembly | Before   | After   |
| ---------------------- | -------- | ------- |
| himalayas              | 5,624 ms | ~500 ms |
| jobicy                 | 5,624 ms | ~500 ms |

Homepage TTFB locally: 2.66 s cold, then **0.25–0.92 s** warm.

Production TTFB before the change, five runs each:

| Route        | Runs                                   |
| ------------ | -------------------------------------- |
| `/`          | 4.90 s, 0.75 s, 0.71 s, 2.12 s, 1.05 s |
| `/jobs`      | 0.65–0.87 s                            |
| `/companies` | 0.67–0.97 s                            |
| `/salaries`  | 0.65–1.01 s                            |

The homepage was the outlier, and its variance (0.71 s to 4.90 s) is the
signature of exactly this fallback: a cache hit was fast, a miss went to the
providers.

## Query-plan evidence: the database is not the bottleneck

After removing the provider calls, the dev logs showed `database: 2500 ms`,
which looks like the next thing to fix. It is not. The anon read plan against
production:

```
Limit (actual time=9.010..9.023 rows=60)
  Sort  Method: top-N heapsort  Memory: 46kB
    Nested Loop (actual time=2.862..8.799 rows=230)
      Index Scan using jobs_expiry on jobs  (actual time=0.093..1.792 rows=230)
        Rows Removed by Filter: 900
      Memoize  Hits: 220  Misses: 10
        Index Only Scan using job_sources_pkey
      Index Scan using companies_pkey
Planning Time: 3.276 ms
Execution Time: 9.189 ms
```

**9.19 ms**, entirely index scans, Memoize at 220 hits to 10 misses, no
sequential scan, every buffer a shared hit. The 2,500 ms was network
round-trip from a Windows dev machine to a remote Supabase instance, plus dev
server overhead — production `/jobs` at 0.65–0.87 s confirms the read is
fine in place. Optimising it would have been work against a measurement
artefact.

One number in that plan is worth watching: `Rows Removed by Filter: 900`. The
scan reads 1,130 rows to return 230, because publishability is evaluated per
row. At this scale it costs under 2 ms. It is the figure that grows with the
estate, and the precomputed-flag work is the answer when it does.
