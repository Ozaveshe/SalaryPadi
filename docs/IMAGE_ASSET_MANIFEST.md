# Image asset manifest

Every image asset SalaryPadi needs, what format it must be, and where it comes
from. Two sourcing tracks: **official** (collected from the rights holder) and
**generated** (produced to spec).

Format rule: WebP for everything in this document. It does **not** apply to the
existing brand and social assets — see "Do not convert" at the bottom.

---

## Track 1 — Company logos (official, 100 files)

Replaces the runtime logo.dev lookup in `src/lib/companies/logo.ts` with
self-hosted files.

**Path:** `public/logos/{slug}.webp` — slug exactly as in
`data/companies/africa-major-companies.v1.json`.

**Spec:**

| Property   | Value                                                   |
| ---------- | ------------------------------------------------------- |
| Dimensions | 256 × 256, square canvas                                |
| Background | Transparent (the UI slot already paints `#fff` behind it) |
| Fit        | Logo contained with ~8% padding on the tight side       |
| Encoding   | WebP lossless, or near-lossless q90 for logos with gradients |
| Weight     | ≤ 12 KB each                                            |

The slot renders at 40 / 56 / 72 CSS px with `object-fit: contain`
(`src/components/companies/company-logo.module.css`), so 256px covers 3× retina
with headroom.

**Which mark to take:** prefer the company's square icon/symbol where one
exists — a horizontal wordmark contained in a square slot renders very small at
40px. Fall back to the wordmark only when there is no symbol.

**Where to source:** the company's own brand, press or media-kit page. Do not
scrape favicons or third-party aggregators. Record the source URL per company —
see "Permission record" below.

### Permission record

The catalog schema is `.strict()`, so this needs a schema change before the
files can be wired up. Each entry gains:

```
logoFile: "naspers.webp"
logoSourceUrl: "https://www.naspers.com/…/brand-assets"
logoSourceTitle: "Naspers media kit"
logoObtainedAt: "2026-07-26"
```

This mirrors the existing `officialSourceUrl` / `officialSourceTitle` /
`dataAsOf` provenance pattern already in the catalog, and is what makes a
trademark question answerable later.

### The 100 companies

