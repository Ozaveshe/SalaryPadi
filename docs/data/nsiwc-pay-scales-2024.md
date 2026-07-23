# NSIWC pay-scale sources (secured 2026-07-23)

Official Nigerian federal pay structures from the National Salaries,
Incomes and Wages Commission (nsiwc.gov.ng — intermittently offline;
PDFs archived in `docs/data/sources/`).

| File                      | Circular                  | Effective   | Contents                                                                                                                  |
| ------------------------- | ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `sources/conpss2024.pdf`  | SWC.04/T/140, 23 Sep 2024 | 29 Jul 2024 | CONPSS annual salary table (post ₦70,000 minimum wage), GL01–GL17 × steps 01–15, naira per annum. Scanned; no text layer. |
| `sources/conhess2024.pdf` | (item 1 of same series)   | 29 Jul 2024 | CONHESS — Consolidated Health Salary Structure, 2024 revision.                                                            |
| `sources/conmess.pdf`     | earlier circular          | —           | CONMESS — Consolidated Medical Salary Structure (verify revision date before use).                                        |

Download provenance: `https://nsiwc.gov.ng/download/...?wpdmdl=40910`
(CONPSS), `40908` (CONHESS), `37008` (CONMESS).

## Anchor values transcribed from CONPSS 2024 (verify against the PDF before publishing)

Step 01 (scale minimum) per grade level, ₦/year — read from the rotated
table page; **every value must be re-verified against the PDF page before any
public use**:

GL01 930,000 · GL02 934,160 · GL03 937,713 · GL04 950,243 · GL05 973,123 ·
GL06 1,041,786 · GL07 1,277,667 · GL08 1,479,276 · GL09 1,641,226 ·
GL10 1,806,041 · GL12 2,007,152 · GL13 2,182,637 · GL14 2,358,936 ·
GL15 3,014,528 · GL16 3,611,689 · GL17 6,918,560. (CONPSS has no GL11.)
GL17 top visible value ≈ 8,870,837.

## Publication design decision (recorded)

These are deterministic pay **scales**, not survey distributions. Do NOT
publish them through `app.salary_benchmarks` percentile fields — scale
steps are not percentiles and labelling them so would misstate evidence.
The intended surface is a dedicated official-pay-scale lane (grade ×
step table with circular citation, effective date, and review-due date),
mapped to the role families: CONPSS → public-service, CONHESS →
healthcare-medicine/nursing/pharmacy, CONMESS → healthcare-medicine.
Design and build that surface before ingesting any values.
