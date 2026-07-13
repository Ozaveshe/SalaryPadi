import "server-only";

import { z } from "zod";

import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

function mapProfile(row: {
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

const accountStateRowsSchema = z.array(
  z.object({
    code: z.string().regex(/^[A-Z]{2,4}$/),
    name: z.string().min(3).max(40),
  }),
);

const accountProfileRowsSchema = z
  .array(
    z.object({
      display_name: z.string().min(2).max(60),
      handle: z.string().min(1).max(80),
      state_code: z
        .string()
        .regex(/^[A-Z]{2,4}$/)
        .nullable(),
    }),
  )
  .max(1);

const emptyCommunityAccountData: CommunityAccountData = {
  profile: null,
  states: [],
};

export async function getCommunityAccountData(): Promise<
  RepositoryResult<CommunityAccountData>
> {
  const operation = "community.account";
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      emptyCommunityAccountData,
      repositoryIssue(
        operation,
        "not_configured",
        "community_backend_unconfigured",
      ),
    );
  }

  const api = supabase.schema("api");
  const [statesResult, profileResult] = await Promise.all([
    api.rpc("list_nigeria_states"),
    api.rpc("get_my_community_profile"),
  ]);
  const error = statesResult.error ?? profileResult.error;
  if (
    error ||
    !Array.isArray(statesResult.data) ||
    !Array.isArray(profileResult.data)
  ) {
    return repositoryFailure(
      "unavailable",
      emptyCommunityAccountData,
      repositoryIssue(
        operation,
        error ? "query_failed" : "invalid_container",
        error
          ? "community_account_rpc_error"
          : "community_account_invalid_container",
        error,
      ),
    );
  }

  const states = accountStateRowsSchema.safeParse(statesResult.data);
  const profiles = accountProfileRowsSchema.safeParse(profileResult.data);
  if (!states.success || !profiles.success) {
    return repositoryFailure(
      "invalid",
      emptyCommunityAccountData,
      repositoryIssue(
        operation,
        "invalid_rows",
        "community_account_invalid_rows",
        states.success ? profiles.error : states.error,
      ),
    );
  }

  return repositoryReady({
    states: states.data,
    profile: profiles.data[0] ? mapProfile(profiles.data[0]) : null,
  });
}

export async function getFeedPage({
  category,
  state,
  includeProfile,
}: {
  category?: string;
  state?: string;
  includeProfile: boolean;
}) {
  const supabase = await createServerSupabaseClient();
  if (!supabase)
    return {
      available: false,
      loadError: false,
      states: [] as NigeriaState[],
      posts: [] as FeedPost[],
      profile: null as CommunityProfile | null,
    };

  const api = supabase.schema("api");
  const [statesResult, postsResult, profileResult] = await Promise.all([
    api.rpc("list_nigeria_states"),
    api.rpc("list_feed_posts", {
      category_filter: category || undefined,
      state_filter: state || undefined,
      page_limit: 40,
    }),
    includeProfile
      ? api.rpc("get_my_community_profile")
      : Promise.resolve({ data: null, error: null }),
  ]);

  return {
    available: true,
    loadError: Boolean(
      statesResult.error || postsResult.error || profileResult.error,
    ),
    states: (statesResult.data ?? []).map((row) => ({
      code: row.code,
      name: row.name,
    })),
    posts: (postsResult.data ?? []).map((row) => ({
      id: row.id,
      authorName: row.author_name,
      authorHandle: row.author_handle,
      category: row.category,
      stateCode: row.state_code || null,
      stateName: row.state_name || null,
      body: row.body,
      createdAt: row.created_at,
      isMine: row.is_mine,
    })),
    profile: profileResult.data?.[0] ? mapProfile(profileResult.data[0]) : null,
  };
}

export async function getForumsPage({
  topic,
  includeProfile,
}: {
  topic?: string;
  includeProfile: boolean;
}) {
  const supabase = await createServerSupabaseClient();
  if (!supabase)
    return {
      available: false,
      loadError: false,
      states: [] as NigeriaState[],
      topics: [] as ForumTopic[],
      threads: [] as ForumThreadSummary[],
      profile: null as CommunityProfile | null,
    };

  const api = supabase.schema("api");
  const [statesResult, topicsResult, threadsResult, profileResult] =
    await Promise.all([
      api.rpc("list_nigeria_states"),
      api.rpc("list_forum_topics"),
      api.rpc("list_forum_threads", {
        topic_filter: topic || undefined,
        page_limit: 40,
      }),
      includeProfile
        ? api.rpc("get_my_community_profile")
        : Promise.resolve({ data: null, error: null }),
    ]);

  return {
    available: true,
    loadError: Boolean(
      statesResult.error ||
      topicsResult.error ||
      threadsResult.error ||
      profileResult.error,
    ),
    states: (statesResult.data ?? []).map((row) => ({
      code: row.code,
      name: row.name,
    })),
    topics: (topicsResult.data ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      threadCount: row.thread_count,
      latestActivityAt: row.latest_activity_at || null,
    })),
    threads: (threadsResult.data ?? []).map((row) => ({
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
    profile: profileResult.data?.[0] ? mapProfile(profileResult.data[0]) : null,
  };
}

export async function getForumThreadPage({
  threadId,
  includeProfile,
}: {
  threadId: string;
  includeProfile: boolean;
}) {
  const supabase = await createServerSupabaseClient();
  if (!supabase)
    return {
      available: false,
      loadError: false,
      states: [] as NigeriaState[],
      thread: null as ForumThread | null,
      replies: [] as ForumReply[],
      profile: null as CommunityProfile | null,
    };

  const api = supabase.schema("api");
  const [statesResult, threadResult, repliesResult, profileResult] =
    await Promise.all([
      api.rpc("list_nigeria_states"),
      api.rpc("get_forum_thread", { thread_id: threadId }),
      api.rpc("list_forum_replies", {
        thread_id: threadId,
        page_limit: 150,
      }),
      includeProfile
        ? api.rpc("get_my_community_profile")
        : Promise.resolve({ data: null, error: null }),
    ]);
  const row = threadResult.data?.[0];

  return {
    available: true,
    loadError: Boolean(
      statesResult.error ||
      threadResult.error ||
      repliesResult.error ||
      profileResult.error,
    ),
    states: (statesResult.data ?? []).map((item) => ({
      code: item.code,
      name: item.name,
    })),
    thread: row
      ? {
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
        }
      : null,
    replies: (repliesResult.data ?? []).map((item) => ({
      id: item.id,
      authorName: item.author_name,
      authorHandle: item.author_handle,
      body: item.body,
      createdAt: item.created_at,
      isMine: item.is_mine,
    })),
    profile: profileResult.data?.[0] ? mapProfile(profileResult.data[0]) : null,
  };
}
