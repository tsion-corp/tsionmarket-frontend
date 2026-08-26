// The shared broadcast, exercised through a game that is not chess. Covers
// what every caller depends on: the deep link naming its own game, the
// degraded go-live being reported rather than papered over, and a target that
// is not ready yet doing nothing.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const connect = vi.hoisted(() => vi.fn(async () => {}));
const publishTrack = vi.hoisted(() => vi.fn(async () => {}));
const setCameraEnabled = vi.hoisted(() => vi.fn(async () => {}));
const disconnect = vi.hoisted(() => vi.fn(async () => {}));
// The room's event handlers, so a test can make the room close under us the
// way the host ending the broadcast does.
const roomEvents = vi.hoisted(() => new Map<string, (arg?: unknown) => void>());
// Screen capture goes through getDisplayMedia directly now, so the picker is
// mocked at the browser API rather than at the SDK.
const displayTrack = vi.hoisted(() => ({
  contentHint: "",
  getSettings: () => ({ displaySurface: "monitor" }),
  addEventListener: vi.fn(),
  stop: vi.fn(),
}));
const displayStream = vi.hoisted(() => ({
  getVideoTracks: () => [displayTrack],
  getTracks: () => [displayTrack],
}));
const getDisplayMedia = vi.hoisted(() => vi.fn(async () => displayStream));

vi.mock("livekit-client", () => {
  class LocalVideoTrack {
    mediaStreamTrack: unknown;
    constructor(track?: unknown) {
      this.mediaStreamTrack = track ?? { getSettings: () => ({}) };
    }
    stop() {}
    mute = vi.fn(async () => {});
    unmute = vi.fn(async () => {});
  }
  class Room {
    localParticipant = {
      publishTrack,
      setCameraEnabled,
      setMicrophoneEnabled: vi.fn(async () => {}),
      videoTrackPublications: new Map(),
    };
    numParticipants = 1;
    connect = connect;
    on(event: string, handler: (arg?: unknown) => void) {
      roomEvents.set(event, handler);
      return this;
    }
    disconnect = disconnect;
  }
  return {
    Room,
    LocalVideoTrack,
    RoomEvent: { LocalTrackUnpublished: "localTrackUnpublished", Disconnected: "disconnected" },
    DisconnectReason: { CLIENT_INITIATED: 1 },
    Track: { Source: { ScreenShare: "screen_share", Camera: "camera" } },
    ScreenSharePresets: { h1080fps15: { encoding: {} }, h1080fps30: { encoding: {} } },
  };
});

const client = vi.hoisted(() => ({
  fetchMarketSquareProfile: vi.fn(),
  createStream: vi.fn(),
  goLive: vi.fn(),
  endStream: vi.fn(),
  applyForCreator: vi.fn(),
  findLiveStreamsForRef: vi.fn(),
  requestToSpeak: vi.fn(),
  fetchMySpeakerRequest: vi.fn(),
  fetchSpeakerQueue: vi.fn(),
  resolveSpeakerRequest: vi.fn(),
  fetchSpeakerToken: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/casino/chess/play" }));

vi.mock("@/lib/api/market-square", () => ({
  ...client,
  canBroadcast: (role: string) => role === "creator" || role === "worldstreet",
}));

const { BroadcastSessionProvider } = await import("@/components/broadcast/broadcast-session");
const { useGameBroadcast } = await import("@/features/casino/hooks/use-game-broadcast");
type Target = Parameters<typeof useGameBroadcast>[0];

const lastStandingTarget = {
  game: "last-standing",
  ref: "42",
  title: "The Last Man: game 42",
  watchPath: "/casino/last-standing/42",
  descriptionLead: "Live on Ark. Watch the game:",
  content: "motion",
  creatorApplicationNote: "I want to broadcast Last Man games.",
} satisfies NonNullable<Target>;

const stream = {
  id: "s-1",
  ownerId: "u-1",
  title: lastStandingTarget.title,
  description: null,
  status: "live" as const,
  startedAt: null,
  endedAt: null,
  endedReason: null,
  deepLink: { kind: "game" as const, ref: "last-standing:42" },
};

const goodIngest = { url: "wss://lk.example", roomToken: "tok", rtmpUrl: null, streamKey: null };
const rtmpOnlyIngest = { url: null, roomToken: null, rtmpUrl: "rtmp://x", streamKey: "k" };

// The room and the stream now live in the app-wide session, so the hook needs
// it above them, exactly as it does in the app.
//
// `showConsumer` lets a test unmount the hook WITHOUT unmounting the session,
// which is the whole point of hoisting it: in the app the session sits above
// the router and a page unmounting is just navigation.
const consumerGate = vi.hoisted(() => ({
  show: ((visible: boolean) => {
    void visible;
  }) as (visible: boolean) => void,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <BroadcastSessionProvider>
        <ConsumerGate>{children}</ConsumerGate>
      </BroadcastSessionProvider>
    </QueryClientProvider>
  );
}

function ConsumerGate({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    consumerGate.show = setVisible;
  }, []);
  return visible ? <>{children}</> : null;
}

async function mountReady(target: Target = lastStandingTarget) {
  const view = renderHook(() => useGameBroadcast(target), { wrapper });
  await waitFor(() => expect(view.result.current.isCreator).toBe(true));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getDisplayMedia },
    configurable: true,
  });
  client.fetchMarketSquareProfile.mockResolvedValue({
    id: "u-1",
    username: "ada",
    displayName: "Ada",
    role: "creator",
  });
  client.createStream.mockResolvedValue(stream);
  client.endStream.mockResolvedValue({ ...stream, status: "ended" as const });
  client.findLiveStreamsForRef.mockResolvedValue([]);
  client.fetchSpeakerQueue.mockResolvedValue([]);
  client.resolveSpeakerRequest.mockResolvedValue({ id: "r-1", status: "approved" });
  getDisplayMedia.mockResolvedValue(displayStream);
});

