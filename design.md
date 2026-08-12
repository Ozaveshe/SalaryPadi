# SalaryPadi design system

## Direction

SalaryPadi is a modern-minimal, evidence-led career product. It should feel like a calm professional workbench: clear enough for a first-time job seeker, dense enough for a serious search, and trustworthy enough for salary and employer evidence.

The interface uses editorial hierarchy, restrained neutral surfaces, and explicit provenance. It does not use decorative colour rails, tinted card stacks, gradients, glow, glass effects, or full-screen overlays to manufacture hierarchy.

## Foundations

- Body: DM Sans, self-hosted through `next/font`.
- Display: Space Grotesk for page titles, section titles, and the wordmark.
- Primary text: ink 950; secondary text: ink 700; muted text: ink 500.
- Page: cool paper; surfaces: white or neutral ink 50/100.
- Primary action and links: violet. Gold is reserved for small semantic money or brand accents, never structural borders or large fills.
- Spacing: the existing 4px-derived scale (`--space-1` through `--space-16`).
- Corners: small radius for controls, medium radius only for genuinely grouped surfaces.
- Elevation: one restrained shadow level for floating navigation, previews, and menus. Content hierarchy should come from type and space first.

## Shared components

- Header: sticky, white, one neutral bottom rule. No coloured underline treatment.
- Buttons: solid violet primary, neutral outlined secondary, plain-text quiet action.
- Inputs: white with a neutral border; violet focus ring. Error borders may use the danger colour because they carry meaning.
- Notices and statuses: neutral by default; success, warning, and danger fills are allowed only when the state is explicit in text.
- Content surfaces: avoid wrapping every section in a card. Use headings, whitespace, and neutral rules. Cards are for a real grouped object or interactive boundary.
- Job results: a continuous record index, not a deck. Rows use neutral separators, no selected rail, no yellow hover fill, and no nested bordered pills for evidence.
- Editorial: readable long-form measure, strong title/deck, byline and review date, source list, related routes, and neutral separators.
- Consent and filters: remain in document flow. They must not cover page content or trap scrolling.

## Responsive rules

- Base styles target 320px and up.
- Job provenance moves below the role on narrow screens and becomes a right-hand scan column when space permits.
- Editorial grids collapse to one column without changing reading order.
- Controls remain at least 44px high; text and links wrap without horizontal scrolling.
- Navigation may open a compact menu, but content tools and consent controls do not become full-screen sheets.

## Content and SEO contract

- One descriptive H1 per page; heading order remains sequential.
- Every indexable page has a canonical URL, useful title and description, and crawlable internal links.
- Editorial claims show source name, source URL, retrieval date, and next review date.
- Structured data reflects visible content and never invents ratings, salaries, availability, or authorship.
- Unknown or degraded data stays visibly unknown and does not produce indexable placeholder pages.

## Anti-patterns

- No accent-coloured borders or edge rails.
- No gradients, glow, glassmorphism, or decorative blobs.
- No yellow content overlays or large tinted brand surfaces.
- No repeated rounded cards for every paragraph or metric.
- No floating consent banner or full-screen filter overlay.
- No fabricated salary, hiring, eligibility, employer, or freshness claims.
