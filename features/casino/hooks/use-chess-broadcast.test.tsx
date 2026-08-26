// Covers the one path that can leave a mess on Market Square: go-live has
// already returned, so the stream is live and visible, and then publishing
// fails. The stream has to be ended, and the user has to be told about the
// failure that actually happened rather than about the cleanup.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const connect = vi.hoisted(() => vi.fn(async () => {}));
const publishTrack = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("livekit-client", () => {
  class LocalVideoTrack {
    mediaStreamTrack = { getSettings: () => ({ displaySurface: "browser" }) };
    stop() {}
  }
  class Room {
    localParticipant = { publishTrack, setCameraEnabled: vi.fn(async () => {}) };
    connect = connect;
    on() {
      return this;
    }
    disconnect = vi.fn(async () => {});
  }
  return {
    Room,
    LocalVideoTrack,
    RoomEvent: { LocalTrackUnpublished: "localTrackUnpublished" },
    Track: { Source: { ScreenShare: "screen_share", Camera: "camera" } },
    ScreenSharePresets: { h1080fps15: { encoding: {} } },
    createLocalScreenTracks: vi.fn(),
  };
});

const client = vi.hoisted(() => ({
  fetchMarketSquareProfile: vi.fn(),
  createStream: vi.fn(),
  goLive: vi.fn(),
  endStream: vi.fn(),
  applyForCreator: vi.fn(),
}));

vi.mock("@/features/casino/lib/api/market-square-client", () => ({
  ...client,
  canBroadcast: (role: string) => role === "creator" || role === "worldstreet",
}));

const livekit = await import("livekit-client");
// The mocked class takes no constructor arguments, unlike the real one.
const MockScreenTrack = livekit.LocalVideoTrack as unknown as new () => never;
const { useChessBroadcast } = await import("@/features/casino/hooks/use-chess-broadcast");

const stream = {
  id: "s-1",
  ownerId: "u-1",
  title: "Chess: Ada vs Bo",
  description: null,
  status: "live" as const,
  startedAt: null,
  endedAt: null,
  endedReason: null,
  deepLink: { kind: "game" as const, ref: "m-1" },
};

const goodIngest = { url: "wss://lk.example", roomToken: "tok", rtmpUrl: null, streamKey: null };
const rtmpOnlyIngest = { url: null, roomToken: null, rtmpUrl: "rtmp://x", streamKey: "k" };

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function mountReady() {
  const view = renderHook(() => useChessBroadcast("m-1", "Ada", "Bo"), { wrapper });
  await waitFor(() => expect(view.result.current.isCreator).toBe(true));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getDisplayMedia: () => {} },
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
  vi.mocked(livekit.createLocalScreenTracks).mockResolvedValue([new MockScreenTrack()]);
});

describe("useChessBroadcast happy path", () => {
  it("sends the match deep link when it creates the stream", async () => {
    client.goLive.mockResolvedValue({ stream, ingest: goodIngest });
    const { result } = await mountReady();
    await act(async () => result.current.start());

    expect(client.createStream).toHaveBeenCalledWith(
      expect.objectContaining({ deepLink: { kind: "game", ref: "m-1" } })
    );
    expect(result.current.phase).toBe("live");
    expect(client.endStream).not.toHaveBeenCalled();
  });
});

describe("useChessBroadcast cleanup after a failed publish", () => {
  it("ends the live stream when go-live returns no browser credentials, and reports the original failure", async () => {
    client.goLive.mockResolvedValue({ stream, ingest: rtmpOnlyIngest });
    const { result } = await mountReady();
    await act(async () => result.current.start());

    expect(client.endStream).toHaveBeenCalledWith("s-1");
    expect(result.current.phase).toBe("error");
    expect(result.current.error).toMatch(/no browser publishing credentials/i);
    expect(result.current.cleanupWarning).toBeNull();
  });

  it("ends the live stream when the room connection fails, and reports the original failure", async () => {
    client.goLive.mockResolvedValue({ stream, ingest: goodIngest });
    connect.mockRejectedValueOnce(new Error("LiveKit refused the connection."));
    const { result } = await mountReady();
    await act(async () => result.current.start());

    expect(client.endStream).toHaveBeenCalledWith("s-1");
    expect(result.current.error).toBe("LiveKit refused the connection.");
    expect(result.current.cleanupWarning).toBeNull();
  });

  it("keeps the original failure and adds a secondary note when the cleanup itself fails", async () => {
    client.goLive.mockResolvedValue({ stream, ingest: goodIngest });
    connect.mockRejectedValueOnce(new Error("LiveKit refused the connection."));
    client.endStream.mockRejectedValueOnce(new Error("end failed"));
    const { result } = await mountReady();
    await act(async () => result.current.start());

    // The original error is what the user sees. The cleanup is a note beside it.
    expect(result.current.error).toBe("LiveKit refused the connection.");
    expect(result.current.cleanupWarning).toMatch(/may still show the stream as live/i);
    expect(result.current.phase).toBe("error");
  });

  it("does not touch the stream when the failure happened before go-live", async () => {
    client.createStream.mockRejectedValueOnce(new Error("Market Square refused."));
    const { result } = await mountReady();
    await act(async () => result.current.start());

    expect(client.goLive).not.toHaveBeenCalled();
    expect(client.endStream).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Market Square refused.");
  });

  it("does not create a stream at all when the user dismisses the screen picker", async () => {
    vi.mocked(livekit.createLocalScreenTracks).mockRejectedValueOnce(
      new DOMException("denied", "NotAllowedError")
    );
    const { result } = await mountReady();
    await act(async () => result.current.start());

    expect(client.createStream).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("clears a stale cleanup note on the next attempt", async () => {
    client.goLive.mockResolvedValue({ stream, ingest: goodIngest });
    connect.mockRejectedValueOnce(new Error("LiveKit refused the connection."));
    client.endStream.mockRejectedValueOnce(new Error("end failed"));
    const { result } = await mountReady();
    await act(async () => result.current.start());
    expect(result.current.cleanupWarning).not.toBeNull();

    await act(async () => result.current.start());
    expect(result.current.phase).toBe("live");
    expect(result.current.cleanupWarning).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
