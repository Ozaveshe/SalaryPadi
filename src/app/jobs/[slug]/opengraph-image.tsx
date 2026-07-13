import { getJobBySlug } from "@/lib/jobs/repository";
import {
  OPEN_GRAPH_IMAGE_CONTENT_TYPE,
  OPEN_GRAPH_IMAGE_SIZE,
  buildJobOpenGraphModel,
} from "@/lib/seo/open-graph";
import {
  fallbackOpenGraphModel,
  renderOpenGraphImage,
} from "@/lib/seo/open-graph-image";

export const alt = "SalaryPadi job opportunity";
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
  const { job } = await getJobBySlug(slug);
  return renderOpenGraphImage(
    job
      ? buildJobOpenGraphModel(job)
      : fallbackOpenGraphModel("Job opportunity", "SalaryPadi jobs"),
  );
}
