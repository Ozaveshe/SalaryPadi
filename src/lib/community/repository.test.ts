import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
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
import { unstable_rethrow } from "next/navigation";

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
  handle: "sp-a1b2c3d4",
  state_code: "LA",
};

const postId = "00000000-0000-4000-8000-000000000001";
const topicId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";
const replyId = "00000000-0000-4000-8000-000000000004";

describe("community repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(unstable_rethrow).mockReset();
  });

  it("distinguishes an unconfigured community backend", async () => {
    mockedCreateClient.mockResolvedValue(null);
    await expect(getCommunityAccountData()).resolves.toMatchObject({
      state: "unconfigured",
      data: { states: [], profile: null },
      issues: [{ code: "community_backend_unconfigured" }],
    });
    await expect(getFeedPage({ includeProfile: false })).resolves.toMatchObject(
      {
        state: "unconfigured",
        data: { states: [], posts: [], profile: null },
        issues: [{ code: "community_backend_unconfigured" }],
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
          handle: "sp-a1b2c3d4",
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
    expect(result.state).toBe("unavailable");
    expect(result.data.posts).toEqual([]);
    expect(result.issues[0]?.code).toBe("community_feed_rpc_error");
  });

  it("maps feed posts and the viewer profile", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning({
        list_nigeria_states: { data: [stateRow], error: null },
        list_feed_posts: {
          data: [
            {
              id: postId,
              author_name: "Ada",
              author_handle: "sp-a1b2c3d4",
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
    expect(result.state).toBe("ready");
    expect(result.data.profile).toEqual({
      displayName: "Ada",
      handle: "sp-a1b2c3d4",
      stateCode: "LA",
    });
    expect(result.data.posts[0]?.body).toBe("Started a new role.");
  });

  it("maps forum topics and thread summaries", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning({
        list_nigeria_states: { data: [stateRow], error: null },
        list_forum_topics: {
          data: [
            {
              id: topicId,
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
              id: threadId,
              topic_slug: "career-growth",
              topic_name: "Career growth",
              author_name: "Ada",
              author_handle: "sp-a1b2c3d4",
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
    expect(result.state).toBe("ready");
    expect(result.data.topics[0]?.threadCount).toBe(1);
    expect(result.data.threads[0]?.replyCount).toBe(2);
  });

  it("maps a forum thread and replies", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning({
        list_nigeria_states: { data: [stateRow], error: null },
        get_forum_thread: {
          data: [
            {
              id: threadId,
              topic_slug: "career-growth",
              topic_name: "Career growth",
              author_name: "Ada",
              author_handle: "sp-a1b2c3d4",
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
              id: replyId,
              author_name: "Tobi",
              author_handle: "sp-b1c2d3e4",
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
      threadId,
      includeProfile: false,
    });
    expect(result.state).toBe("ready");
    expect(result.data.thread?.locked).toBe(false);
    expect(result.data.replies[0]?.body).toBe("Document your impact.");
  });

  it("marks malformed feed rows invalid instead of rendering an empty feed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning({
        list_nigeria_states: { data: [stateRow], error: null },
        list_feed_posts: { data: [{ id: "broken" }], error: null },
      }),
    );

    await expect(getFeedPage({ includeProfile: false })).resolves.toMatchObject(
      {
        state: "invalid",
        data: { posts: [] },
        issues: [{ code: "community_feed_invalid_rows" }],
      },
    );
  });

  it("rejects a complete community row with malformed chronology evidence", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning({
        list_nigeria_states: { data: [stateRow], error: null },
        list_feed_posts: {
          data: [
            {
              id: postId,
              author_name: "Ada",
              author_handle: "sp-a1b2c3d4",
              category: "career_update",
              state_code: "LA",
              state_name: "Lagos",
              body: "Started a new role.",
              created_at: "not-a-timestamp",
              is_mine: true,
            },
          ],
          error: null,
        },
      }),
    );

    await expect(getFeedPage({ includeProfile: false })).resolves.toMatchObject(
      {
        state: "invalid",
        data: { posts: [] },
        issues: [{ code: "community_feed_invalid_rows" }],
      },
    );
  });

  it("rejects duplicate community records instead of rendering ambiguous content", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const duplicatePost = {
      id: postId,
      author_name: "Ada",
      author_handle: "sp-a1b2c3d4",
      category: "career_update",
      state_code: "LA",
      state_name: "Lagos",
      body: "Started a new role.",
      created_at: "2026-07-11T00:00:00.000Z",
      is_mine: true,
    };
    mockedCreateClient.mockResolvedValue(
      clientReturning({
        list_nigeria_states: { data: [stateRow], error: null },
        list_feed_posts: {
          data: [duplicatePost, duplicatePost],
          error: null,
        },
      }),
    );

    await expect(getFeedPage({ includeProfile: false })).resolves.toMatchObject(
      {
        state: "invalid",
        data: { posts: [] },
        issues: [{ code: "community_feed_invalid_rows" }],
      },
    );
  });

  it("rejects forum activity timestamps that predate thread creation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning({
        list_nigeria_states: { data: [stateRow], error: null },
        list_forum_topics: { data: [], error: null },
        list_forum_threads: {
          data: [
            {
              id: threadId,
              topic_slug: "career-growth",
              topic_name: "Career growth",
              author_name: "Ada",
              author_handle: "sp-a1b2c3d4",
              title: "Promotion preparation",
              excerpt: "How should I prepare for promotion?",
              reply_count: 2,
              created_at: "2026-07-11T00:00:00.000Z",
              latest_activity_at: "2026-07-10T00:00:00.000Z",
              is_mine: true,
            },
          ],
          error: null,
        },
      }),
    );

    await expect(
      getForumsPage({ includeProfile: false }),
    ).resolves.toMatchObject({
      state: "invalid",
      data: { threads: [] },
      issues: [{ code: "community_forums_invalid_rows" }],
    });
  });

  it("turns a thrown page RPC transport into an unavailable state", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("community transport failed");
    mockedCreateClient.mockResolvedValue({
      schema: () => ({ rpc: async () => Promise.reject(failure) }),
    } as never);

    await expect(
      getForumsPage({ includeProfile: false }),
    ).resolves.toMatchObject({
      state: "unavailable",
      data: { topics: [], threads: [] },
      issues: [{ code: "community_forums_rpc_error" }],
    });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });

  it("does not swallow framework-controlled errors during community reads", async () => {
    const frameworkError = new Error("next framework signal");
    mockedCreateClient.mockRejectedValue(frameworkError);
    vi.mocked(unstable_rethrow).mockImplementationOnce((reason) => {
      throw reason;
    });

    await expect(getFeedPage({ includeProfile: false })).rejects.toBe(
      frameworkError,
    );
  });
});
