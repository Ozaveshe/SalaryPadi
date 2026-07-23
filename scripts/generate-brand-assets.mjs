/**
 * SalaryPadi brand-asset generator.
 *
 * Source of truth for every generated brand file:
 *   - public/brand/*.svg          vector logo set
 *   - public/brand/*.png          manifest icons and social banners
 *   - src/app/icon.svg            favicon (SVG, served by the App Router)
 *   - src/app/favicon.ico         legacy favicon (16/32/48 PNG-in-ICO)
 *   - src/app/apple-icon.png      Apple touch icon
 *   - opengraph-image.png and twitter-image.png in app route folders
 *
 * Regenerate after any palette or logo change:
 *   node scripts/generate-brand-assets.mjs
 *
 * Raster text uses locally installed system fonts, so run it on a machine
 * with Segoe UI or Arial available (any Windows/macOS host).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import sharp from "sharp";

const root = process.cwd();
const brandDir = path.join(root, "public", "brand");
const appDir = path.join(root, "src", "app");

/* Palette — mirrors the primitive tokens in src/app/globals.css. */
const forest950 = "#102f28";
const forest900 = "#173b32";
const forest700 = "#146b55";
const forest100 = "#dcece5";
const coral600 = "#c65332";
const gold100 = "#f8e8aa";
const gold400 = "#eec75f";
const sand50 = "#fffaf2";

const fontStack = `'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif`;

function cleanSvg(svg) {
  return `${svg.replace(/[ \t]+$/gm, "").trim()}\n`;
}

/**
 * The mark: a speech bubble (a "padi" — friend — talking) carrying the naira
 * sign. Drawn on a 48x48 grid. The bubble is a circle whose bottom-left
 * corner squares off into a small radius, matching the .brand-dot CSS shape.
 */
function bubblePath(size = 48, corner = 5) {
  const r = size / 2;
  return [
    `M${r} 0`,
    `A${r} ${r} 0 0 1 ${size} ${r}`,
    `A${r} ${r} 0 0 1 ${r} ${size}`,
    `H${corner}`,
    `A${corner} ${corner} 0 0 1 0 ${size - corner}`,
    `V${r}`,
    `A${r} ${r} 0 0 1 ${r} 0`,
    "Z",
  ].join(" ");
}

/**
 * Naira glyph as strokes, centred on the 48-grid. The strike lines overhang
 * the N by only 3.5 units a side — wide enough to read as ₦, contained
 * enough to stay clean at favicon sizes.
 */
function nairaGlyph({ stroke = "#ffffff", width = 3.6 } = {}) {
  return `
    <g stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M18 33.5 V14.5 L30 33.5 V14.5" />
      <path d="M14.5 20.75 H33.5" />
      <path d="M14.5 27.25 H33.5" />
    </g>`;
}

/** The good-news spark: a soft four-point star at the bubble's top right. */
function sparkGlyph({ fill = gold400 } = {}) {
  return `<path d="M38.5 4.6 C39.35 7.6 40.4 8.65 43.4 9.5 C40.4 10.35 39.35 11.4 38.5 14.4 C37.65 11.4 36.6 10.35 33.6 9.5 C36.6 8.65 37.65 7.6 38.5 4.6 Z" fill="${fill}"/>`;
}

/** The core mark, parameterised so icons can drop detail at tiny sizes. */
function markSvg({
  size = 48,
  spark = true,
  gradientId = "sp-fill",
  title = "SalaryPadi",
} = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${forest700}"/>
      <stop offset="1" stop-color="${forest950}"/>
    </linearGradient>
  </defs>
  <path d="${bubblePath()}" fill="url(#${gradientId})"/>
  ${nairaGlyph()}
  ${spark ? `${sparkGlyph()}` : ""}
</svg>`;
}

/** Horizontal lockup: mark + wordmark. */
function logoSvg({ dark = false } = {}) {
  const text = dark ? sand50 : forest950;
  const padi = dark ? gold400 : forest700;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 236 48" width="236" height="48" role="img" aria-label="SalaryPadi">
  <defs>
    <linearGradient id="sp-lockup" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${forest700}"/>
      <stop offset="1" stop-color="${forest950}"/>
    </linearGradient>
  </defs>
  <path d="${bubblePath()}" fill="url(#sp-lockup)"/>
  ${nairaGlyph()}
  ${sparkGlyph()}
  <text x="58" y="33.5" font-family="${fontStack}" font-size="26" font-weight="700" letter-spacing="-0.5" fill="${text}">Salary<tspan fill="${padi}">Padi</tspan></text>
</svg>`;
}

