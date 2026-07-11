import "server-only";

import { z } from "zod";

import { getSupabasePublicConfig } from "@/lib/env";
import { readBoundedJson } from "@/lib/http/json";

const editorialArticleSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1).max(240),
  description: z.string().min(1).max(500),
  article_kind: z.enum(["cornerstone", "data_brief"]),
  body_markdown: z.string().max(100_000),
  author_name: z.string().min(1).max(160),
  published_at: z.string(),
  updated_at: z.string(),
  internal_link_targets: z.array(z.string()).max(30),
});

export type EditorialArticle = z.infer<typeof editorialArticleSchema>;

export const REMOTE_JOBS_GUIDE: EditorialArticle = {
  id: "57cb1fcb-e724-4ab7-8df2-a8c95f0dc03e",
  slug: "remote-jobs-open-to-nigerians",
  title: "Remote jobs open to Nigerians",
  description:
    "A source-aware, continuously refreshed route for remote roles with explicit Nigeria eligibility evidence.",
  article_kind: "cornerstone",
  body_markdown: "",
  author_name: "SalaryPadi Editorial",
  published_at: "2026-07-11T00:00:00.000Z",
  updated_at: "2026-07-11T00:00:00.000Z",
  internal_link_targets: [
    "/jobs/remote",
    "/methodology",
    "/tools/job-scam-checker",
    "/salaries",
    "/companies",
  ],
};

export async function getPublishedEditorial(): Promise<EditorialArticle[]> {
  const configuration = getSupabasePublicConfig();
  if (!configuration) return [REMOTE_JOBS_GUIDE];
  const endpoint = new URL(
    "/rest/v1/rpc/list_published_editorial",
    configuration.url,
  );
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Accept-Profile": "api",
        "Content-Profile": "api",
        apikey: configuration.publishableKey,
        Authorization: `Bearer ${configuration.publishableKey}`,
      },
      body: "{}",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return [REMOTE_JOBS_GUIDE];
    const payload = await readBoundedJson(response, 2 * 1024 * 1024);
    const parsed = z.array(editorialArticleSchema).max(200).safeParse(payload);
    if (!parsed.success) return [REMOTE_JOBS_GUIDE];
    const bySlug = new Map(
      [REMOTE_JOBS_GUIDE, ...parsed.data].map((article) => [
        article.slug,
        article,
      ]),
    );
    return [...bySlug.values()].sort(
      (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at),
    );
  } catch {
    return [REMOTE_JOBS_GUIDE];
  }
}

export async function getPublishedArticle(slug: string) {
  const articles = await getPublishedEditorial();
  return articles.find((article) => article.slug === slug) ?? null;
}
