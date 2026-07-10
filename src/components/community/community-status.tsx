export function CommunityStatus({
  reported,
  status,
}: {
  reported?: string;
  status?: string;
}) {
  if (reported === "true")
    return (
      <div className="notice" role="status">
        Report received. A moderator can now review this item.
      </div>
    );
  if (reported === "error")
    return (
      <div className="notice notice-danger" role="alert">
        The report could not be saved. Please try again.
      </div>
    );
  if (status === "published")
    return (
      <div className="notice" role="status">
        Published. Your account identity remains private.
      </div>
    );
  if (status === "removed")
    return (
      <div className="notice" role="status">
        Your content was removed from public view.
      </div>
    );
  if (status === "rate-limit")
    return (
      <div className="notice notice-warning" role="status">
        Posting limit reached for now. Please return later.
      </div>
    );
  if (status === "error")
    return (
      <div className="notice notice-danger" role="alert">
        That could not be saved. Check the fields, remove contact details and
        try again.
      </div>
    );
  return null;
}