describe("useGameBroadcast for a game that is not chess", () => {
  it("names its own game in the deep link ref", async () => {
    client.goLive.mockResolvedValue({ stream, ingest: goodIngest });
    const { result } = await mountReady();
    await act(async () => result.current.start());

    expect(client.createStream).toHaveBeenCalledWith(
      expect.objectContaining({ deepLink: { kind: "game", ref: "last-standing:42" } })
    );
    expect(result.current.phase).toBe("live");
  });

  it("puts the watch link for its own route in the description", async () => {
    client.goLive.mockResolvedValue({ stream, ingest: goodIngest });
    const { result } = await mountReady();
    await act(async () => result.current.start());

    const [input] = client.createStream.mock.calls[0] as [{ description: string; title: string }];
    expect(input.description).toContain("/casino/last-standing/42");
    expect(input.description.startsWith("Live on Ark. Watch the game:")).toBe(true);
    expect(input.title).toBe("The Last Man: game 42");
  });

  it("caps a title the service would reject", async () => {
    client.goLive.mockResolvedValue({ stream, ingest: goodIngest });
    const { result } = await mountReady({ ...lastStandingTarget, title: "A".repeat(400) });
    await act(async () => result.current.start());

    const [input] = client.createStream.mock.calls[0] as [{ title: string }];
    expect(input.title.length).toBe(200);
  });

  it("reports the surface the user actually picked", async () => {
    client.goLive.mockResolvedValue({ stream, ingest: goodIngest });
    const { result } = await mountReady();
    await act(async () => result.current.start());

    expect(result.current.surface).toBe("your entire screen");
  });

  it("says so, and ends the stream, when go-live returns no browser credentials", async () => {
    client.goLive.mockResolvedValue({ stream, ingest: rtmpOnlyIngest });
    const { result } = await mountReady();
    await act(async () => result.current.start());

    expect(client.endStream).toHaveBeenCalledWith("s-1");
    expect(result.current.phase).toBe("error");
    expect(result.current.error).toMatch(/no browser publishing credentials/i);
  });

  it("ends the broadcast on stop", async () => {
    client.goLive.mockResolvedValue({ stream, ingest: goodIngest });
    const { result } = await mountReady();
    await act(async () => result.current.start());
    await act(async () => result.current.stop());

    expect(client.endStream).toHaveBeenCalledWith("s-1");
    expect(result.current.phase).toBe("ended");
  });

  it("sends the game's own creator application note", async () => {
    const { result } = await mountReady();
    await act(async () => result.current.applyForCreatorRole());

    expect(client.applyForCreator).toHaveBeenCalledWith("I want to broadcast Last Man games.");
  });

  it("does nothing while there is no target to broadcast", async () => {
    const { result } = await mountReady(null);
    await act(async () => result.current.start());

    expect(getDisplayMedia).not.toHaveBeenCalled();
    expect(client.createStream).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
  });
});

// A live broadcast of the same activity, started by somebody else.
const othersStream = {
  ...stream,
  id: "s-other",
  ownerId: "u-2",
  title: "The Last Man: game 42",
};

