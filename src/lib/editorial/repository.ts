import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import {
  mapRepositoryResult,
  repositoryDegraded,
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
} from "@/lib/data/repository-result";
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
  updated_at: "2026-07-13T23:37:27.399Z",
  internal_link_targets: [
    "/jobs/remote",
    "/methodology",
    "/tools/job-scam-checker",
    "/salaries",
    "/companies",
  ],
};

const EDITORIAL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function mergeBuiltInGuide(articles: EditorialArticle[]) {
  const bySlug = new Map(
    [REMOTE_JOBS_GUIDE, ...articles].map((article) => [article.slug, article]),
  );
  return [...bySlug.values()].sort(
    (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at),
  );
}

async function readPublishedEditorialRowsResult(slug?: string) {
  const configuration = getSupabasePublicConfig();
  if (!configuration) {
    return repositoryFailure(
      "unconfigured",
      [],
      repositoryIssue(
        "editorial.list",
        "not_configured",
        "editorial_backend_unconfigured",
      ),
    );
  }
  const endpoint = new URL(
    "/rest/v1/rpc/list_published_editorial",
    configuration.url,
  );
  if (slug !== undefined) {
    endpoint.searchParams.set(
      "slug",
      `eq.${EDITORIAL_SLUG_PATTERN.test(slug) ? slug : "__invalid__"}`,
    );
    endpoint.searchParams.set("limit", "1");
  }
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
    if (!response.ok) {
      return repositoryDegraded(
        [],
        [
          repositoryIssue(
            "editorial.list",
            "upstream_unavailable",
            `editorial_http_${response.status}`,
          ),
        ],
      );
    }
    const payload = await readBoundedJson(
      response,
      slug === undefined ? 2 * 1024 * 1024 : 256 * 1024,
    );
    const parsed = z
      .array(editorialArticleSchema)
      .max(slug === undefined ? 200 : 1)
      .safeParse(payload);
    if (!parsed.success) {
      return repositoryDegraded(
        [],
        [
          repositoryIssue(
            "editorial.list",
            "invalid_rows",
            "editorial_invalid_rows",
            parsed.error,
          ),
        ],
      );
    }
    return repositoryReady(parsed.data);
  } catch (reason) {
    unstable_rethrow(reason);
    return repositoryDegraded(
      [],
      [
        repositoryIssue(
          "editorial.list",
          "upstream_unavailable",
          "editorial_request_failed",
          reason,
        ),
      ],
    );
  }
}

export async function getPublishedEditorialResult() {
  return mapRepositoryResult(
    await readPublishedEditorialRowsResult(),
    mergeBuiltInGuide,
  );
}

export async function getPublishedEditorial(): Promise<EditorialArticle[]> {
  return (await getPublishedEditorialResult()).data;
}

export async function getPublishedArticleResult(slug: string) {
  return mapRepositoryResult(
    await readPublishedEditorialRowsResult(slug),
    (articles) =>
      mergeBuiltInGuide(articles).find((article) => article.slug === slug) ??
      null,
  );
}

export async function getPublishedArticle(slug: string) {
  return (await getPublishedArticleResult(slug)).data;
}
