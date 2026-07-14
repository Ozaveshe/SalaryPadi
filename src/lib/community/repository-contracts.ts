import { z } from "zod";

const timestampSchema = z.iso.datetime({ offset: true });
const uuidSchema = z.uuid();
const stateCodeSchema = z.string().regex(/^[A-Z]{2,4}$/);
const memberHandleSchema = z.string().regex(/^sp-[a-f0-9]{8}$/);
const topicSlugSchema = z
  .string()
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

function requireUniqueIds<T extends { id: string }>(
  rows: T[],
  context: z.RefinementCtx,
) {
  const ids = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (ids.has(row.id)) {
      context.addIssue({
        code: "custom",
        path: [index, "id"],
        message: "Community row IDs must be unique.",
      });
    }
    ids.add(row.id);
  }
}

export const feedCategories = [
  { value: "career_update", label: "Career update" },
  { value: "opportunity", label: "Opportunity" },
  { value: "question", label: "Question" },
  { value: "event", label: "Event" },
  { value: "announcement", label: "Announcement" },
] as const;

export type FeedCategory = (typeof feedCategories)[number]["value"];

export interface NigeriaState {
  code: string;
  name: string;
}

export interface CommunityProfile {
  displayName: string;
  handle: string;
  stateCode: string | null;
}

export interface CommunityAccountData {
  profile: CommunityProfile | null;
  states: NigeriaState[];
}

export interface FeedPost {
  id: string;
  authorName: string;
  authorHandle: string;
  category: string;
  stateCode: string | null;
  stateName: string | null;
  body: string;
  createdAt: string;
  isMine: boolean;
}

export interface ForumTopic {
  id: string;
  slug: string;
  name: string;
  description: string;
  threadCount: number;
  latestActivityAt: string | null;
}

export interface ForumThreadSummary {
  id: string;
  topicSlug: string;
  topicName: string;
  authorName: string;
  authorHandle: string;
  title: string;
  excerpt: string;
  replyCount: number;
  createdAt: string;
  latestActivityAt: string;
  isMine: boolean;
}

export interface ForumThread extends Omit<
  ForumThreadSummary,
  "excerpt" | "replyCount" | "latestActivityAt"
> {
  body: string;
  locked: boolean;
}

export interface ForumReply {
  id: string;
  authorName: string;
  authorHandle: string;
  body: string;
  createdAt: string;
  isMine: boolean;
}

export interface CommunityFeedPageData {
  states: NigeriaState[];
  posts: FeedPost[];
  profile: CommunityProfile | null;
}

export interface CommunityForumsPageData {
  states: NigeriaState[];
  topics: ForumTopic[];
  threads: ForumThreadSummary[];
  profile: CommunityProfile | null;
}

export interface CommunityThreadPageData {
  states: NigeriaState[];
  thread: ForumThread | null;
  replies: ForumReply[];
  profile: CommunityProfile | null;
}

export function mapProfile(row: {
  display_name: string;
  handle: string;
  state_code: string | null;
}): CommunityProfile {
  return {
    displayName: row.display_name,
    handle: row.handle,
    stateCode: row.state_code || null,
  };
}

const stateRowSchema = z
  .object({
    code: stateCodeSchema,
    name: z.string().min(3).max(40),
  })
  .strict();

const profileRowSchema = z
  .object({
    display_name: z.string().min(2).max(60),
    handle: memberHandleSchema,
    state_code: stateCodeSchema.nullable(),
  })
  .strict();

export const accountStateRowsSchema = z
  .array(stateRowSchema)
  .max(50)
  .superRefine((rows, context) => {
    const codes = new Set<string>();
    for (const [index, row] of rows.entries()) {
      if (codes.has(row.code)) {
        context.addIssue({
          code: "custom",
          path: [index, "code"],
          message: "State codes must be unique.",
        });
      }
      codes.add(row.code);
    }
  });
export const accountProfileRowsSchema = z.array(profileRowSchema).max(1);