const approved = {
  id: "r-1",
  streamId: "s-other",
  userId: "u-1",
  status: "approved" as const,
  joinUrl: "wss://lk.example/guest",
  joinToken: "guest-tok",
  expiresAt: null,
};
const pendingRequest = { ...approved, status: "pending" as const, joinUrl: null, joinToken: null };

async function mountWithJoinable() {
  client.findLiveStreamsForRef.mockResolvedValue([othersStream]);
  const view = await mountReady();
  await waitFor(() => expect(view.result.current.joinable).toHaveLength(1));
  return view;
}

describe("discovery", () => {
  it("offers the broadcast somebody else already started for this activity", async () => {
    const { result } = await mountWithJoinable();

    expect(client.findLiveStreamsForRef).toHaveBeenCalledWith("last-standing:42");
    expect(result.current.joinable[0].id).toBe("s-other");
  });

  it("never offers this account its own broadcast to join", async () => {
    client.findLiveStreamsForRef.mockResolvedValue([{ ...othersStream, ownerId: "u-1" }]);
    const { result } = await mountReady();
    await waitFor(() => expect(result.current.discovering).toBe(false));

    expect(result.current.joinable).toHaveLength(0);
  });

  it("presents every live broadcast rather than picking one", async () => {
    client.findLiveStreamsForRef.mockResolvedValue([
      othersStream,
      { ...othersStream, id: "s-third", ownerId: "u-3" },
    ]);
    const { result } = await mountReady();
    await waitFor(() => expect(result.current.joinable).toHaveLength(2));
  });

  it("keeps the start-my-own path when nobody is broadcasting", async () => {
    client.goLive.mockResolvedValue({ stream, ingest: goodIngest });
    const { result } = await mountReady();
    await waitFor(() => expect(result.current.discovering).toBe(false));
    expect(result.current.joinable).toHaveLength(0);

    await act(async () => result.current.start());
    expect(result.current.phase).toBe("live");
    expect(result.current.role).toBe("host");
  });
});

describe("joining somebody else's broadcast", () => {
  it("waits for the host rather than pretending it is live", async () => {
    client.requestToSpeak.mockResolvedValue(pendingRequest);
    client.fetchMySpeakerRequest.mockResolvedValue(pendingRequest);
    const { result } = await mountWithJoinable();
    await act(async () => result.current.join("s-other"));

    expect(result.current.phase).toBe("joining");
    expect(result.current.role).toBe("guest");
    expect(connect).not.toHaveBeenCalled();
    expect(client.createStream).not.toHaveBeenCalled();
  });

  it("publishes into the host's room once approved, camera first", async () => {
    client.requestToSpeak.mockResolvedValue(pendingRequest);
    client.fetchMySpeakerRequest.mockResolvedValue(approved);
    const { result } = await mountWithJoinable();
    await act(async () => result.current.join("s-other"));
    await waitFor(() => expect(result.current.phase).toBe("live"));

    expect(connect).toHaveBeenCalledWith("wss://lk.example/guest", "guest-tok");
    expect(setCameraEnabled).toHaveBeenCalledWith(true);
    expect(result.current.role).toBe("guest");
    // A guest never creates a stream of its own, which is the whole point.
    expect(client.createStream).not.toHaveBeenCalled();
  });

  it("falls back to the speaker token when the approval carries no credentials", async () => {
    client.requestToSpeak.mockResolvedValue({ ...approved, joinUrl: null, joinToken: null });
    client.fetchSpeakerToken.mockResolvedValue({ url: "wss://lk.example/t", token: "tok-2" });
    const { result } = await mountWithJoinable();
    await act(async () => result.current.join("s-other"));
    await waitFor(() => expect(result.current.phase).toBe("live"));

    expect(client.fetchSpeakerToken).toHaveBeenCalledWith("s-other");
    expect(connect).toHaveBeenCalledWith("wss://lk.example/t", "tok-2");
  });

  it("says so when the host declines, and does not connect", async () => {
    client.requestToSpeak.mockResolvedValue(pendingRequest);
    client.fetchMySpeakerRequest.mockResolvedValue({ ...pendingRequest, status: "denied" });
    const { result } = await mountWithJoinable();
    await act(async () => result.current.join("s-other"));
    await waitFor(() => expect(result.current.phase).toBe("join-declined"));

    expect(connect).not.toHaveBeenCalled();
    expect(result.current.role).toBeNull();
  });

  it("withdraws a request the guest cancels before it is answered", async () => {
    client.requestToSpeak.mockResolvedValue(pendingRequest);
    client.fetchMySpeakerRequest.mockResolvedValue(pendingRequest);
    const { result } = await mountWithJoinable();
    await act(async () => result.current.join("s-other"));
    await act(async () => result.current.cancelJoin());

    expect(client.resolveSpeakerRequest).toHaveBeenCalledWith("s-other", "r-1", "leave");
    expect(result.current.phase).toBe("idle");
  });
});

