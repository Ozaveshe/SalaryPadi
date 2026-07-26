/**
 * Registry of generated brand art shipped under `public/art/`.
 *
 * Every slot the product has is declared here with its intrinsic dimensions,
 * and every slot starts `shipped: false`. A slot renders nothing until its
 * file lands and the flag flips, so a page can carry an art slot before the
 * asset exists without ever rendering a broken image. This is a repo manifest
 * rather than a database record on purpose: the art is a deployed asset, so
 * it ships and is withdrawn with the deploy that carries the file.
 *
 * The art is abstract and decorative — it carries no information that is not
 * already in the surrounding copy — so every slot renders with an empty alt
 * and is hidden from assistive technology. Art that would need alt text does
 * not belong in this registry.
 *
 * File spec and motif briefs: docs/IMAGE_ASSET_MANIFEST.md.
 */

export type BrandArtSlot = {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly shipped: boolean;
};

const slots = {
  "hero-home": { file: "hero-home.webp", width: 1600, height: 1200 },

  about: { file: "about.webp", width: 1200, height: 800 },
  "for-employers": { file: "for-employers.webp", width: 1200, height: 800 },
  "post-a-job": { file: "post-a-job.webp", width: 1200, height: 800 },

  "tools-index": { file: "tools-index.webp", width: 640, height: 480 },
  "tool-take-home-pay": {
    file: "tool-take-home-pay.webp",
    width: 640,
    height: 480,
  },
  "tool-offer-compare": {
    file: "tool-offer-compare.webp",
    width: 640,
    height: 480,
  },
  "tool-salary-converter": {
    file: "tool-salary-converter.webp",
    width: 640,
    height: 480,
  },
  "tool-job-scam-checker": {
    file: "tool-job-scam-checker.webp",
    width: 640,
    height: 480,
  },

  "empty-jobs": { file: "empty-jobs.webp", width: 480, height: 360 },
  "empty-saved": { file: "empty-saved.webp", width: 480, height: 360 },
  "empty-applications": {
    file: "empty-applications.webp",
    width: 480,
    height: 360,
  },
  "empty-alerts": { file: "empty-alerts.webp", width: 480, height: 360 },
} as const satisfies Record<string, Omit<BrandArtSlot, "shipped">>;

export type BrandArtId = keyof typeof slots;

/**
 * Flip an id to true in the same commit that adds its file to `public/art/`.
 * Nothing else needs to change: the slot is already placed on its page.
 */
const shippedIds = new Set<BrandArtId>([]);

const ART_DIRECTORY = "/art";
const COVER_DIRECTORY = `${ART_DIRECTORY}/insights`;

export function getBrandArt(id: BrandArtId) {
  if (!shippedIds.has(id)) return null;
  const slot = slots[id];
  return {
    src: `${ART_DIRECTORY}/${slot.file}`,
    width: slot.width,
    height: slot.height,
  };
}

/**
 * Editorial article covers are keyed by article slug rather than declared one
 * by one, because articles are database-backed and the set grows over time.
 * A slug with no shipped cover falls back to the default cover, and when even
 * that has not shipped the article renders with no cover at all.
 */
const shippedCoverSlugs = new Set<string>([]);
const defaultCoverShipped = false;

const COVER_WIDTH = 1600;
const COVER_HEIGHT = 900;

export function getEditorialCover(slug: string) {
  const file = shippedCoverSlugs.has(slug)
    ? `${slug}.webp`
    : defaultCoverShipped
      ? "_default.webp"
      : null;
  if (!file) return null;
  return {
    src: `${COVER_DIRECTORY}/${file}`,
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
  };
}
