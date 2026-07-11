import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SalaryPadi",
    short_name: "SalaryPadi",
    description:
      "Source-attributed jobs, salary evidence and career decision tools for Africans.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffaf2",
    theme_color: "#102f28",
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
