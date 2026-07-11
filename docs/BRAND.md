# SalaryPadi brand

The SalaryPadi mark is a speech bubble — a padi (friend, in Nigerian Pidgin)
talking — carrying the naira sign, with a small gold spark of good news. It
says: a trusted friend who tells you the truth about jobs and pay.

## Files

All generated brand files come from one script:

```powershell
node scripts/generate-brand-assets.mjs
```

| File                                                                 | Use                                           |
| -------------------------------------------------------------------- | --------------------------------------------- |
| `public/brand/salarypadi-mark.svg`                                   | Mark only, any size, light or dark background |
| `public/brand/salarypadi-logo.svg`                                   | Horizontal lockup for light backgrounds       |
| `public/brand/salarypadi-logo-dark.svg`                              | Horizontal lockup for dark backgrounds        |
| `public/brand/icon-192.png`, `icon-512.png`, `icon-512-maskable.png` | Web app manifest icons                        |
| `public/brand/banner-x.png`                                          | X (Twitter) profile header, 1500×500          |
| `public/brand/banner-linkedin.png`                                   | LinkedIn company banner, 1128×191             |
| `public/brand/readme-banner.svg`                                     | Repository README banner                      |
| `src/app/icon.svg`, `src/app/favicon.ico`, `src/app/apple-icon.png`  | Favicons (App Router conventions)             |
| `src/app/**/opengraph-image.png`, `twitter-image.png`                | Social share images per route section         |

The in-app header and footer logo is the inline SVG in
`src/components/brand.tsx`; keep it in sync with the script when the mark
changes.

## Color

The palette is defined once in `src/app/globals.css` and mirrored in the
generator script.

| Token      | Hex       | Role                                   |
| ---------- | --------- | -------------------------------------- |
| Forest 950 | `#102f28` | Ink, dark surfaces, social backgrounds |
| Forest 700 | `#146b55` | Primary actions, links, mark fill      |
| Coral 600  | `#c65332` | Accent, warm highlights                |
| Gold 400   | `#eec75f` | The spark; "Padi" accent on dark       |
| Sand 50    | `#fffaf2` | Page background, text on dark          |

## Usage rules

- Keep the flat corner of the bubble at the bottom-left; do not mirror it.
- Do not redraw the naira glyph or set it in a font; it is a drawn path.
- On dark surfaces use the dark lockup (gold "Padi"); on light surfaces the
  light lockup (forest "Padi").
- Give the mark clear space of at least half its width on all sides.
- The wordmark is always one word, camel-cased: SalaryPadi.
