import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  accountProfileRowsSchema,
  accountStateRowsSchema,
  feedPostRowsSchema,
  forumReplyRowsSchema,
  forumThreadRowsSchema,
  forumThreadSummaryRowsSchema,
  forumTopicRowsSchema,
  mapProfile,
  type CommunityAccountData,
  type CommunityFeedPageData,
  type CommunityForumsPageData,
  type CommunityThreadPageData,
} from "@/lib/community/repository-contracts";

export {
  feedCategories,
  type CommunityAccountData,
  type CommunityFeedPageData,
  type CommunityForumsPageData,
  type CommunityProfile,
  type CommunityThreadPageData,
  type FeedCategory,
  type FeedPost,
  type ForumReply,
  type ForumThread,
  type ForumThreadSummary,
  type ForumTopic,
  type NigeriaState,
} from "@/lib/community/repository-contracts";

type ServerSupabaseClient = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;
type CommunityApi = ReturnType<ServerSupabaseClient["schema"]>;

async function readCommunityPage<Parsed, Data>({
  operation,
  queryCode,
  invalidCode,
  emptyData,
  schema,
  load,
  map,
}: {
  operation: string;
  queryCode: string;
  invalidCode: string;
  emptyData: Data;
  schema: z.ZodType<Parsed>;
  load: (api: CommunityApi) => Promise<{ payload: unknown; error: unknown }>;
  map: (parsed: Parsed) => Data;
}): Promise<RepositoryResult<Data>> {
  let supabase: ServerSupabaseClient | null;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    unstable_rethrow(error);
    return repositoryFailure(
      "unavailable",
      emptyData,
      repositoryIssue(operation, "query_failed", queryCode, error),
    );
  }
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      emptyData,
      repositoryIssue(
        operation,
        "not_configured",
        "community_backend_unconfigured",
      ),
    );
  }

  let loaded: { payload: unknown; error: unknown };
  try {
    loaded = await load(supabase.schema("api"));
  } catch (error) {
    unstable_rethrow(error);
    return repositoryFailure(
      "unavailable",
      emptyData,
      repositoryIssue(operation, "query_failed", queryCode, error),
    );
  }
  if (loaded.error) {
    return repositoryFailure(
      "unavailable",
      emptyData,
      repositoryIssue(operation, "query_failed", queryCode, loaded.error),
    );
  }

  const parsed = schema.safeParse(loaded.payload);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      emptyData,
      repositoryIssue(operation, "invalid_rows", invalidCode, parsed.error),
    );
  }
  return repositoryReady(map(parsed.data));
}

const emptyCommunityAccountData: CommunityAccountData = {
  profile: null,
  states: [],
};

export async function getCommunityAccountData(): Promise<
  RepositoryResult<CommunityAccountData>
> {
  return readCommunityPage({
    operation: "community.account",
    queryCode: "community_account_rpc_error",
    invalidCode: "community_account_invalid_rows",
    emptyData: emptyCommunityAccountData,
    schema: z.object({
      states: accountStateRowsSchema,
      profiles: accountProfileRowsSchema,
    }),
    load: async (api) => {
      const [states, profiles] = await Promise.all([
        api.rpc("list_nigeria_states"),
        api.rpc("get_my_community_profile"),
      ]);
      return {
        payload: { states: states.data, profiles: profiles.data },
        error: states.error ?? profiles.error,
      };
    },
    map: ({ states, profiles }) => ({
      states,
      profile: profiles[0] ? mapProfile(profiles[0]) : null,
    }),
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
}): Promise<RepositoryResult<CommunityFeedPageData>> {
  const emptyData: CommunityFeedPageData = {
    states: [],
    posts: [],
    profile: null,
  };
  return readCommunityPage({
    operation: "community.feed",
    queryCode: "community_feed_rpc_error",
    invalidCode: "community_feed_invalid_rows",
    emptyData,
    schema: z.object({
      states: accountStateRowsSchema,
      posts: feedPostRowsSchema,
      profiles: accountProfileRowsSchema,
    }),
    load: async (api) => {
      const [statesResult, postsResult, profileResult] = await Promise.all([
        api.rpc("list_nigeria_states"),
        api.rpc("list_feed_posts", {
          category_filter: category || undefined,
          state_filter: state || undefined,
          page_limit: 40,
        }),
        includeProfile
          ? api.rpc("get_my_community_profile")
          : Promise.resolve({ data: [], error: null }),
      ]);
      return {
        payload: {
          states: statesResult.data,
          posts: postsResult.data,
          profiles: profileResult.data,
        },
        error: statesResult.error ?? postsResult.error ?? profileResult.error,
      };
    },
    map: ({ states, posts, profiles }) => ({
      states,
      posts,
      profile: profiles[0] ? mapProfile(profiles[0]) : null,
    }),
  });
}

export async function getForumsPage({
  topic,
  includeProfile,
}: {
  topic?: string;
  includeProfile: boolean;
}): Promise<RepositoryResult<CommunityForumsPageData>> {
  const emptyData: CommunityForumsPageData = {
    states: [],
    topics: [],
    threads: [],
    profile: null,
  };
  return readCommunityPage({
    operation: "community.forums",
    queryCode: "community_forums_rpc_error",
    invalidCode: "community_forums_invalid_rows",
    emptyData,
    schema: z.object({
      states: accountStateRowsSchema,
      topics: forumTopicRowsSchema,
      threads: forumThreadSummaryRowsSchema,
      profiles: accountProfileRowsSchema,
    }),
    load: async (api) => {
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
            : Promise.resolve({ data: [], error: null }),
        ]);
      return {
        payload: {
          states: statesResult.data,
          topics: topicsResult.data,
          threads: threadsResult.data,
          profiles: profileResult.data,
        },
        error:
          statesResult.error ??
          topicsResult.error ??
          threadsResult.error ??
          profileResult.error,
      };
    },
    map: ({ states, topics, threads, profiles }) => ({
      states,
      topics,
      threads,
      profile: profiles[0] ? mapProfile(profiles[0]) : null,
    }),
  });
}

export async function getForumThreadPage({
  threadId,
  includeProfile,
}: {
  threadId: string;
  includeProfile: boolean;
}): Promise<RepositoryResult<CommunityThreadPageData>> {
  const emptyData: CommunityThreadPageData = {
    states: [],
    thread: null,
    replies: [],
    profile: null,
  };
  return readCommunityPage({
    operation: "community.thread",
    queryCode: "community_thread_rpc_error",
    invalidCode: "community_thread_invalid_rows",
    emptyData,
    schema: z.object({
      states: accountStateRowsSchema,
      threads: forumThreadRowsSchema,
      replies: forumReplyRowsSchema,
      profiles: accountProfileRowsSchema,
    }),
    load: async (api) => {
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
            : Promise.resolve({ data: [], error: null }),
        ]);
      return {
        payload: {
          states: statesResult.data,
          threads: threadResult.data,
          replies: repliesResult.data,
          profiles: profileResult.data,
        },
        error:
          statesResult.error ??
          threadResult.error ??
          repliesResult.error ??
          profileResult.error,
      };
    },
    map: ({ states, threads, replies, profiles }) => ({
      states,
      thread: threads[0] ?? null,
      replies,
      profile: profiles[0] ? mapProfile(profiles[0]) : null,
    }),
  });
}
