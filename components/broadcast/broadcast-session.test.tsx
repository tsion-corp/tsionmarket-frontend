// The session's job is the lifecycle and the guard. Both are the kind of thing
// that only shows up in production if it is not tested here: a stream that
// looks live while sending nothing, or a portfolio still going out while the
// user exports a recovery phrase.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const connect = vi.hoisted(() => vi.fn(async () => {}));
const publishTrack = vi.hoisted(() => vi.fn(async () => {}));
const setCameraEnabled = vi.hoisted(() => vi.fn(async () => {}));
const setMicrophoneEnabled = vi.hoisted(() => vi.fn(async () => {}));
const disconnect = vi.hoisted(() => vi.fn(async () => {}));
const mute = vi.hoisted(() => vi.fn(async () => {}));
const unmute = vi.hoisted(() => vi.fn(async () => {}));
const roomEvents = vi.hoisted(() => new Map<string, (arg?: unknown) => void>());
const trackEvents = vi.hoisted(() => new Map<string, () => void>());
const path = vi.hoisted(() => ({ current: "/dashboard" }));

const displayTrack = vi.hoisted(() => ({
  contentHint: "",
  getSettings: () => ({ displaySurface: "browser" }),
  addEventListener: vi.fn((name: string, handler: () => void) => trackEvents.set(name, handler)),
  stop: vi.fn(),
}));
const displayStream = vi.hoisted(() => ({
  getVideoTracks: () => [displayTrack],
  getTracks: () => [displayTrack],
}));
// Typed to take the constraints so the tests can assert on what was passed.
const getDisplayMedia = vi.hoisted(() =>
  vi.fn(async (constraints?: unknown) => {
    void constraints;
    return displayStream;
  })
);

vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

vi.mock("livekit-client", () => {
  class LocalVideoTrack {
    mediaStreamTrack: unknown;
    constructor(track?: unknown) {
      this.mediaStreamTrack = track;
    }
    stop() {}
    mute = mute;
    unmute = unmute;
  }
  class Room {
    localParticipant = {
      publishTrack,
      setCameraEnabled,
      setMicrophoneEnabled,
      videoTrackPublications: new Map([["v", { track: { mute, unmute } }]]),
    };
    numParticipants = 4;
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
    RoomEvent: {
      LocalTrackUnpublished: "localTrackUnpublished",
      Disconnected: "disconnected",
      Reconnecting: "reconnecting",
      Reconnected: "reconnected",
    },
    DisconnectReason: { CLIENT_INITIATED: 1 },
    Track: { Source: { ScreenShare: "screen_share", Camera: "camera" } },
    ScreenSharePresets: { h1080fps15: { encoding: {} }, h1080fps30: { encoding: {} } },
  };
});

const client = vi.hoisted(() => ({
  createStream: vi.fn(),
  goLive: vi.fn(),
  endStream: vi.fn(),
  resolveSpeakerRequest: vi.fn(),
}));

vi.mock("@/lib/api/market-square", () => client);

const { BroadcastSessionProvider, useBroadcastSession } = await import("./broadcast-session");
const { BROADCASTING_CLASS, BLUR_CLASS, SUSPEND_ATTRIBUTE } =
  await import("@/lib/broadcast/sensitive");

const stream = {
  id: "s-1",
  ownerId: "u-1",
  title: "Live on Ark — Portfolio",
  description: null,
  status: "live" as const,
  startedAt: null,
  endedAt: null,
  endedReason: null,
  deepLink: null,
};

const target = {
  title: "Live on Ark — Portfolio",
  watchPath: "/dashboard",
  descriptionLead: "Live from Ark. Follow along:",
  content: "motion" as const,
  deepLink: null,
  creatorApplicationNote: "note",
};

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <BroadcastSessionProvider>{children}</BroadcastSessionProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  path.current = "/dashboard";
  document.documentElement.className = "";
  document.body.innerHTML = "";
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getDisplayMedia },
    configurable: true,
  });
  getDisplayMedia.mockResolvedValue(displayStream);
  client.createStream.mockResolvedValue(stream);
  client.goLive.mockResolvedValue({
    stream,
    ingest: { url: "wss://lk.example", roomToken: "tok", rtmpUrl: null, streamKey: null },
  });
  client.endStream.mockResolvedValue({ ...stream, status: "ended" as const });
});

async function goLiveScreen() {
  const view = renderHook(() => useBroadcastSession(), { wrapper });
  await act(async () => {
    const capture = await view.result.current.captureScreen("motion");
    await view.result.current.goLiveWith({ target, mode: "screen", capture });
  });
  await waitFor(() => expect(view.result.current.phase).toBe("live"));
  return view;
}

describe("the screen picker constraints", () => {
  it("never offers the entire screen, which is the point on a trading app", async () => {
    await goLiveScreen();
    const [constraints] = getDisplayMedia.mock.calls[0] as unknown as [
      {
        video: Record<string, unknown>;
        surfaceSwitching: string;
      },
    ];
    expect(constraints.video.monitorTypeSurfaces).toBe("exclude");
    expect(constraints.video.displaySurface).toBe("browser");
    expect(constraints.surfaceSwitching).toBe("exclude");
  });
});

