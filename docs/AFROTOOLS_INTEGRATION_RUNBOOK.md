# AfroTools integration runbook

## Production contract

SalaryPadi consumes only the deployed AfroTools catalog at `https://afrotools.com/data/tool-directory.json` and documented endpoints under `https://afrotools.com/api/v1`:

- `POST /tax/paye` for Nigeria gross-to-net and net-to-gross PAYE calculations.
- `GET /tax/rates` for the rules version, year, source and authority attached to each PAYE result.
- `GET /fx/rates` for unit FX rates used by salary conversion and deterministic offer comparison.

The job-scam checker remains a local deterministic SalaryPadi tool because no
corresponding endpoint is present in the published API documentation.

The integration must not call undocumented endpoints or infer data fields that are absent from a response. The API key is server-only and is never included in `NEXT_PUBLIC_*` configuration, client components, browser requests, analytics, logs or error responses.

## Configuration

Set these encrypted production variables:

- `AFROTOOLS_API_BASE_URL=https://afrotools.com/api/v1`
- `AFROTOOLS_API_KEY=<production key>`

The outbound URL guard refuses any credentialed request whose origin is not `https://afrotools.com` or whose path is not `/api/v1`. After changing either variable, redeploy and verify `/api/health` without printing the key.

## Catalog synchronization and last-known-good behavior

`afrotools-catalog-sync` runs at minute 5 every six hours. It validates the HTTP status, JSON content type, 2 MiB response limit, item schema, live state, English language and minimum relevant-tool count before replacing the strongly consistent Netlify Blob snapshot.

The tools page uses the synchronized snapshot when available. A bundled snapshot taken from the deployed catalog is the cold-start last-known-good copy. A snapshot is:

- live for seven days after a successful check;
- stale, with a visible warning, from day 7 through day 30;
- unavailable after 30 days, at which point no unverified tool cards are shown.

A failed synchronization never replaces the last-known-good snapshot. The tracked worker records success/failure and raises the standard operational failure alert. Worker health is stale after 14 hours.

## Calculation failure behavior

PAYE and FX-dependent tools return no result when AfroTools is unconfigured, unauthorized, timed out, rate-limited, malformed or outside the freshness boundary. HTTP 429 preserves a bounded `Retry-After` value. Provider response bodies, input amounts and keys are not logged.

FX rates are fresh for 36 hours, stale with a warning through 30 days, and refused after 30 days. Net-to-gross PAYE responses are refused when the returned net differs from the requested net by more than 0.5% (or one naira). Salary conversion sends only a unit currency-pair request; the salary amount is multiplied locally. Offer comparison sends only currency pairs to AfroTools and runs SalaryPadi's deterministic comparison locally.

## Monitoring and recovery

Check:

1. `/api/health` includes `afrotools_catalog_sync` and reports AfroTools configured.
2. The worker history has a successful catalog sync within 14 hours.
3. `/tools` shows the source URL, checked time and catalog update date.
4. A PAYE result shows API/rules versions and verification time.
5. An FX result shows source, update time and freshness warning where applicable.

To stop provider traffic immediately, remove or rotate `AFROTOOLS_API_KEY` and redeploy. Calculation routes then fail closed with no result. To stop catalog refresh while retaining the bounded last-known-good directory, disable the Netlify scheduled function; do not delete the Blob snapshot unless the directory must be made unavailable immediately.
