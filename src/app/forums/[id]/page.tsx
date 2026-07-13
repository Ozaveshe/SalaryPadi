import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CommunityActions } from "@/components/community/community-actions";
import { CommunityIdentityFields } from "@/components/community/community-fields";
import { CommunityStatus } from "@/components/community/community-status";
import { getViewer } from "@/lib/auth/dal";
import { getForumThreadPage } from "@/lib/community/repository";
import { formatDate } from "@/lib/format";
import { firstSearchParam } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Forum discussion",
  robots: { index: false, follow: true },
};

export default async function ForumThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const input = await searchParams;
  const viewer = await getViewer();
  const data = await getForumThreadPage({
    threadId: id,
    includeProfile: viewer.state === "authenticated",
  });
  if (data.available && !data.loadError && !data.thread) notFound();

  return (
    <div className="reading-shell stack-lg">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Forums", href: "/forums" },
          { label: data.thread?.topicName ?? "Discussion" },
        ]}
      />
      <CommunityStatus
        reported={firstSearchParam(input.reported)}
        status={firstSearchParam(input.status)}
      />
      {data.loadError ? (
        <div className="notice notice-warning" role="status">
          This discussion could not be loaded. Please return to the forums and
          try again.
        </div>
      ) : null}
      {data.thread ? (
        <>
          <article className="surface surface-pad stack forum-thread-detail">
            <p className="eyebrow">{data.thread.topicName}</p>
            <h1 className="page-title">{data.thread.title}</h1>
            <p className="community-meta">
              {data.thread.authorName} @{data.thread.authorHandle} ·{" "}
              {formatDate(data.thread.createdAt, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
            <p className="community-copy">{data.thread.body}</p>
            <CommunityActions
              contentId={data.thread.id}
              contentKind="forum_thread"
              isMine={data.thread.isMine}
              returnTo={`/forums/${data.thread.id}`}
              viewer={viewer}
            />
          </article>

          <section className="stack" aria-labelledby="forum-replies-heading">
            <div className="results-heading">
              <h2 className="section-title" id="forum-replies-heading">
                Replies
              </h2>
              <span className="results-count">{data.replies.length}</span>
            </div>
            {data.replies.length > 0 ? (
              <div className="forum-replies">
                {data.replies.map((reply) => (
                  <article className="forum-reply" key={reply.id}>
                    <p className="community-author">
                      {reply.authorName} <span>@{reply.authorHandle}</span>
                    </p>
                    <p className="community-meta">
                      {formatDate(reply.createdAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                    <p className="community-copy">{reply.body}</p>
                    <CommunityActions
                      contentId={reply.id}
                      contentKind="forum_reply"
                      isMine={reply.isMine}
                      returnTo={`/forums/${id}`}
                      viewer={viewer}
                    />
                  </article>
                ))}
              </div>
            ) : (
              <p className="notice">
                No replies yet. Add the first useful response.
              </p>
            )}
          </section>

          {!data.thread.locked && viewer.state === "authenticated" ? (
            <form
              className="surface surface-pad stack"
              action="/api/community/replies"
              method="post"
            >
              <h2 className="section-title">Add a reply</h2>
              <input type="hidden" name="thread_id" value={data.thread.id} />
              <CommunityIdentityFields
                idPrefix="reply"
                profile={data.profile}
                states={data.states}
              />
              <div className="field">
                <label htmlFor="reply-body">Your response</label>
                <textarea
                  className="textarea"
                  id="reply-body"
                  name="body"
                  minLength={2}
                  maxLength={3000}
                  required
                />
                <p className="field-help">
                  Keep it constructive and leave out contact details or
                  confidential information.
                </p>
              </div>
              <button className="button w-fit" type="submit">
                Publish reply
              </button>
            </form>
          ) : viewer.state !== "authenticated" ? (
            <div className="surface surface-pad split">
              <p className="m-0">Sign in to reply or report a problem.</p>
              <Link
                className="button"
                href={`/auth/sign-in?next=${encodeURIComponent(`/forums/${data.thread.id}`)}`}
              >
                Sign in to reply
              </Link>
            </div>
          ) : (
            <p className="notice notice-warning">
              This discussion is closed to new replies.
            </p>
          )}
        </>
      ) : (
        <Link className="button w-fit" href="/forums">
          Return to forums
        </Link>
      )}
    </div>
  );
}
