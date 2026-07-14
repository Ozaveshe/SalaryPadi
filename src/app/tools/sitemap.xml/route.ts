import { getAppOrigin } from "@/lib/env";

export function GET() {
  return Response.redirect(new URL("/sitemaps/tools.xml", getAppOrigin()), 308);
}
