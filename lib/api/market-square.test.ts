// Discovery is the one call whose correctness is not visible in the UI: if it
// answers with the wrong streams, the panel invites a player into a stranger's
// broadcast. `deepLinkRef` is newer than the published spec, so the filter is
// applied again on what comes back.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  authedGet: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/lib/api/service", () => ({
  createServiceClient: () => ({
    get: vi.fn(),
    authedGet: calls.authedGet,
    post: calls.post,
    put: vi.fn(),
    del: vi.fn(),
  }),
}));

const { fetchSpeakerToken, findLiveStreamsForRef, resolveSpeakerRequest, fetchMySpeakerRequest } =
  await import("./market-square");

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