/** Simplified favicon: fewer, heavier strokes so 16px stays legible. */
function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="SalaryPadi">
  <defs>
    <linearGradient id="sp-ico" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${forest700}"/>
      <stop offset="1" stop-color="${forest950}"/>
    </linearGradient>
  </defs>
  <path d="${bubblePath()}" fill="url(#sp-ico)"/>
  ${nairaGlyph({ width: 4.4 })}
  ${sparkGlyph()}
</svg>`;
}

/** App icon with breathing room and opaque background (Apple, manifest). */
function appIconSvg({ size, maskable = false }) {
  /* Maskable icons need the mark inside the 80% safe zone. */
  const scale = maskable ? 0.52 : 0.62;
  const inner = 48 * scale * (size / 48);
  const offset = (size - inner) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="sp-app" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${forest900}"/>
      <stop offset="1" stop-color="${forest950}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#sp-app)"/>
  <g transform="translate(${offset} ${offset}) scale(${inner / 48})">
    <path d="${bubblePath()}" fill="${forest700}"/>
    ${nairaGlyph({ width: 3.8 })}
    ${sparkGlyph()}
  </g>
</svg>`;
}

/** Decorative rising-bars motif used on social imagery. */
function barsMotif(x, baseY, { scale = 1 } = {}) {
  const bars = [
    { h: 46, fill: forest700 },
    { h: 78, fill: forest700 },
    { h: 116, fill: coral600 },
    { h: 158, fill: gold400 },
  ];
  const w = 34 * scale;
  const gap = 22 * scale;
  return bars
    .map((bar, i) => {
      const h = bar.h * scale;
      const bx = x + i * (w + gap);
      return `<rect x="${bx}" y="${baseY - h}" width="${w}" height="${h}" rx="${8 * scale}" fill="${bar.fill}" opacity="0.92"/>`;
    })
    .join("\n  ");
}

