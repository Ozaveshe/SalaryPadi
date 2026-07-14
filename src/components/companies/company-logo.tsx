import Image from "next/image";

import { getAfricanCompanyCatalogEntry } from "@/lib/companies/catalog";

import styles from "./company-logo.module.css";

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
    return (
      <span aria-hidden="true" className={`${styles.fallback} ${sizeClass}`}>
        {name.trim().charAt(0).toLocaleUpperCase() || "C"}
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
