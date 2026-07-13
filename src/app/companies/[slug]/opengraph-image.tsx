import {
  getCompanyRatingMinimumSampleResult,
  getCompanyRatingResult,
  getCompanyResult,
} from "@/lib/companies/repository";
import {
  OPEN_GRAPH_IMAGE_CONTENT_TYPE,
  OPEN_GRAPH_IMAGE_SIZE,
  buildCompanyOpenGraphModel,
} from "@/lib/seo/open-graph";
import {
  fallbackOpenGraphModel,
  renderOpenGraphImage,
} from "@/lib/seo/open-graph-image";

export const alt = "SalaryPadi company profile";
export const size = OPEN_GRAPH_IMAGE_SIZE;
export const contentType = OPEN_GRAPH_IMAGE_CONTENT_TYPE;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [companyResult, ratingResult, ratingMinimumResult] = await Promise.all([
    getCompanyResult(slug),
    getCompanyRatingResult(slug),
    getCompanyRatingMinimumSampleResult(),
  ]);
  const company = companyResult.data;
  return renderOpenGraphImage(
    company
      ? buildCompanyOpenGraphModel(
          company,
          ratingResult.state === "ready" ? ratingResult.data : null,
          ratingMinimumResult.data,
          companyResult.state === "ready",
        )
      : fallbackOpenGraphModel("Company profile", "SalaryPadi companies"),
  );
}