/** Shared social-image chrome: dark forest field, glow, mark, footer URL. */
function socialSvg({
  width,
  height,
  eyebrow,
  title,
  subtitle,
  titleSize = 72,
  compact = false,
}) {
  const pad = compact ? 56 : 80;
  const markScale = compact ? 1.6 : 2;
  const markSize = 48 * markScale;
  const titleLines = Array.isArray(title) ? title : [title];
  const lineHeight = titleSize * 1.12;
  const titleTop = compact ? height * 0.42 : height * 0.44;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${forest900}"/>
      <stop offset="1" stop-color="${forest950}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="0.9">
      <stop offset="0" stop-color="${forest700}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${forest700}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sp-soc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${forest700}"/>
      <stop offset="1" stop-color="${forest950}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  ${barsMotif(width - (compact ? 300 : 360), height - (compact ? 42 : 64), { scale: compact ? 0.85 : 1.15 })}
  <g transform="translate(${pad} ${pad * 0.75}) scale(${markScale})">
    <path d="${bubblePath()}" fill="url(#sp-soc)" stroke="${forest100}" stroke-opacity="0.25" stroke-width="0.75"/>
    ${nairaGlyph()}
    ${sparkGlyph()}
  </g>
  <text x="${pad + markSize + 22}" y="${pad * 0.75 + markSize * 0.68}" font-family="${fontStack}" font-size="${markSize * 0.44}" font-weight="700" letter-spacing="-0.5" fill="${sand50}">Salary<tspan fill="${gold400}">Padi</tspan></text>
  <text x="${pad}" y="${titleTop}" font-family="${fontStack}" font-size="${titleSize * 0.36}" font-weight="700" letter-spacing="4" fill="${gold400}">${eyebrow.toUpperCase()}</text>
  ${titleLines
    .map(
      (line, i) =>
        `<text x="${pad}" y="${titleTop + (i + 1) * lineHeight}" font-family="${fontStack}" font-size="${titleSize}" font-weight="800" letter-spacing="-1.5" fill="${sand50}">${line}</text>`,
    )
    .join("\n  ")}
  ${subtitle ? `<text x="${pad}" y="${titleTop + titleLines.length * lineHeight + titleSize * 0.85}" font-family="${fontStack}" font-size="${titleSize * 0.42}" font-weight="500" fill="${forest100}">${subtitle}</text>` : ""}
  <text x="${pad}" y="${height - pad * 0.55}" font-family="${fontStack}" font-size="${compact ? 24 : 28}" font-weight="700" letter-spacing="1" fill="${gold100}">salarypadi.com</text>
</svg>`;
}

/** Wide, shallow LinkedIn cover with a layout tailored to its 5.9:1 ratio. */
function linkedinBannerSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1128" height="191" viewBox="0 0 1128 191">
  <defs>
    <linearGradient id="li-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${forest900}"/>
      <stop offset="1" stop-color="${forest950}"/>
    </linearGradient>
    <linearGradient id="li-mark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${forest700}"/>
      <stop offset="1" stop-color="${forest950}"/>
    </linearGradient>
    <radialGradient id="li-glow" cx="0.9" cy="0.15" r="0.75">
      <stop offset="0" stop-color="${forest700}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${forest700}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1128" height="191" fill="url(#li-bg)"/>
  <rect width="1128" height="191" fill="url(#li-glow)"/>
  <rect x="48" y="31" width="4" height="129" rx="2" fill="${gold400}"/>
  <g transform="translate(76 31)">
    <path d="${bubblePath()}" fill="url(#li-mark)" stroke="${forest100}" stroke-opacity="0.25" stroke-width="0.75"/>
    ${nairaGlyph()}
    ${sparkGlyph()}
  </g>
  <text x="138" y="64" font-family="${fontStack}" font-size="28" font-weight="700" letter-spacing="-0.5" fill="${sand50}">Salary<tspan fill="${gold400}">Padi</tspan></text>
  <text x="76" y="129" font-family="${fontStack}" font-size="32" font-weight="800" letter-spacing="-0.6" fill="${sand50}">Jobs and salary truth for Africans.</text>
  <text x="76" y="157" font-family="${fontStack}" font-size="17" font-weight="600" fill="${forest100}">Source-checked jobs  •  Salary evidence  •  Decision tools</text>
  <text x="931" y="157" font-family="${fontStack}" font-size="18" font-weight="700" letter-spacing="0.5" fill="${gold100}">salarypadi.com</text>
</svg>`;
}

/** Build a legacy .ico container from PNG buffers (PNG-in-ICO). */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dirSize = 16 * entries.length;
  let offset = 6 + dirSize;
  const dirs = [];
  for (const { size, png } of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(size >= 256 ? 0 : size, 0);
    dir.writeUInt8(size >= 256 ? 0 : size, 1);
    dir.writeUInt8(0, 2);
    dir.writeUInt8(0, 3);
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(offset, 12);
    dirs.push(dir);
    offset += png.length;
  }
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.png)]);
}

