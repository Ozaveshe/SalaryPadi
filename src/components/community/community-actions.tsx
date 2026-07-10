import type { Viewer } from "@/lib/auth/dal";

export function CommunityActions({
  contentId,
  contentKind,
  isMine,
  returnTo,
  viewer,
}: {
  contentId: string;
  contentKind: "feed_post" | "forum_thread" | "forum_reply";
  isMine: boolean;
  returnTo: string;
  viewer: Viewer;
}) {
  if (viewer.state !== "authenticated") return null;

  return (
    <div className="community-actions print-hide">
      {isMine ? (
        <form action="/api/community/remove" method="post">
          <input type="hidden" name="content_kind" value={contentKind} />
          <input type="hidden" name="content_id" value={contentId} />
          <input type="hidden" name="return_to" value={returnTo} />
          <button className="button button-quiet" type="submit">
            Remove
          </button>
        </form>
      ) : null}
      <details className="report-control">
        <summary>Report</summary>
        <form className="report-form" action="/api/reports" method="post">
          <input type="hidden" name="target_type" value={contentKind} />
          <input type="hidden" name="target_id" value={contentId} />
          <input type="hidden" name="return_to" value={returnTo} />
          <label
            className="visually-hidden"
            htmlFor={`report-${contentKind}-${contentId}`}
          >
            Report reason
          </label>
          <select
            className="select"
            id={`report-${contentKind}-${contentId}`}
            name="category"
            defaultValue="spam"
          >
            <option value="spam">Spam or promotion</option>
            <option value="harassment">Harassment</option>
            <option value="misinformation">Misleading information</option>
            <option value="privacy">Personal information</option>
            <option value="other">Other</option>
          </select>
          <button className="button button-secondary" type="submit">
            Send report
          </button>
        </form>
      </details>
    </div>
  );
}