| # | slug | name | domain |
| --- | --- | --- | --- |
| 1 | `naspers` | Naspers | naspers.com |
| 2 | `firstrand` | FirstRand | firstrand.co.za |
| 3 | `standard-bank-group` | Standard Bank Group | standardbank.com |
| 4 | `gold-fields` | Gold Fields | goldfields.com |
| 5 | `capitec-bank` | Capitec Bank | capitecbank.co.za |
| 6 | `anglogold-ashanti` | AngloGold Ashanti | anglogoldashanti.com |
| 7 | `attijariwafa-bank` | Attijariwafa Bank | attijariwafabank.com |
| 8 | `vodacom-group` | Vodacom Group | vodacom.com |
| 9 | `mtn-group` | MTN Group | mtn.com |
| 10 | `maroc-telecom` | Maroc Telecom | iam.ma |
| 11 | `valterra-platinum` | Valterra Platinum | valterraplatinum.com |
| 12 | `sanlam` | Sanlam | sanlam.com |
| 13 | `harmony-gold-mining` | Harmony Gold Mining | harmony.co.za |
| 14 | `shoprite-holdings` | Shoprite Holdings | shopriteholdings.co.za |
| 15 | `absa-group` | Absa Group | absa.africa |
| 16 | `bidcorp` | Bidcorp | bidcorpgroup.com |
| 17 | `airtel-africa` | Airtel Africa | airtel.africa |
| 18 | `discovery-limited` | Discovery Limited | discovery.co.za |
| 19 | `nedbank-group` | Nedbank Group | nedbank.co.za |
| 20 | `impala-platinum` | Impala Platinum | implats.co.za |
| 21 | `managem` | Managem | managemgroup.com |
| 22 | `banque-centrale-populaire` | Banque Centrale Populaire | groupebcp.com |
| 23 | `outsurance-group` | OUTsurance Group | outsurancegroup.co.za |
| 24 | `marsa-maroc` | Marsa Maroc | marsamaroc.co.ma |
| 25 | `safaricom` | Safaricom | safaricom.co.ke |
| 26 | `taqa-morocco` | TAQA Morocco | taqamorocco.ma |
| 27 | `kumba-iron-ore` | Kumba Iron Ore | angloamericankumba.com |
| 28 | `dangote-cement` | Dangote Cement | dangotecement.com |
| 29 | `pepkor-holdings` | Pepkor Holdings | pepkor.co.za |
| 30 | `commercial-international-bank-egypt` | Commercial International Bank Egypt | cibeg.com |
| 31 | `bua-foods` | BUA Foods | buafoodsplc.com |
| 32 | `reinet-investments` | Reinet Investments | reinet.com |
| 33 | `lafargeholcim-maroc` | LafargeHolcim Maroc | lafargeholcim.ma |
| 34 | `remgro` | Remgro | remgro.com |
| 35 | `bank-of-africa-morocco` | Bank of Africa Morocco | bankofafrica.ma |
| 36 | `clicks-group` | Clicks Group | clicksgroup.co.za |
| 37 | `bidvest-group` | Bidvest Group | bidvest.co.za |
| 38 | `sonatel` | Sonatel | sonatel.sn |
| 39 | `aspen-pharmacare` | Aspen Pharmacare | aspenpharma.com |
| 40 | `b2gold` | B2Gold | b2gold.com |
| 41 | `orange-cote-divoire` | Orange Côte d'Ivoire | orange.ci |
| 42 | `elsewedy-electric` | Elsewedy Electric | elsewedyelectric.com |
| 43 | `mtn-nigeria` | MTN Nigeria | mtn.ng |
| 44 | `sibanye-stillwater` | Sibanye-Stillwater | sibanyestillwater.com |
| 45 | `mr-price-group` | Mr Price Group | mrpricegroup.com |
| 46 | `old-mutual` | Old Mutual | oldmutual.com |
| 47 | `ciments-du-maroc` | Ciments du Maroc | cimentsdumaroc.com |
| 48 | `northam-platinum` | Northam Platinum | northam.co.za |
| 49 | `exxaro-resources` | Exxaro Resources | exxaro.com |
| 50 | `woolworths-holdings` | Woolworths Holdings | woolworthsholdings.co.za |
| 51 | `tiger-brands` | Tiger Brands | tigerbrands.com |
| 52 | `mtn-ghana-scancom` | MTN Ghana (Scancom) | mtn.com.gh |
| 53 | `mcb-group` | MCB Group | mcbgroup.com |
| 54 | `sasol` | Sasol | sasol.com |
| 55 | `multichoice-group` | MultiChoice Group | multichoice.com |
| 56 | `truworths-zimbabwe` | Truworths Zimbabwe | truworths.co.zw |
| 57 | `santam` | Santam | santam.co.za |
| 58 | `momentum-metropolitan` | Momentum Metropolitan | momentummetropolitan.co.za |
| 59 | `tgcc` | TGCC | tgcc.ma |
| 60 | `foschini-group` | The Foschini Group | tfglimited.co.za |
| 61 | `cosumar` | Cosumar | cosumar.co.ma |
| 62 | `talaat-moustafa-group` | Talaat Moustafa Group | talaatmoustafa.com |
| 63 | `eastern-company` | Eastern Company | easternegypt.com |
| 64 | `fmb-capital-holdings` | FMB Capital Holdings | fmbcapitalgroup.com |
| 65 | `groupe-addoha` | Groupe Addoha | groupeaddoha.com |
| 66 | `akdital` | Akdital | akdital.ma |
| 67 | `geregu-power` | Geregu Power | geregupowerplc.com |
| 68 | `wafa-assurance` | Wafa Assurance | wafaassurance.ma |
| 69 | `bua-cement` | BUA Cement | buacement.com |
| 70 | `investec` | Investec | investec.com |
| 71 | `transcorp-power` | Transcorp Power | transcorppower.com |
| 72 | `african-rainbow-minerals` | African Rainbow Minerals | arm.co.za |
| 73 | `boxer-retail` | Boxer Retail | boxer.co.za |
| 74 | `totalenergies-marketing-maroc` | TotalEnergies Marketing Maroc | totalenergies.ma |
| 75 | `mopco` | MOPCO | mopco-eg.com |
| 76 | `national-bank-of-malawi` | National Bank of Malawi | natbank.co.mw |
| 77 | `mtn-uganda` | MTN Uganda | mtn.co.ug |
| 78 | `getbucks-microfinance-bank` | GetBucks Microfinance Bank | getbucks.co.zw |
| 79 | `avi-limited` | AVI Limited | avi.co.za |
| 80 | `truworths-international` | Truworths International | truworthsinternational.com |
| 81 | `afriquia-gaz` | Afriquia Gaz | afriquiagaz.com |
| 82 | `guaranty-trust-holding-company` | Guaranty Trust Holding Company | gtcoplc.com |
| 83 | `ezz-steel` | Ezz Steel | ezzsteel.com |
| 84 | `egypt-aluminum` | Egypt Aluminum | egyptalum.com.eg |
| 85 | `abou-kir-fertilizers` | Abou Kir Fertilizers | abuqir.net |
| 86 | `dis-chem-pharmacies` | Dis-Chem Pharmacies | dischem.co.za |
| 87 | `aradel-holdings` | Aradel Holdings | aradel.com |
| 88 | `equity-group-holdings` | Equity Group Holdings | equitygroupholdings.com |
| 89 | `cih-bank` | CIH Bank | cihbank.ma |
| 90 | `drdgold` | DRDGOLD | drdgold.com |
| 91 | `labelvie` | LabelVie | labelvie.ma |
| 92 | `credit-du-maroc` | Crédit du Maroc | creditdumaroc.ma |
| 93 | `karooooo` | Karooooo | karooooo.com |
| 94 | `biat` | BIAT | biat.com.tn |
| 95 | `qnb-egypt` | QNB Egypt | qnbalahli.com |
| 96 | `alliances-developpement-immobilier` | Alliances Développement Immobilier | alliances.co.ma |
| 97 | `zenith-bank` | Zenith Bank | zenithbank.com |
| 98 | `fdh-bank` | FDH Bank | fdh.co.mw |
| 99 | `alexandria-container-and-cargo-handling` | Alexandria Container and Cargo Handling | alexcont.com |
| 100 | `spar-group` | The SPAR Group | thespargroup.com |

