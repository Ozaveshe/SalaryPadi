import Image from "next/image";

import {
  type BrandArtId,
  getBrandArt,
  getEditorialCover,
} from "@/lib/media/brand-art";

/**
 * Decorative brand art. Renders nothing until the asset ships, so a page can
 * carry its slot before the file exists. Always empty-alt and hidden from
 * assistive technology — the art repeats nothing the copy does not already
 * say. See src/lib/media/brand-art.ts.
 */
export function BrandArt({
  id,
  className,
}: {
  id: BrandArtId;
  className?: string;
}) {
  const art = getBrandArt(id);
  if (!art) return null;
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={className ? `brand-art ${className}` : "brand-art"}
      height={art.height}
      src={art.src}
      width={art.width}
    />
  );
}

export function EditorialCover({ slug }: { slug: string }) {
  const cover = getEditorialCover(slug);
  if (!cover) return null;
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="brand-art editorial-cover"
      height={cover.height}
      priority
      src={cover.src}
      width={cover.width}
    />
  );
}