describe("the host answering requests without leaving the game", () => {
  async function mountHosting() {
    client.goLive.mockResolvedValue({ stream, ingest: goodIngest });
    client.fetchSpeakerQueue.mockResolvedValue([
      {
        ...pendingRequest,
        profile: { id: "u-2", username: "bo", displayName: "Bo", avatarUrl: null },
      },
    ]);
    const view = await mountReady();
    await act(async () => view.result.current.start());
    await waitFor(() => expect(view.result.current.pendingSpeakers).toHaveLength(1));
    return view;
  }

  it("surfaces who is waiting while hosting", async () => {
    const { result } = await mountHosting();
    expect(result.current.pendingSpeakers[0].profile?.displayName).toBe("Bo");
  });

  it("approves from the game", async () => {
    const { result } = await mountHosting();
    await act(async () => result.current.approveSpeaker("r-1"));
    expect(client.resolveSpeakerRequest).toHaveBeenCalledWith("s-1", "r-1", "approve");
  });

  it("declines from the game", async () => {
    const { result } = await mountHosting();
    await act(async () => result.current.declineSpeaker("r-1"));
    expect(client.resolveSpeakerRequest).toHaveBeenCalledWith("s-1", "r-1", "decline");
  });

  it("never asks for a queue it is not the host of", async () => {
    client.requestToSpeak.mockResolvedValue(approved);
    await mountWithJoinable();
    expect(client.fetchSpeakerQueue).not.toHaveBeenCalled();
  });
});

describe("teardown", () => {
  it("a guest leaving steps down without ending the host's stream", async () => {
    client.requestToSpeak.mockResolvedValue(approved);
    const { result } = await mountWithJoinable();
    await act(async () => result.current.join("s-other"));
    await waitFor(() => expect(result.current.phase).toBe("live"));

    await act(async () => result.current.stop());

    expect(client.resolveSpeakerRequest).toHaveBeenCalledWith("s-other", "r-1", "leave");
    expect(client.endStream).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("ended");
    expect(result.current.role).toBeNull();
  });

  it("a host ending ends the stream, and never files a speaker leave", async () => {
    client.goLive.mockResolvedValue({ stream, ingest: goodIngest });
    const { result } = await mountReady();
    await act(async () => result.current.start());
    await act(async () => result.current.stop());

    expect(client.endStream).toHaveBeenCalledWith("s-1");
    expect(client.resolveSpeakerRequest).not.toHaveBeenCalled();
  });

  it("tells a guest the broadcast ended under them instead of showing a live badge", async () => {
    client.requestToSpeak.mockResolvedValue(approved);
    const { result } = await mountWithJoinable();
    await act(async () => result.current.join("s-other"));
    await waitFor(() => expect(result.current.phase).toBe("live"));

    // The host ending the stream reaches a guest as the room closing.
    await act(async () => {
      roomEvents.get("disconnected")?.(undefined);
    });

    expect(result.current.phase).toBe("host-ended");
    expect(result.current.sharingCamera).toBe(false);
  });

  it("does not report a disconnect this session asked for as the host ending it", async () => {
    client.requestToSpeak.mockResolvedValue(approved);
    const { result } = await mountWithJoinable();
    await act(async () => result.current.join("s-other"));
    await waitFor(() => expect(result.current.phase).toBe("live"));

    await act(async () => {
      roomEvents.get("disconnected")?.(1);
    });

    expect(result.current.phase).toBe("live");
  });

  // The headline guarantee of hoisting the session above the router: leaving
  // the game screen is navigation, not the end of the broadcast. The room is
  // held by the session, which outlives every page.
  it("keeps the broadcast running when the game screen unmounts", async () => {
    client.requestToSpeak.mockResolvedValue(approved);
    const view = await mountWithJoinable();
    await act(async () => view.result.current.join("s-other"));
    await waitFor(() => expect(view.result.current.phase).toBe("live"));

    // The game screen goes away; the session above the router does not.
    act(() => consumerGate.show(false));

    expect(disconnect).not.toHaveBeenCalled();
    expect(client.resolveSpeakerRequest).not.toHaveBeenCalled();
    expect(client.endStream).not.toHaveBeenCalled();
  });
});