Any company missing a file keeps the existing deterministic monogram — the slot
is never empty and never shows a fabricated logo. Partial delivery is fine;
ship what you have.

---

## Track 2 — Generated art (27 files)

**Style:** abstract / geometric. Brand palette only (Forest 950 `#102f28`,
Forest 700 `#146b55`, Coral 600 `#c65332`, Gold 400 `#eec75f`, Sand 50
`#fffaf2`). No people, no photorealism, no text baked into the image.

**Background:** transparent, so one file works on both the sand and forest
surfaces. WebP supports alpha.

**Encoding:** WebP lossy q80. Flat geometric art compresses hard — if a file
exceeds its budget, the art is too detailed for the slot.

### 2a. Homepage hero (1) — slot not yet placed

**Path:** `public/art/hero-home.webp`
**Size:** 1600 × 1200 · **Budget:** ≤ 60 KB

Motif: layered pay bands / an ascending stepped bar form with a naira glyph
abstracted into the composition. Confident, calm, not busy.

**This slot is registered but not placed on the page.** `.home-start` is
already a two-column grid at ≥ 60rem — hero copy left, the deliberately
dominant search form right (`src/app/globals.css:2356`). There is no third
column, and adding one would put decoration in competition with the primary
action. Placing this needs a layout decision first: a third column at a wider
breakpoint, a background-layer treatment behind the section, or dropping the
hero art. The other 26 slots are placed and inert.

### 2b. Marketing pages (3)

**Size:** 1200 × 800 · **Budget:** ≤ 45 KB each

| Path | Route | Motif |
| --- | --- | --- |
| `public/art/about.webp` | `/about` | Converging lines resolving into a single verified path |
| `public/art/for-employers.webp` | `/for-employers` | Two-sided ledger / balanced forms |
| `public/art/post-a-job.webp` | `/post-a-job` | A form card fanning into distributed cards |

### 2c. Tools (5)

**Size:** 640 × 480 · **Budget:** ≤ 25 KB each

