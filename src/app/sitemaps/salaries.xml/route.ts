import { createSitemapResponse } from "@/lib/seo/sitemap-response";

export const dynamic = "force-dynamic";
export const GET = () => createSitemapResponse("salaries");
