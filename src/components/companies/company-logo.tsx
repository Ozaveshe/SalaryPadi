import Image from "next/image";

import { getAfricanCompanyCatalogEntry } from "@/lib/companies/catalog";

import styles from "./company-logo.module.css";

/**
 * Logo resolution order: verified/permitted logo from the company catalog,
 * then the deterministic monogram. A logo slot is never an empty box and
 * never a fabricated logo.
 */

const MONOGRAM_PALETTE = [
  { background: "var(--forest-100)", color: "var(--forest-800)" },
  { background: "var(--coral-100)", color: "var(--coral-700)" },
  { background: "var(--gold-100)", color: "var(--gold-700)" },
  { background: "var(--forest-800)", color: "var(--forest-50)" },
  { background: "var(--sand-200)", color: "var(--ink-700)" },
  { background: "var(--forest-700)", color: "var(--white)" },
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
  const sizeClass =
    size === 40 ? styles.size40 : size === 72 ? styles.size72 : styles.size56;
  if (!catalogEntry) {
    const palette = monogramPalette(name);
    return (
      <span
        aria-hidden="true"
        className={`${styles.fallback} ${sizeClass}`}
        style={{ background: palette.background, color: palette.color }}
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
      src={`/api/company-logos/${catalogEntry.slug}`}
      unoptimized
      width={size}
    />
  );
}
