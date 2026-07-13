import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import {
  getCommunityAccountData,
  getFeedPage,
  getForumsPage,
  getForumThreadPage,
} from "@/lib/community/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

type RpcResponse = { data: unknown; error: unknown };

function clientReturning(responses: Record<string, RpcResponse>) {
  return {
    schema: () => ({
      rpc: async (name: string) =>
        responses[name] ?? { data: null, error: null },
    }),
  } as never;
}

const stateRow = { code: "LA", name: "Lagos" };
const profileRow = {
  display_name: "Ada",
  handle: "ada",
  state_code: "LA",
};

describe("community repository", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("distinguishes an unconfigured community backend", async () => {
    mockedCreateClient.mockResolvedValue(null);
    await expect(getCommunityAccountData()).resolves.toMatchObject({
      state: "unconfigured",
      data: { states: [], profile: null },
      issues: [{ code: "community_backend_unconfigured" }],
    });
    await expect(getFeedPage({ includeProfile: false })).resolves.toMatchObject(
      {
        available: false,
        loadError: false,
        states: [],
        posts: [],
      },
    );
  });

  it("loads central account identity settings as a ready repository result", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning({
        list_nigeria_states: { data: [stateRow], error: null },
        get_my_community_profile: { data: [profileRow], error: null },
      }),
    );

    await expect(getCommunityAccountData()).resolves.toEqual({
      state: "ready",
      issues: [],
      data: {
        states: [stateRow],
        profile: {
          displayName: "Ada",
          handle: "ada",
          stateCode: "LA",
        },
      },
    });
  });

  it("does not relabel an account identity RPC outage as an empty profile", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning({
        list_nigeria_states: { data: [stateRow], error: null },
        get_my_community_profile: {
          data: null,
          error: { message: "database unavailable" },
        },
      }),
    );

    await expect(getCommunityAccountData()).resolves.toMatchObject({
      state: "unavailable",
      data: { states: [], profile: null },
      issues: [{ code: "community_account_rpc_error" }],
    });
  });

  it("surfaces an RPC outage through loadError", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning({
        list_nigeria_states: {
          data: null,
          error: { message: "database unavailable" },
        },
        list_feed_posts: { data: [], error: null },
      }),
    );
    const result = await getFeedPage({ includeProfile: false });
    expect(result.available).toBe(true);
    expect(result.loadError).toBe(true);
    expect(result.posts).toEqual([]);
  });

  it("maps feed posts and the viewer profile", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning({
        list_nigeria_states: { data: [stateRow], error: null },
        list_feed_posts: {
          data: [
            {
              id: "post-1",
              author_name: "Ada",
              author_handle: "ada",
              category: "career_update",
              state_code: "LA",
              state_name: "Lagos",
              body: "Started a new role.",
              created_at: "2026-07-11T00:00:00.000Z",
              is_mine: true,
            },
          ],
          error: null,
        },
        get_my_community_profile: { data: [profileRow], error: null },
      }),
    );
    const result = await getFeedPage({ includeProfile: true });
    expect(result.loadError).toBe(false);
    expect(result.profile).toEqual({
      displayName: "Ada",
      handle: "ada",
      stateCode: "LA",
    });
    expect(result.posts[0]?.body).toBe("Started a new role.");
  });

  it("maps forum topics and thread summaries", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning({
        list_nigeria_states: { data: [stateRow], error: null },
        list_forum_topics: {
          data: [
            {
              id: "topic-1",
              slug: "career-growth",
              name: "Career growth",
              description: "Discuss career growth.",
              thread_count: 1,
              latest_activity_at: "2026-07-11T00:00:00.000Z",
            },
          ],
          error: null,
        },
        list_forum_threads: {
          data: [
            {
              id: "thread-1",
              topic_slug: "career-growth",
              topic_name: "Career growth",
              author_name: "Ada",
              author_handle: "ada",
              title: "Promotion preparation",
              excerpt: "How should I prepare?",
              reply_count: 2,
              created_at: "2026-07-10T00:00:00.000Z",
              latest_activity_at: "2026-07-11T00:00:00.000Z",
              is_mine: true,
            },
          ],
          error: null,
        },
      }),
    );
    const result = await getForumsPage({ includeProfile: false });
    expect(result.loadError).toBe(false);
    expect(result.topics[0]?.threadCount).toBe(1);
    expect(result.threads[0]?.replyCount).toBe(2);
  });

  it("maps a forum thread and replies", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning({
        list_nigeria_states: { data: [stateRow], error: null },
        get_forum_thread: {
          data: [
            {
              id: "thread-1",
              topic_slug: "career-growth",
              topic_name: "Career growth",
              author_name: "Ada",
              author_handle: "ada",
              title: "Promotion preparation",
              body: "How should I prepare?",
              created_at: "2026-07-10T00:00:00.000Z",
              locked: false,
              is_mine: true,
            },
          ],
          error: null,
        },
        list_forum_replies: {
          data: [
            {
              id: "reply-1",
              author_name: "Tobi",
              author_handle: "tobi",
              body: "Document your impact.",
              created_at: "2026-07-11T00:00:00.000Z",
              is_mine: false,
            },
          ],
          error: null,
        },
      }),
    );
    const result = await getForumThreadPage({
      threadId: "thread-1",
      includeProfile: false,
    });
    expect(result.thread?.locked).toBe(false);
    expect(result.replies[0]?.body).toBe("Document your impact.");
  });
});