| Path | Route |
| --- | --- |
| `public/art/tools-index.webp` | `/tools` |
| `public/art/tool-take-home-pay.webp` | `/tools/take-home-pay` |
| `public/art/tool-offer-compare.webp` | `/tools/offer-compare` |
| `public/art/tool-salary-converter.webp` | `/tools/salary-converter` |
| `public/art/tool-job-scam-checker.webp` | `/tools/job-scam-checker` |

Motifs: gross-to-net subtraction stack; two columns weighed against each other;
two currency forms bridged by an arc; a shield with a broken/flagged segment.

### 2d. Empty states (4)

**Size:** 480 × 360 · **Budget:** ≤ 18 KB each

| Path | Route |
| --- | --- |
| `public/art/empty-jobs.webp` | `/jobs` with no results |
| `public/art/empty-saved.webp` | `/saved` |
| `public/art/empty-applications.webp` | `/applications` |
| `public/art/empty-alerts.webp` | `/alerts` |

Lighter weight than the rest — an empty state should feel quiet, not decorated.

### 2e. Insights article covers (13 + 1 default)

**Path:** `public/art/insights/{slug}.webp`
**Size:** 1600 × 900 (16:9) · **Budget:** ≤ 50 KB each

| Slug |
| --- |
| `remote-job-eligibility-for-nigerians` |
| `job-scam-warning-signs-nigeria` |
| `understand-take-home-pay-nigeria` |
| `compare-two-job-offers` |
| `salary-negotiation-with-evidence` |
| `graduate-trainee-internship-and-nysc-jobs` |
| `hnd-versus-bsc-job-requirements` |
| `contractor-versus-employee-offers` |
| `visa-sponsorship-evidence-for-nigerians` |
| `interview-preparation-with-company-evidence` |
| `how-salarypadi-builds-company-intelligence` |
| `how-salarypadi-measures-job-freshness` |

Plus `public/art/insights/_default.webp` — the fallback for any article
published without a cover, so a new article never renders a broken slot.

Note: articles are database-backed (`src/lib/editorial/repository.ts`), not
static. The 12 above are the cornerstone drafts; the count grows over time.

---

## Do not convert to WebP

These already exist and must stay in their current formats:

| Asset | Format | Why |
| --- | --- | --- |
| `public/brand/salarypadi-{logo,logo-dark,mark}.svg` | SVG | Vector; WebP would be a downgrade |
| `public/brand/icon-*.png` | PNG | Web app manifest / installer requirement |
| `src/app/favicon.ico`, `apple-icon.png`, `icon.svg` | ICO / PNG / SVG | App Router favicon conventions |
| `src/app/**/opengraph-image.png`, `twitter-image.png` | PNG | X, LinkedIn and WhatsApp link previews do not reliably render WebP |
| Dynamic OG routes (`opengraph-image.tsx`) | PNG via `ImageResponse` | Generated at request time; no source file needed |

All of the above are produced by `node scripts/generate-brand-assets.mjs` — see
`docs/BRAND.md`.

---

## How to ship an asset

The plumbing is built. Every slot is placed and renders nothing until its file
lands, so assets can arrive one at a time with no broken images in between.

**A company logo** — drop `public/logos/{slug}.webp`, add the `logo` record to
that company's catalog entry. Full procedure in `public/logos/README.md`. The
catalog schema rejects a filename that does not match the slug and rejects a
record missing any of its four fields.

**Generated art** — drop the file in `public/art/`, then add its id to
`shippedIds` in `src/lib/media/brand-art.ts`. The slot is already on the page.

**An article cover** — drop `public/art/insights/{slug}.webp`, then add the
slug to `shippedCoverSlugs` in the same file. Dropping
`public/art/insights/_default.webp` and flipping `defaultCoverShipped` gives
every uncovered article a cover in one step.

Art is decorative throughout: empty `alt`, hidden from assistive technology.
Anything needing alt text does not belong in this registry.

One deliberate exception: the `/jobs` empty state renders art only when the
feed is conclusive. A degraded-source message is a warning, and decorating it
would soften it.

## Watch after shipping

`docs/PRODUCT_EXPERIENCE_AUDIT.md:91` notes the public routes currently ship no
image payload and score above the 90 target. Re-measure once the first heavy
assets land.