async function rasterize(svg, width, height) {
  return sharp(Buffer.from(svg), { density: 300 })
    .resize(width, height)
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(brandDir, { recursive: true });

  /* Vector logo set. */
  await writeFile(
    path.join(brandDir, "salarypadi-mark.svg"),
    cleanSvg(markSvg()),
  );
  await writeFile(
    path.join(brandDir, "salarypadi-logo.svg"),
    cleanSvg(logoSvg()),
  );
  await writeFile(
    path.join(brandDir, "salarypadi-logo-dark.svg"),
    cleanSvg(logoSvg({ dark: true })),
  );

  /* Favicons. */
  await writeFile(path.join(appDir, "icon.svg"), cleanSvg(iconSvg()));
  const icoSizes = [16, 32, 48];
  const icoEntries = [];
  for (const size of icoSizes) {
    icoEntries.push({ size, png: await rasterize(iconSvg(), size, size) });
  }
  await writeFile(path.join(appDir, "favicon.ico"), buildIco(icoEntries));

  /* App icons. */
  await writeFile(
    path.join(appDir, "apple-icon.png"),
    await rasterize(appIconSvg({ size: 180 }), 180, 180),
  );
  await writeFile(
    path.join(brandDir, "icon-192.png"),
    await rasterize(appIconSvg({ size: 192 }), 192, 192),
  );
  await writeFile(
    path.join(brandDir, "icon-512.png"),
    await rasterize(appIconSvg({ size: 512 }), 512, 512),
  );
  await writeFile(
    path.join(brandDir, "icon-512-maskable.png"),
    await rasterize(appIconSvg({ size: 512, maskable: true }), 512, 512),
  );

  /* Open Graph and Twitter images (root + key sections). */
  const ogTargets = [
    {
      dir: appDir,
      eyebrow: "Jobs and salary truth for Africans",
      title: ["Know the job, the pay,", "and the risk — first."],
      subtitle: "Source-checked jobs, salary evidence and decision tools.",
    },
    {
      dir: path.join(appDir, "jobs"),
      eyebrow: "Source-attributed jobs",
      title: ["Jobs you can actually", "apply for from Nigeria."],
      subtitle: "Explicit eligibility evidence, freshness and direct links.",
    },
    {
      dir: path.join(appDir, "salaries"),
      eyebrow: "Salary intelligence",
      title: ["Real pay evidence,", "never guesswork."],
      subtitle: "Moderated, privacy-thresholded salary aggregates.",
    },
    {
      dir: path.join(appDir, "tools"),
      eyebrow: "Decision tools",
      title: ["Turn any offer into", "a practical answer."],
      subtitle: "Take-home pay, offer comparison and scam screening.",
    },
    {
      dir: path.join(appDir, "companies"),
      eyebrow: "Company intelligence",
      title: ["Workplace evidence", "before you commit."],
      subtitle: "Reviews, interviews and salaries with moderation.",
    },
  ];
  for (const target of ogTargets) {
    const og = await rasterize(
      socialSvg({ width: 1200, height: 630, ...target }),
      1200,
      630,
    );
    await writeFile(path.join(target.dir, "opengraph-image.png"), og);
    await writeFile(path.join(target.dir, "twitter-image.png"), og);
  }

  /* Marketing banners. */
  await writeFile(
    path.join(brandDir, "banner-x.png"),
    await rasterize(
      socialSvg({
        width: 1500,
        height: 500,
        eyebrow: "Jobs and salary truth for Africans",
        title: ["Know the job, the pay, and the risk — first."],
        subtitle: "Source-checked jobs • Salary evidence • Decision tools",
        titleSize: 56,
        compact: true,
      }),
      1500,
      500,
    ),
  );
  await writeFile(
    path.join(brandDir, "banner-linkedin.png"),
    await rasterize(linkedinBannerSvg(), 1128, 191),
  );
  await writeFile(
    path.join(brandDir, "readme-banner.svg"),
    cleanSvg(
      socialSvg({
        width: 1200,
        height: 300,
        eyebrow: "Jobs and salary truth for Africans",
        title: ["SalaryPadi"],
        subtitle: "Source-checked jobs • Salary evidence • Decision tools",
        titleSize: 64,
        compact: true,
      }),
    ),
  );

  console.log("Brand assets generated.");
}

await main();
