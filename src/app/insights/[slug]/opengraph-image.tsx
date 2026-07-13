import { getPublishedArticleResult } from "@/lib/editorial/repository";
import {
  OPEN_GRAPH_IMAGE_CONTENT_TYPE,
  OPEN_GRAPH_IMAGE_SIZE,
  buildInsightOpenGraphModel,
} from "@/lib/seo/open-graph";
import {
  fallbackOpenGraphModel,
  renderOpenGraphImage,
} from "@/lib/seo/open-graph-image";

export const alt = "SalaryPadi insight brief";
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
  const article = (await getPublishedArticleResult(slug)).data;
  return renderOpenGraphImage(
    article?.article_kind === "data_brief"
      ? buildInsightOpenGraphModel(article)
      : fallbackOpenGraphModel("SalaryPadi insight", "Editorial data brief"),
  );
}
