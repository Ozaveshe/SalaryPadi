import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SalaryPadi",
    short_name: "SalaryPadi",
    description:
      "Source-attributed jobs, salary evidence and career decision tools for Africans.",
    // A stable identity keeps an installed app from being treated as a new
    // one when start_url or scope ever change.
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    lang: "en-NG",
    dir: "ltr",
    // Both match --surface-page, and the theme colour now agrees with the
    // themeColor meta tag in the root layout. They had been a stale cream and
    // a dark forest respectively, so the installed app framed itself in one
    // colour while the browser framed the same page in another.
    background_color: "#f7f8f6",
    theme_color: "#f7f8f6",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/brand/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
