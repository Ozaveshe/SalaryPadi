import { z } from "zod";

const stateCode = z.union([z.literal(""), z.string().regex(/^[A-Z]{2,4}$/)]);

const publicProfile = {
  display_name: z.string().trim().min(2).max(60),
  state_code: stateCode,
};

export const communityProfileSchema = z.object(publicProfile);

export const feedPostSchema = z.object({
  ...communityProfileSchema.shape,
  category: z.enum([
    "career_update",
    "opportunity",
    "question",
    "event",
    "announcement",
  ]),
  body: z.string().trim().min(10).max(2000),
});

export const forumThreadSchema = z.object({
  ...communityProfileSchema.shape,
  topic_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(8).max(160),
  body: z.string().trim().min(20).max(5000),
});

export const forumReplySchema = z.object({
  ...communityProfileSchema.shape,
  thread_id: z.string().uuid(),
  body: z.string().trim().min(2).max(3000),
});

export const removeCommunityContentSchema = z.object({
  content_kind: z.enum(["feed_post", "forum_thread", "forum_reply"]),
  content_id: z.string().uuid(),
  return_to: z.string().optional(),
});

export function communityWriteStatus(
  error: { message?: string } | null,
  succeeded = !error,
) {
  if (succeeded) return "published";
  if (!error) return "error";
  return error.message?.toLowerCase().includes("rate limit")
    ? "rate-limit"
    : "error";
}
