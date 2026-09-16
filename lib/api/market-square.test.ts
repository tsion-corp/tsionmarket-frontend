// Discovery is the one call whose correctness is not visible in the UI: if it
// answers with the wrong streams, the panel invites a player into a stranger's
// broadcast. `deepLinkRef` is newer than the published spec, so the filter is
// applied again on what comes back.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  get: vi.fn(),
  authedGet: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/api/service", () => ({
  createServiceClient: () => ({
    get: calls.get,
    authedGet: calls.authedGet,
    post: calls.post,
    put: vi.fn(),
    del: calls.del,
  }),
}));

const {
  searchSquare,
  addPostComment,
  fetchCommentReplies,
  setCommentLike,
  fetchDiscoverHouses,
  fetchLiveStreams,
  fetchScheduledStreams,
  fetchSpeakerToken,
  findLiveStreamsForRef,
  resolveSpeakerRequest,
  fetchMySpeakerRequest,
} = await import("./market-square");

function wireStream(overrides: Record<string, unknown>) {
  return {
    id: "s-1",
    ownerId: "u-1",
    title: "Chess: Ada vs Bo",
    status: "live",
    deepLink: { kind: "game", ref: "chess:m-1" },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("findLiveStreamsForRef", () => {
  it("asks upstream for the live streams of exactly this activity", async () => {
    calls.authedGet.mockResolvedValue({ items: [] });
    await findLiveStreamsForRef("chess:m-1");

    expect(calls.authedGet).toHaveBeenCalledWith("/streams", {
      status: "live",
      deepLinkRef: "chess:m-1",
      limit: 20,
    });
  });

  it("drops anything whose deep link is not this activity, in case the filter was ignored", async () => {
    calls.authedGet.mockResolvedValue({
      items: [
        wireStream({}),
        wireStream({ id: "s-2", deepLink: { kind: "game", ref: "chess:m-999" } }),
        wireStream({ id: "s-3", deepLink: null }),
        wireStream({ id: "s-4", deepLink: { kind: "game", ref: "checkers:m-1" } }),
      ],
    });

    const found = await findLiveStreamsForRef("chess:m-1");
    expect(found.map((stream) => stream.id)).toEqual(["s-1"]);
  });

  it("drops a stream that is no longer live", async () => {
    calls.authedGet.mockResolvedValue({ items: [wireStream({ status: "ended" })] });
    expect(await findLiveStreamsForRef("chess:m-1")).toEqual([]);
  });

  it("treats an absent list as nobody broadcasting, not as a failure", async () => {
    calls.authedGet.mockResolvedValue({});
    expect(await findLiveStreamsForRef("chess:m-1")).toEqual([]);
  });
});

describe("speaker requests", () => {
  it("reads the caller's own request as null when they never asked", async () => {
    calls.authedGet.mockResolvedValue(null);
    expect(await fetchMySpeakerRequest("s-1")).toBeNull();
  });

  it("carries the publishing credentials off an approved request", async () => {
    calls.authedGet.mockResolvedValue({
      id: "r-1",
      streamId: "s-1",
      userId: "u-2",
      status: "approved",
      joinUrl: "wss://lk.example",
      joinToken: "tok",
    });

    const mine = await fetchMySpeakerRequest("s-1");
    expect(mine).toMatchObject({
      status: "approved",
      joinUrl: "wss://lk.example",
      joinToken: "tok",
    });
  });

  it("posts the host's decision to the action the service names", async () => {
    calls.post.mockResolvedValue({ id: "r-1", streamId: "s-1", userId: "u-2", status: "approved" });
    await resolveSpeakerRequest("s-1", "r-1", "approve");
    expect(calls.post).toHaveBeenCalledWith("/streams/s-1/speaker-requests/r-1/approve");
  });

  it("refuses a speaker token that cannot be published with, rather than connecting to nothing", async () => {
    calls.post.mockResolvedValue({ url: null, token: null });
    await expect(fetchSpeakerToken("s-1")).rejects.toThrow(/no publishing token/i);
  });
});

// ── The Square page's reads ──────────────────────────────────────────────────
//
// Home's live rooms, coming-soon rooms and popular houses. Each is asked for
// exactly what the Square's own Home asks for, and each treats an absent list
// as "nothing to show" so an empty section is omitted rather than an error.

function wireRoom(overrides: Record<string, unknown>) {
  return {
    id: "st-1",
    ownerId: "u-1",
    title: "testing coming soon",
    description: null,
    category: "house",
    topics: ["business"],
    status: "scheduled",
    scheduledAt: "2026-09-14T08:00:00.000Z",
    startedAt: null,
    peakViewers: 0,
    likeCount: 0,
    owner: {
      id: "u-1",
      username: "prince",
      displayName: null,
      avatarUrl: null,
      verification: "verified",
    },
    ...overrides,
  };
}

describe("fetchLiveStreams", () => {
  it("asks for the live rooms with the session, and keeps only the live ones", async () => {
    calls.authedGet.mockResolvedValue({
      items: [
        wireRoom({ status: "live", startedAt: "2026-09-12T10:00:00.000Z", peakViewers: 12 }),
        wireRoom({ id: "st-2", status: "ended" }),
      ],
    });
    const rooms = await fetchLiveStreams(8);
    expect(calls.authedGet).toHaveBeenCalledWith("/streams", { status: "live", limit: 8 });
    expect(rooms.map((room) => room.id)).toEqual(["st-1"]);
    expect(rooms[0]).toMatchObject({
      status: "live",
      peakViewers: 12,
      owner: { id: "u-1", username: "prince", displayName: null, avatarUrl: null },
    });
  });

  it("treats an absent list as nobody live", async () => {
    calls.authedGet.mockResolvedValue({});
    expect(await fetchLiveStreams()).toEqual([]);
  });
});

describe("fetchScheduledStreams", () => {
  it("asks for the scheduled rooms and carries when each starts", async () => {
    calls.authedGet.mockResolvedValue({ items: [wireRoom({})] });
    const rooms = await fetchScheduledStreams(8);
    expect(calls.authedGet).toHaveBeenCalledWith("/streams", { status: "scheduled", limit: 8 });
    expect(rooms[0]).toMatchObject({
      status: "scheduled",
      scheduledAt: "2026-09-14T08:00:00.000Z",
    });
  });

  it("carries a null owner rather than inventing one", async () => {
    calls.authedGet.mockResolvedValue({ items: [wireRoom({ owner: undefined })] });
    expect((await fetchScheduledStreams())[0].owner).toBeNull();
  });
});

describe("fetchDiscoverHouses", () => {
  it("reads the public directory and maps a house to what the card shows", async () => {
    calls.get.mockResolvedValue({
      items: [
        {
          id: "h-1",
          kind: "group",
          title: "Entitle Men",
          description: "let get started",
          imageUrl: "https://cdn.example/h.jpg",
          visibility: "public",
          members: [{ id: "u-1", username: "ogazboiz", displayName: "ogazboiz", avatarUrl: null }],
          memberCount: 1,
          lastActiveAt: null,
        },
        { id: "h-2", kind: "group", title: null, members: [] },
      ],
      nextCursor: null,
    });
    const houses = await fetchDiscoverHouses(8);
    expect(calls.get).toHaveBeenCalledWith("/conversations/discover", { limit: 8 });
    expect(houses).toEqual([
      {
        id: "h-1",
        title: "Entitle Men",
        description: "let get started",
        imageUrl: "https://cdn.example/h.jpg",
        memberCount: 1,
        members: [{ id: "u-1", username: "ogazboiz", displayName: "ogazboiz", avatarUrl: null }],
      },
      // A nameless house keeps its id: the card names it, the link still works.
      { id: "h-2", title: null, description: null, imageUrl: null, memberCount: null, members: [] },
    ]);
  });

  it("treats an absent list as no houses", async () => {
    calls.get.mockResolvedValue({});
    expect(await fetchDiscoverHouses()).toEqual([]);
  });
});

// ── The comments sheet's reads and writes ───────────────────────────────────

describe("comments on the Square page", () => {
  it("posts a reply to a comment with its parent, and a top-level one without", async () => {
    calls.post.mockResolvedValue({ id: "c-2", text: "hi", createdAt: "2026-09-12T00:00:00Z" });
    await addPostComment("p-1", "hi", "c-1");
    expect(calls.post).toHaveBeenCalledWith("/posts/p-1/comments", { text: "hi", parentId: "c-1" });
    await addPostComment("p-1", "hi");
    expect(calls.post).toHaveBeenLastCalledWith("/posts/p-1/comments", { text: "hi" });
  });

  it("reads a thread's replies, oldest first as the service orders them", async () => {
    calls.get.mockResolvedValue({ items: [{ id: "c-3", text: "yo" }], nextCursor: "n" });
    const page = await fetchCommentReplies("c-1", null);
    expect(calls.get).toHaveBeenCalledWith("/comments/c-1/replies?limit=25");
    expect(page).toEqual({ items: [{ id: "c-3", text: "yo" }], nextCursor: "n" });
    await fetchCommentReplies("c-1", "n");
    expect(calls.get).toHaveBeenLastCalledWith("/comments/c-1/replies?limit=25&cursor=n");
  });

  it("likes and unlikes a comment, and renders the server's count", async () => {
    calls.post.mockResolvedValue({ liked: true, likeCount: 3 });
    expect(await setCommentLike("c-1", true)).toEqual({ liked: true, likeCount: 3 });
    expect(calls.post).toHaveBeenCalledWith("/comments/c-1/like", {});
    calls.del.mockResolvedValue({ liked: false, likeCount: 2 });
    expect(await setCommentLike("c-1", false)).toEqual({ liked: false, likeCount: 2 });
    expect(calls.del).toHaveBeenCalledWith("/comments/c-1/like");
  });
});

describe("searchSquare", () => {
  it("asks the Square's one search route for everything, and pages on its cursor", async () => {
    calls.get.mockResolvedValue({
      items: [{ kind: "profile", id: "u-1", profile: { id: "u-1", username: "samuel" } }],
      nextCursor: "n",
    });
    const page = await searchSquare("sam");
    expect(calls.get).toHaveBeenCalledWith("/search", { q: "sam", type: "all", limit: 30 });
    expect(page.items[0]).toMatchObject({ kind: "profile", id: "u-1" });
    expect(page.nextCursor).toBe("n");
    await searchSquare(" sam ", "n");
    expect(calls.get).toHaveBeenLastCalledWith("/search", {
      q: "sam",
      type: "all",
      limit: 30,
      cursor: "n",
    });
  });

  it("treats an absent list as nothing matched", async () => {
    calls.get.mockResolvedValue({});
    expect(await searchSquare("x")).toEqual({ items: [], nextCursor: null });
  });
});
