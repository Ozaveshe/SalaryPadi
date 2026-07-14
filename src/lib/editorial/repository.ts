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
import { discardResponseBody } from "@/lib/http/body";
import { readBoundedJson } from "@/lib/http/json";
import { safeRelativePath } from "@/lib/security/urls";

const editorialTimestamp = z.string().datetime({ offset: true });
const internalEditorialLinkSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => safeRelativePath(value, "") === value, {
    message: "Editorial links must be canonical SalaryPadi-relative paths.",
  });

const editorialArticleSchema = z
  .object({
    id: z.uuid(),
    slug: z
      .string()
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().min(1).max(500),
    article_kind: z.enum(["cornerstone", "data_brief"]),
    body_markdown: z.string().max(100_000),
    author_name: z.string().trim().min(2).max(160),
    published_at: editorialTimestamp,
    updated_at: editorialTimestamp,
    internal_link_targets: z
      .array(internalEditorialLinkSchema)
      .max(30)
      .refine((targets) => new Set(targets).size === targets.length, {
        message: "Editorial links must be unique.",
      }),
  })
  .strict()
  .superRefine((article, context) => {
    if (Date.parse(article.updated_at) < Date.parse(article.published_at)) {
      context.addIssue({
        code: "custom",
        path: ["updated_at"],
        message: "Editorial updates cannot predate publication.",
      });
    }
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
      await discardResponseBody(response);
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
      .superRefine((articles, context) => {
        const ids = new Set<string>();
        const slugs = new Set<string>();
        for (const [index, article] of articles.entries()) {
          for (const [field, values] of [
            ["id", ids],
            ["slug", slugs],
          ] as const) {
            const value = article[field];
            if (values.has(value)) {
              context.addIssue({
                code: "custom",
                path: [index, field],
                message: `Editorial ${field}s must be unique.`,
              });
            }
            values.add(value);
          }
        }
      })
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
