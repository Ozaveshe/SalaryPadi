import { searchSalaryAggregatesResult } from "@/lib/salaries/repository";
import {
  OPEN_GRAPH_IMAGE_CONTENT_TYPE,
  OPEN_GRAPH_IMAGE_SIZE,
  buildSalaryOpenGraphModel,
} from "@/lib/seo/open-graph";
import { renderOpenGraphImage } from "@/lib/seo/open-graph-image";

export const alt = "SalaryPadi salary aggregate";
export const size = OPEN_GRAPH_IMAGE_SIZE;
export const contentType = OPEN_GRAPH_IMAGE_CONTENT_TYPE;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ country: string; role: string }>;
}) {
  const { country, role } = await params;
  const isValidRoute =
    /^[a-z]{2}$/i.test(country) && /^[a-z0-9-]{2,100}$/i.test(role);
  const result = isValidRoute
    ? await searchSalaryAggregatesResult({
        country,
        role: role.replace(/-/g, " "),
      })
    : { state: "invalid" as const, data: [], issues: [] };
  return renderOpenGraphImage(buildSalaryOpenGraphModel(country, role, result));
}
