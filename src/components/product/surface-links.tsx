import Link from "next/link";

import { PRODUCT_SURFACES, type SurfaceId } from "@/lib/product/surfaces";

/**
 * Every destination inside one surface.
 *
 * The header carries four entries, so each surface landing page has to show
 * what it contains — otherwise consolidating the navigation would simply hide
 * the pay tools rather than group them.
 */
export function SurfaceLinks({
  surface,
  heading,
  exclude = [],
}: {
  surface: SurfaceId;
  heading: string;
  /** Paths already prominent on the page; listing them twice adds noise. */
  exclude?: string[];
}) {
  const entry = PRODUCT_SURFACES.find((item) => item.id === surface);
  if (!entry) return null;
  const links = entry.links.filter((link) => !exclude.includes(link.href));
  if (links.length === 0) return null;

  return (
    <nav className="surface-links" aria-label={heading}>
      <p className="eyebrow">{heading}</p>
      <ul className="surface-links-grid">
        {links.map((link) => (
          <li key={link.href}>
            <Link className="surface-link" href={link.href}>
              <strong>{link.label}</strong>
              {link.description ? <small>{link.description}</small> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