describe("the financial-data guard", () => {
  it("marks the document so sensitive fields blur, and clears it when the broadcast ends", async () => {
    const view = await goLiveScreen();
    expect(document.documentElement.classList.contains(BROADCASTING_CLASS)).toBe(true);
    expect(document.documentElement.classList.contains(BLUR_CLASS)).toBe(true);

    await act(async () => view.result.current.stop());
    expect(document.documentElement.classList.contains(BROADCASTING_CLASS)).toBe(false);
  });

  it("stops blurring when the broadcaster turns it off, without ending the broadcast", async () => {
    const view = await goLiveScreen();
    act(() => view.result.current.setBlurSensitive(false));

    expect(document.documentElement.classList.contains(BLUR_CLASS)).toBe(false);
    expect(document.documentElement.classList.contains(BROADCASTING_CLASS)).toBe(true);
    expect(view.result.current.phase).toBe("live");
  });

  it("suspends the outgoing video on a route that can show a recovery phrase", async () => {
    const view = await goLiveScreen();
    expect(view.result.current.suspended).toBeNull();

    path.current = "/settings/seed-phrase";
    view.rerender();

    await waitFor(() => expect(view.result.current.suspended).toBe("keys"));
    await waitFor(() => expect(mute).toHaveBeenCalled());
  });

  it("resumes on leaving the sensitive route rather than ending the broadcast", async () => {
    const view = await goLiveScreen();
    path.current = "/settings/private-key";
    view.rerender();
    await waitFor(() => expect(view.result.current.suspended).toBe("keys"));

    path.current = "/dashboard";
    view.rerender();

    await waitFor(() => expect(view.result.current.suspended).toBeNull());
    await waitFor(() => expect(unmute).toHaveBeenCalled());
    expect(view.result.current.phase).toBe("live");
  });

  it("suspends when Privy's own hook reports its dialog open", async () => {
    const view = await goLiveScreen();
    act(() => view.result.current.setPrivyModalOpen(true));

    await waitFor(() => expect(view.result.current.suspended).toBe("keys"));
    await waitFor(() => expect(mute).toHaveBeenCalled());

    act(() => view.result.current.setPrivyModalOpen(false));
    await waitFor(() => expect(view.result.current.suspended).toBeNull());
  });

  it("outranks a signing sheet with Privy's dialog, the more serious of the two", async () => {
    const view = await goLiveScreen();
    await act(async () => {
      const sheet = document.createElement("div");
      sheet.setAttribute(SUSPEND_ATTRIBUTE, "");
      document.body.appendChild(sheet);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(view.result.current.suspended).toBe("signing"));

    act(() => view.result.current.setPrivyModalOpen(true));
    await waitFor(() => expect(view.result.current.suspended).toBe("keys"));
  });

  it("suspends on the DOM fallback when no Privy bridge is mounted", async () => {
    const view = await goLiveScreen();
    await act(async () => {
      const dialog = document.createElement("div");
      dialog.id = "privy-dialog";
      document.body.appendChild(dialog);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(view.result.current.suspended).toBe("keys"));
    await waitFor(() => expect(mute).toHaveBeenCalled());
  });

  it("resumes when Privy's dialog closes", async () => {
    const view = await goLiveScreen();
    const dialog = document.createElement("div");
    dialog.id = "privy-dialog";
    await act(async () => {
      document.body.appendChild(dialog);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(view.result.current.suspended).toBe("keys"));

    await act(async () => {
      dialog.remove();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(view.result.current.suspended).toBeNull());
    expect(view.result.current.phase).toBe("live");
  });

  it("suspends for a signing flow, which is a modal rather than a route", async () => {
    const view = await goLiveScreen();
    await act(async () => {
      const sheet = document.createElement("div");
      sheet.setAttribute(SUSPEND_ATTRIBUTE, "");
      document.body.appendChild(sheet);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(view.result.current.suspended).toBe("signing"));
  });

  it("never suspends a route that only looks sensitive", async () => {
    const view = await goLiveScreen();
    path.current = "/portfolio/backup-history";
    view.rerender();
    expect(view.result.current.suspended).toBeNull();
  });
});

describe("lifecycle", () => {
  it("reconciles when the browser's own Stop sharing is used", async () => {
    const view = await goLiveScreen();
    expect(view.result.current.phase).toBe("live");

    // The track's own ended event, which fires before the SDK notices.
    act(() => trackEvents.get("ended")?.());

    expect(view.result.current.phase).toBe("share-stopped");
    expect(view.result.current.surface).toBeNull();
  });

  it("turns amber while reconnecting instead of dying silently", async () => {
    const view = await goLiveScreen();
    act(() => roomEvents.get("reconnecting")?.());

    expect(view.result.current.connection).toBe("reconnecting");
    expect(view.result.current.live).toBe(true);

    act(() => roomEvents.get("reconnected")?.());
    expect(view.result.current.connection).toBe("connected");
    expect(view.result.current.reconnectingSince).toBeNull();
  });

  it("beacons an end when the tab goes away, so viewers see it end", async () => {
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true });
    await goLiveScreen();

    act(() => window.dispatchEvent(new Event("pagehide")));

    expect(sendBeacon).toHaveBeenCalledWith(
      "/api/market-square/streams/s-1/end",
      expect.anything()
    );
  });

  it("holds the video while the tab is hidden and keeps the session", async () => {
    const view = await goLiveScreen();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(mute).toHaveBeenCalled());
    expect(view.result.current.phase).toBe("live");
    visibility.mockRestore();
  });

  it("reports the room closing under it rather than showing a live badge", async () => {
    const view = await goLiveScreen();
    act(() => roomEvents.get("disconnected")?.(undefined));

    expect(view.result.current.phase).toBe("host-ended");
    expect(view.result.current.live).toBe(false);
  });

  it("counts viewers off the room, excluding the broadcaster", async () => {
    const view = await goLiveScreen();
    await waitFor(() => expect(view.result.current.viewers).toBe(3));
  });

  it("times the session from a wall-clock start, not from an accumulating tick", async () => {
    const view = await goLiveScreen();
    expect(view.result.current.startedAt).not.toBeNull();
    expect(view.result.current.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

describe("ending", () => {
  it("ends the Market Square stream and clears the session", async () => {
    const view = await goLiveScreen();
    await act(async () => view.result.current.stop());

    expect(client.endStream).toHaveBeenCalledWith("s-1");
    expect(view.result.current.phase).toBe("ended");
    expect(view.result.current.startedAt).toBeNull();
    expect(view.result.current.live).toBe(false);
  });

  it("surfaces the service's own reason when the end is refused", async () => {
    const view = await goLiveScreen();
    client.endStream.mockRejectedValueOnce(new Error("Stream already ended."));
    await act(async () => view.result.current.stop());

    // Publishing has stopped either way, so the phase says the end is
    // unconfirmed rather than claiming a clean stop.
    expect(view.result.current.phase).toBe("end-failed");
    expect(view.result.current.error).toBe("Stream already ended.");
    expect(view.result.current.live).toBe(false);
  });

  it("explains an end that failed with nothing to say", async () => {
    const view = await goLiveScreen();
    client.endStream.mockRejectedValueOnce(new Error(""));
    await act(async () => view.result.current.stop());

    expect(view.result.current.error).toMatch(/did not confirm/i);
  });
});

describe("the Ark-only path", () => {
  it("pre-selects this tab, so nothing outside Ark can be picked", async () => {
    const view = renderHook(() => useBroadcastSession(), { wrapper });
    await act(async () => {
      const capture = await view.result.current.captureScreen("motion", "ark-view");
      await view.result.current.goLiveWith({ target, mode: "ark", capture });
    });

    await waitFor(() => expect(view.result.current.phase).toBe("live"));
    const [constraints] = getDisplayMedia.mock.calls[0] as unknown as [
      { preferCurrentTab: boolean; video: Record<string, unknown> },
    ];
    expect(constraints.preferCurrentTab).toBe(true);
    expect(constraints.video.monitorTypeSurfaces).toBe("exclude");
  });

  // Viewers reported seeing a shared board with no broadcaster: the screen had
  // replaced the face rather than joining it. The camera now comes up in every
  // mode, screen shares included, and stays a toggle for anyone who would
  // rather be heard than seen.
  it("turns the camera on in every mode, so a shared screen never replaces the face", async () => {
    for (const mode of ["ark", "camera-ark", "screen"] as const) {
      setCameraEnabled.mockClear();
      const view = renderHook(() => useBroadcastSession(), { wrapper });
      await act(async () => {
        await view.result.current.goLiveWith({ target, mode, capture: [] });
      });

      expect(setCameraEnabled, `mode ${mode} should publish a camera track`).toHaveBeenCalledWith(
        true
      );
    }
  });

  it("still goes live when the camera is refused, because a screen share does not need one", async () => {
    setCameraEnabled.mockRejectedValueOnce(new Error("NotAllowedError"));
    const view = renderHook(() => useBroadcastSession(), { wrapper });
    await act(async () => {
      await view.result.current.goLiveWith({ target, mode: "screen", capture: [] });
    });

    expect(view.result.current.phase).toBe("live");
  });

  it("carries no deep link, because a portfolio is not a game", async () => {
    const view = renderHook(() => useBroadcastSession(), { wrapper });
    await act(async () => {
      await view.result.current.goLiveWith({ target, mode: "ark", capture: [] });
    });

    expect(client.createStream).toHaveBeenCalledWith(
      expect.objectContaining({ deepLink: undefined })
    );
  });
});

describe("mounting", () => {
  it("renders its children and demands a provider from its consumers", () => {
    const { container } = render(<div>page</div>, { wrapper });
    expect(container.textContent).toContain("page");
    expect(() => renderHook(() => useBroadcastSession())).toThrow(/BroadcastSessionProvider/);
  });
});
