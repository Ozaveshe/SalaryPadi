# Company logos

Self-hosted company logos, served straight from the CDN at `/logos/{slug}.webp`.

## Adding a logo

1. Drop the file here as `{slug}.webp` — the slug exactly as it appears in
   `data/companies/africa-major-companies.v1.json`.
2. Add the `logo` record to that company's catalog entry:

   ```json
   "logo": {
     "file": "safaricom.webp",
     "sourceUrl": "https://www.safaricom.co.ke/media-centre",
     "sourceTitle": "Safaricom media centre",
     "obtainedAt": "2026-07-26"
   }
   ```

3. Run `npx vitest run src/lib/companies` — the catalog schema rejects a
   filename that does not match the slug, and rejects a record missing any of
   the four fields.

The record is what makes the file servable. A file dropped here without a
catalog record is never served; a catalog record is never written without the
file. Companies with neither render the deterministic monogram, which is the
normal state, not a failure.

## Spec

| Property   | Value                                                       |
| ---------- | ----------------------------------------------------------- |
| Dimensions | 256 × 256, square canvas                                    |
| Background | Transparent — the UI slot paints `#fff` behind it           |
| Fit        | Contained, ~8% padding on the tight side                    |
| Encoding   | WebP lossless (near-lossless q90 if the mark has gradients) |
| Weight     | ≤ 12 KB                                                     |

Prefer the company's square symbol over its horizontal wordmark: the slot
renders at 40–72 CSS px and a wordmark contained in a square is unreadable
there.

## Sourcing

Take files from the company's own brand, press or media-kit page, and record
that page as `sourceUrl`. Do not scrape favicons or third-party logo
aggregators — the point of the record is that it names a page the company
publishes, so a trademark question is answerable later.

See `docs/IMAGE_ASSET_MANIFEST.md` for the full list of 100 companies.
