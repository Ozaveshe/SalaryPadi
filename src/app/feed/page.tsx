import type { Metadata } from "next";
import Link from "next/link";

import { CommunityActions } from "@/components/community/community-actions";
import { CommunityIdentityFields } from "@/components/community/community-fields";
import { CommunityStatus } from "@/components/community/community-status";
import { PageHeading } from "@/components/page-heading";
import { getViewer } from "@/lib/auth/dal";
import { feedCategories, getFeedPage } from "@/lib/community/repository";
import { formatDate, formatEnum } from "@/lib/format";

export const metadata: Metadata = {
  title: "Career feed",
  description:
    "A nationwide board for Nigerian career updates, questions, events and opportunities.",
  alternates: { canonical: "/feed" },
  robots: { index: false, follow: true },
};

function first(input: string | string[] | undefined) {
  return typeof input === "string" ? input : "";
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const category = first(input.category).slice(0, 40);
  const state = first(input.state).slice(0, 4).toUpperCase();
  const viewer = await getViewer();
  const data = await getFeedPage({
    category,
    state,
    includeProfile: viewer.state === "authenticated",
  });

  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Nationwide career board"
        title="What people are learning, asking and sharing"
        description="A public text board for useful career updates across Nigeria. Read without an account; sign in to post, report or remove your own contribution."
      />
      <CommunityStatus
        reported={first(input.reported)}
        status={first(input.status)}
      />
      {data.loadError ? (
        <div className="notice notice-warning" role="status">
          The feed could not be refreshed. Please try again shortly.
        </div>
      ) : null}

      {viewer.state === "authenticated" ? (
        <details
          className="surface community-composer"
          open={data.posts.length === 0}
        >
          <summary>Share with the national board</summary>
          <form
            className="stack community-form"
            action="/api/community/feed"
            method="post"
          >
            <CommunityIdentityFields
              idPrefix="feed"
              profile={data.profile}
              states={data.states}
            />
            <div className="field">
              <label htmlFor="feed-category">Post type</label>
              <select
                className="select"
                id="feed-category"
                name="category"
                defaultValue="career_update"
              >
                {feedCategories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="feed-body">Post</label>
              <textarea
                className="textarea"
                id="feed-body"
                name="body"
                minLength={10}
                maxLength={2000}
                placeholder="Share a useful update, opportunity, event or question."
                required
              />
              <p className="field-help">
                Do not include phone numbers, email addresses, private people or
                confidential information.
              </p>
            </div>
            <button className="button w-fit" type="submit">
              Publish post
            </button>
          </form>
        </details>
      ) : (
        <div className="surface surface-pad split">
          <div>
            <h2 className="m-0 text-xl font-bold">Join the conversation</h2>
            <p className="m-0 text-sm text-[var(--text-secondary)]">
              A secure email-link account is required to post or report content.
            </p>
          </div>
          <Link className="button" href="/auth/sign-in?next=%2Ffeed">
            Sign in to post
          </Link>
        </div>
      )}

      <form
        className="surface surface-pad community-filters"
        action="/feed"
        method="get"
      >
        <div className="field">
          <label htmlFor="feed-filter-category">Post type</label>
          <select
            className="select"
            id="feed-filter-category"
            name="category"
            defaultValue={category}
          >
            <option value="">All post types</option>
            {feedCategories.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="feed-filter-state">State</label>
          <select
            className="select"
            id="feed-filter-state"
            name="state"
            defaultValue={state}
          >
            <option value="">Nationwide</option>
            {data.states.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <button className="button button-secondary" type="submit">
          Filter board
        </button>
        {category || state ? (
          <Link className="text-link" href="/feed">
            Clear filters
          </Link>
        ) : null}
      </form>

      <section className="stack" aria-labelledby="feed-posts-heading">
        <div className="results-heading">
          <h2 className="section-title" id="feed-posts-heading">
            Latest posts
          </h2>
          <span className="results-count">{data.posts.length} shown</span>
        </div>
        {data.posts.length > 0 ? (
          <div className="community-list">
            {data.posts.map((post) => (
              <article className="community-post" key={post.id}>
                <div className="split">
                  <div>
                    <p className="community-author">
                      {post.authorName} <span>@{post.authorHandle}</span>
                    </p>
                    <p className="community-meta">
                      {post.stateName ?? "Nationwide"} ·{" "}
                      {formatDate(post.createdAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <span className="status status-neutral">
                    {formatEnum(post.category)}
                  </span>
                </div>
                <p className="community-copy">{post.body}</p>
                <CommunityActions
                  contentId={post.id}
                  contentKind="feed_post"
                  isMine={post.isMine}
                  returnTo="/feed"
                  viewer={viewer}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="section-title">No posts match yet</h3>
            <p>
              Try the nationwide view or be the first to share something useful.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
