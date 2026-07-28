import "server-only";

import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { repositoryIssue } from "@/lib/data/repository-result";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import type { DashboardSummary } from "./dashboard";
import { deriveNotifications } from "./notification-rules";

/**
 * Records the notifications an account's own records justify.
 *
 * Writes are idempotent on `dedupe_key`, so running this on every workspace
 * read is safe: a condition that is still true updates the existing row rather
 * than producing a second copy, and one the owner has already read is not
 * silently marked unread again.
 *
 * Failures are logged and swallowed. A notification is an aid to the page it
 * points at, so a workspace view must still render in full when recording one
 * fails — nothing here is on the path to showing the owner their own records.
 */
export async function syncNotifications(
  summary: DashboardSummary,
): Promise<void> {
  const pending = deriveNotifications(summary);
  if (pending.length === 0) return;

  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok || !clientAttempt.value) return;
  const supabase = clientAttempt.value;

  const writes = await Promise.all(
    pending.map((notification) =>
      attemptRepositoryOperation(() =>
        supabase.schema("api").rpc("record_my_notification", {
          p_kind: notification.kind,
          p_title: notification.title,
          p_body: notification.body,
          p_href: notification.href,
          p_dedupe_key: notification.dedupeKey,
        }),
      ),
    ),
  );

  const failed = writes.filter(
    (write) => !write.ok || Boolean(write.value.error),
  ).length;
  if (failed > 0) {
    repositoryIssue(
      "notifications.sync",
      "query_failed",
      "notification_sync_incomplete",
    );
  }
}
