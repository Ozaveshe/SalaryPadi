import "server-only";

import { cache } from "react";
import { z } from "zod";

import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The notification centre's read side.
 *
 * A notification is a pointer to something the owner can already see in their
 * own records. It never carries a claim its target page does not carry, and it
 * never links off-site — `href` is constrained to a site-relative path in the
 * database as well as here.
 */

export const NOTIFICATION_KINDS = [
  "action_due",
  "application_stalled",
  "new_match",
  "saved_job_aging",
  "alert_digest",
  "retention_warning",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** What each kind is, for the email preference controls. */
export const NOTIFICATION_KIND_LABELS: Record<
  NotificationKind,
  { label: string; description: string }
> = {
  action_due: {
    label: "Dates you set",
    description:
      "A next-action date you put on one of your own application records is due or has passed.",
  },
  application_stalled: {
    label: "Applications that have not moved",
    description:
      "A live application has had no status change for over two weeks.",
  },
  new_match: {
    label: "New roles matching your profile",
    description:
      "Newly published roles that match the profile you attested to, or the CV you uploaded.",
  },
  saved_job_aging: {
    label: "Saved roles going stale",
    description:
      "A role you saved has aged past the point where its source posting is still reliably open.",
  },
  alert_digest: {
    label: "Job alert digests",
    description:
      "The daily or weekly digest for the alerts you created. Sources that do not permit email distribution are never included.",
  },
  retention_warning: {
    label: "Workspace retention warnings",
    description:
      "A warning before your chosen retention setting deletes eligible saved jobs, application history and job alerts.",
  },
};

const MAX_NOTIFICATIONS = 100;

const notificationSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(NOTIFICATION_KINDS),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(1_000),
    // Mirrors the database constraint: a notification is never a way off-site.
    href: z.string().regex(/^\/[A-Za-z0-9/_.~%-]*(\?[A-Za-z0-9=&_.~%-]*)?$/),
    created_at: z.string().datetime({ offset: true }),
    read_at: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export type NotificationRow = z.infer<typeof notificationSchema>;

export interface NotificationFeed {
  items: NotificationRow[];
  unreadCount: number;
}

export async function getNotifications(
  limit = 30,
): Promise<RepositoryResult<NotificationFeed>> {
  const empty: NotificationFeed = { items: [], unreadCount: 0 };
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      empty,
      repositoryIssue(
        "get_my_notifications",
        "query_failed",
        "career_rpc_error",
        clientAttempt.error,
      ),
    );
  }
  const supabase = clientAttempt.value;
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      empty,
      repositoryIssue(
        "get_my_notifications",
        "not_configured",
        "career_backend_unconfigured",
      ),
    );
  }

  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase
      .schema("api")
      .rpc("get_my_notifications", { p_limit: limit })
      .limit(MAX_NOTIFICATIONS + 1),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      empty,
      repositoryIssue(
        "get_my_notifications",
        "query_failed",
        "career_rpc_error",
        queryAttempt.error,
      ),
    );
  }
  const { data, error } = queryAttempt.value;
  if (error || !Array.isArray(data)) {
    return repositoryFailure(
      "unavailable",
      empty,
      repositoryIssue(
        "get_my_notifications",
        error ? "query_failed" : "invalid_container",
        error ? "career_rpc_error" : "career_invalid_container",
        error,
      ),
    );
  }

  const parsed = z
    .array(notificationSchema)
    .max(MAX_NOTIFICATIONS)
    .safeParse(data);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      empty,
      repositoryIssue(
        "get_my_notifications",
        "invalid_rows",
        "career_invalid_rows",
        parsed.error,
      ),
    );
  }

  return repositoryReady({
    items: parsed.data,
    unreadCount: parsed.data.filter((row) => row.read_at === null).length,
  });
}

/**
 * Unread notifications for the sidebar badge, or null when the read did not
 * succeed — the badge then shows nothing rather than a zero it cannot stand
 * behind. Cached per request so several workspace components can ask without
 * the page paying for the query more than once.
 */
export const readUnreadNotificationCount = cache(
  async (): Promise<number | null> => {
    const result = await getNotifications();
    return result.state === "ready" ? result.data.unreadCount : null;
  },
);

/**
 * The kinds the owner has switched email off for. A kind that is absent is on:
 * a new kind is never silently unreachable, and an opt-out is always a stored
 * decision rather than an inferred one.
 */
export async function getNotificationEmailOptOuts(): Promise<
  RepositoryResult<NotificationKind[]>
> {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok || !clientAttempt.value) {
    return repositoryFailure(
      clientAttempt.ok ? "unconfigured" : "unavailable",
      [],
      repositoryIssue(
        "get_my_notification_email_optouts",
        clientAttempt.ok ? "not_configured" : "query_failed",
        clientAttempt.ok ? "career_backend_unconfigured" : "career_rpc_error",
        clientAttempt.ok ? undefined : clientAttempt.error,
      ),
    );
  }

  const queryAttempt = await attemptRepositoryOperation(() =>
    clientAttempt.value!.schema("api").rpc("get_my_notification_email_optouts"),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "get_my_notification_email_optouts",
        "query_failed",
        "career_rpc_error",
        queryAttempt.error,
      ),
    );
  }
  const { data, error } = queryAttempt.value;
  if (error || !Array.isArray(data)) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "get_my_notification_email_optouts",
        error ? "query_failed" : "invalid_container",
        error ? "career_rpc_error" : "career_invalid_container",
        error,
      ),
    );
  }

  const parsed = z
    .array(z.object({ kind: z.enum(NOTIFICATION_KINDS) }).strict())
    .max(NOTIFICATION_KINDS.length)
    .safeParse(data);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        "get_my_notification_email_optouts",
        "invalid_rows",
        "career_invalid_rows",
        parsed.error,
      ),
    );
  }
  return repositoryReady(parsed.data.map((row) => row.kind));
}
