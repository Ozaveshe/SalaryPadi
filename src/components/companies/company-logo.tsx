import Image from "next/image";

import { getAfricanCompanyCatalogEntry } from "@/lib/companies/catalog";
import { companyLogoStaticPath } from "@/lib/companies/logo";

import styles from "./company-logo.module.css";

/**
 * Logo resolution order: the self-hosted logo named by the company catalog,
 * then the deterministic monogram. A logo slot is never an empty box and
 * never a fabricated logo. The static path is used directly rather than the
 * public API route so a page of job cards costs no function invocations.
 */

const MONOGRAM_PALETTE = [
  styles.paletteForestSoft,
  styles.paletteCoralSoft,
  styles.paletteGoldSoft,
  styles.paletteForestDeep,
  styles.paletteSand,
  styles.paletteForestStrong,
] as const;

export function companyInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const [first, second] = words;
  if (!first) return "C";
  if (!second) return first.slice(0, 2).toLocaleUpperCase();
  return `${first[0]}${second[0]}`.toLocaleUpperCase();
}

function monogramPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return (
    MONOGRAM_PALETTE[hash % MONOGRAM_PALETTE.length] ?? MONOGRAM_PALETTE[0]
  );
}

export function CompanyLogo({
  slug,
  name,
  size = 56,
}: {
  slug: string;
  name: string;
  size?: 40 | 56 | 72;
}) {
  const catalogEntry = getAfricanCompanyCatalogEntry(slug);
  const logoPath = catalogEntry ? companyLogoStaticPath(catalogEntry) : null;
  const sizeClass =
    size === 40 ? styles.size40 : size === 72 ? styles.size72 : styles.size56;
  if (!logoPath) {
    return (
      <span
        aria-hidden="true"
        className={`${styles.fallback} ${sizeClass} ${monogramPalette(name)}`}
      >
        {companyInitials(name)}
      </span>
    );
  }
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={`${styles.logo} ${sizeClass}`}
      height={size}
      src={logoPath}
      unoptimized
      width={size}
    />
  );
}