export const feedPostRowsSchema = z
  .array(
    z
      .object({
        id: uuidSchema,
        author_name: z.string().min(2).max(60),
        author_handle: memberHandleSchema,
        category: z.enum(feedCategories.map(({ value }) => value)),
        state_code: stateCodeSchema.nullable(),
        state_name: z.string().min(3).max(40).nullable(),
        body: z.string().trim().min(10).max(2_000),
        created_at: timestampSchema,
        is_mine: z.boolean(),
      })
      .strict()
      .transform((row): FeedPost => ({
        id: row.id,
        authorName: row.author_name,
        authorHandle: row.author_handle,
        category: row.category,
        stateCode: row.state_code,
        stateName: row.state_name,
        body: row.body,
        createdAt: row.created_at,
        isMine: row.is_mine,
      })),
  )
  .max(40)
  .superRefine(requireUniqueIds);

export const forumTopicRowsSchema = z
  .array(
    z
      .object({
        id: uuidSchema,
        slug: topicSlugSchema,
        name: z.string().min(3).max(80),
        description: z.string().min(10).max(240),
        thread_count: z.coerce
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER),
        latest_activity_at: timestampSchema.nullable(),
      })
      .strict()
      .transform((row): ForumTopic => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        threadCount: row.thread_count,
        latestActivityAt: row.latest_activity_at,
      })),
  )
  .max(100)
  .superRefine(requireUniqueIds);

export const forumThreadSummaryRowsSchema = z
  .array(
    z
      .object({
        id: uuidSchema,
        topic_slug: topicSlugSchema,
        topic_name: z.string().min(3).max(80),
        author_name: z.string().min(2).max(60),
        author_handle: memberHandleSchema,
        title: z.string().trim().min(8).max(160),
        excerpt: z.string().trim().min(20).max(320),
        reply_count: z.coerce
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER),
        created_at: timestampSchema,
        latest_activity_at: timestampSchema,
        is_mine: z.boolean(),
      })
      .strict()
      .superRefine((row, context) => {
        if (Date.parse(row.latest_activity_at) < Date.parse(row.created_at)) {
          context.addIssue({
            code: "custom",
            path: ["latest_activity_at"],
            message: "Latest activity cannot predate thread creation.",
          });
        }
      })
      .transform((row): ForumThreadSummary => ({
        id: row.id,
        topicSlug: row.topic_slug,
        topicName: row.topic_name,
        authorName: row.author_name,
        authorHandle: row.author_handle,
        title: row.title,
        excerpt: row.excerpt,
        replyCount: row.reply_count,
        createdAt: row.created_at,
        latestActivityAt: row.latest_activity_at,
        isMine: row.is_mine,
      })),
  )
  .max(40)
  .superRefine(requireUniqueIds);

export const forumThreadRowsSchema = z
  .array(
    z
      .object({
        id: uuidSchema,
        topic_slug: topicSlugSchema,
        topic_name: z.string().min(3).max(80),
        author_name: z.string().min(2).max(60),
        author_handle: memberHandleSchema,
        title: z.string().trim().min(8).max(160),
        body: z.string().trim().min(20).max(5_000),
        created_at: timestampSchema,
        locked: z.boolean(),
        is_mine: z.boolean(),
      })
      .strict()
      .transform((row): ForumThread => ({
        id: row.id,
        topicSlug: row.topic_slug,
        topicName: row.topic_name,
        authorName: row.author_name,
        authorHandle: row.author_handle,
        title: row.title,
        body: row.body,
        createdAt: row.created_at,
        locked: row.locked,
        isMine: row.is_mine,
      })),
  )
  .max(1)
  .superRefine(requireUniqueIds);

export const forumReplyRowsSchema = z
  .array(
    z
      .object({
        id: uuidSchema,
        author_name: z.string().min(2).max(60),
        author_handle: memberHandleSchema,
        body: z.string().trim().min(2).max(3_000),
        created_at: timestampSchema,
        is_mine: z.boolean(),
      })
      .strict()
      .transform((row): ForumReply => ({
        id: row.id,
        authorName: row.author_name,
        authorHandle: row.author_handle,
        body: row.body,
        createdAt: row.created_at,
        isMine: row.is_mine,
      })),
  )
  .max(150)
  .superRefine(requireUniqueIds);
