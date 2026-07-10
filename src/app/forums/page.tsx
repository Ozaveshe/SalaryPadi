import type { Metadata } from "next";
import Link from "next/link";

import { CommunityActions } from "@/components/community/community-actions";
import { CommunityIdentityFields } from "@/components/community/community-fields";
import { CommunityStatus } from "@/components/community/community-status";
import { PageHeading } from "@/components/page-heading";
import { getViewer } from "@/lib/auth/dal";
import { getForumsPage } from "@/lib/community/repository";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Career forums",
  description:
    "Discuss career growth, applications, pay, remote work and workplace life with the SalaryPadi community.",
  alternates: { canonical: "/forums" },
  robots: { index: false, follow: true },
};

function first(input: string | string[] | undefined) {
  return typeof input === "string" ? input : "";
}

export default async function ForumsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const topic = first(input.topic).slice(0, 80);
  const viewer = await getViewer();
  const data = await getForumsPage({
    topic,
    includeProfile: viewer.state === "authenticated",
  });
  const selectedTopic = data.topics.find((item) => item.slug === topic);

  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Career community"
        title="Discuss the parts of work that need context"
        description="Ask practical questions, compare approaches and share useful experience. The forums are public to read and require a secure account to write."
      />
      <CommunityStatus
        reported={first(input.reported)}
        status={first(input.status)}
      />
      {data.loadError ? (
        <div className="notice notice-warning" role="status">
          The forums could not be refreshed. Please try again shortly.
        </div>
      ) : null}

      <section className="stack" aria-labelledby="forum-topics-heading">
        <div className="results-heading">
          <h2 className="section-title" id="forum-topics-heading">
            Topics
          </h2>
          {topic ? (
            <Link className="text-link" href="/forums">
              Show all discussions
            </Link>
          ) : null}
        </div>
        <div className="forum-topic-grid">
          {data.topics.map((item) => (
            <Link
              aria-current={item.slug === topic ? "page" : undefined}
              className={[
                "forum-topic-card",
                item.slug === topic ? "forum-topic-card-active" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              href={`/forums?topic=${encodeURIComponent(item.slug)}`}
              key={item.id}
            >
              <span className="forum-topic-name">{item.name}</span>
              <span>{item.description}</span>
              <span className="source-note">
                {item.threadCount}{" "}
                {item.threadCount === 1 ? "discussion" : "discussions"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {viewer.state === "authenticated" ? (
        <details
          className="surface community-composer"
          open={data.threads.length === 0}
        >
          <summary>Start a discussion</summary>
          <form
            className="stack community-form"
            action="/api/community/threads"
            method="post"
          >
            <CommunityIdentityFields
              idPrefix="thread"
              profile={data.profile}
              states={data.states}
            />
            <div className="field">
              <label htmlFor="thread-topic">Topic</label>
              <select
                className="select"
                id="thread-topic"
                name="topic_slug"
                defaultValue={selectedTopic?.slug ?? data.topics[0]?.slug}
                required
              >
                {data.topics.map((item) => (
                  <option key={item.id} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="thread-title">Discussion title</label>
              <input
                className="input"
                id="thread-title"
                name="title"
                minLength={8}
                maxLength={160}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="thread-body">Context and question</label>
              <textarea
                className="textarea"
                id="thread-body"
                name="body"
                minLength={20}
                maxLength={5000}
                required
              />
              <p className="field-help">
                Do not share phone numbers, email addresses, private people or
                confidential information.
              </p>
            </div>
            <button className="button w-fit" type="submit">
              Publish discussion
            </button>
          </form>
        </details>
      ) : (
        <div className="surface surface-pad split">
          <div>
            <h2 className="m-0 text-xl font-bold">
              Have something to discuss?
            </h2>
            <p className="m-0 text-sm text-[var(--text-secondary)]">
              Sign in to start a thread, reply or report a problem.
            </p>
          </div>
          <Link className="button" href="/auth/sign-in?next=%2Fforums">
            Sign in to join
          </Link>
        </div>
      )}

      <section className="stack" aria-labelledby="forum-threads-heading">
        <div className="results-heading">
          <h2 className="section-title" id="forum-threads-heading">
            {selectedTopic ? selectedTopic.name : "Latest discussions"}
          </h2>
          <span className="results-count">{data.threads.length} shown</span>
        </div>
        {data.threads.length > 0 ? (
          <div className="community-list">
            {data.threads.map((thread) => (
              <article className="forum-thread-row" key={thread.id}>
                <div className="stack">
                  <p className="eyebrow">{thread.topicName}</p>
                  <div>
                    <h3 className="forum-thread-title">
                      <Link href={`/forums/${thread.id}`}>{thread.title}</Link>
                    </h3>
                    <p className="community-meta">
                      {thread.authorName} @{thread.authorHandle} ·{" "}
                      {formatDate(thread.latestActivityAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <p className="forum-excerpt">{thread.excerpt}</p>
                  <div className="split">
                    <Link className="text-link" href={`/forums/${thread.id}`}>
                      {thread.replyCount}{" "}
                      {thread.replyCount === 1 ? "reply" : "replies"} · Read
                      discussion
                    </Link>
                    <CommunityActions
                      contentId={thread.id}
                      contentKind="forum_thread"
                      isMine={thread.isMine}
                      returnTo={
                        topic
                          ? `/forums?topic=${encodeURIComponent(topic)}`
                          : "/forums"
                      }
                      viewer={viewer}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="section-title">No discussions here yet</h3>
            <p>
              Start with a clear question and enough context for someone to give
              a useful answer.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
