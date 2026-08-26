import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  ChessBroadcastActions,
  ChessBroadcastState,
} from "@/features/casino/hooks/use-chess-broadcast";

const broadcast = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/features/casino/hooks/use-chess-broadcast", () => ({
  useChessBroadcast: () => broadcast.current,
}));

const { ChessBroadcastProvider, GoLivePanel } =
  await import("@/features/casino/components/chess/go-live-panel");

type Broadcast = ChessBroadcastState & ChessBroadcastActions;

const actions = {
  start: vi.fn(async () => {}),
  join: vi.fn(async () => {}),
  cancelJoin: vi.fn(async () => {}),
  approveSpeaker: vi.fn(async () => {}),
  declineSpeaker: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  resumeScreenShare: vi.fn(async () => {}),
  setCameraEnabled: vi.fn(async () => {}),
  recheckRole: vi.fn(async () => {}),
  applyForCreatorRole: vi.fn(async () => {}),
  dismissError: vi.fn(),
};

const liveElsewhere = {
  id: "s-other",
  ownerId: "u-2",
  title: "Chess: Ada vs Bo",
  description: null,
  status: "live" as const,
  startedAt: null,
  endedAt: null,
  endedReason: null,
  deepLink: { kind: "game" as const, ref: "chess:m-1" },
};

function mount(overrides: Partial<Broadcast>, matchOver = false) {
  broadcast.current = {
    phase: "idle",
    role: null,
    joinable: [],
    discovering: false,
    pendingSpeakers: [],
    resolving: [],
    supported: true,
    isCreator: true,
    roleUnavailable: false,
    stream: null,
    sharingScreen: false,
    sharingCamera: false,
    surface: null,
    error: null,
    cleanupWarning: null,
    busy: false,
    applying: false,
    ...actions,
    ...overrides,
  } satisfies Broadcast;
  return render(
    <ChessBroadcastProvider matchId="m-1" whiteName="Ada" blackName="Bo">
      <GoLivePanel matchOver={matchOver} />
    </ChessBroadcastProvider>
  );
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockClear();
});

describe("GoLivePanel state machine", () => {
  it("says the browser cannot share instead of offering a button that would fail", () => {
    mount({ supported: false });
    expect(screen.getByText(/cannot share a screen/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /go live/i })).toBeNull();
  });

  it("offers a retry when the role read failed, rather than dead-ending", async () => {
    mount({ roleUnavailable: true, isCreator: null });
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(actions.recheckRole).toHaveBeenCalledTimes(1);
  });

  it("says it is checking while the role is unknown", () => {
    mount({ isCreator: null });
    expect(screen.getByText(/Checking whether you can broadcast/i)).toBeInTheDocument();
  });

  it("routes a non-creator to the application instead of a failing go-live", async () => {
    mount({ phase: "not-creator", isCreator: false });
    expect(screen.queryByRole("button", { name: /^go live$/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /apply to be a creator/i }));
    expect(actions.applyForCreatorRole).toHaveBeenCalledTimes(1);
  });

  it("asks before the screen picker and only starts once the user continues", async () => {
    mount({});
    fireEvent.click(screen.getByRole("button", { name: /^go live$/i }));
    expect(actions.start).not.toHaveBeenCalled();
    expect(screen.getByText(/Before you share your screen/i)).toBeInTheDocument();
    expect(screen.getByText(/including notifications and other tabs/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /pick a surface/i }));
    expect(actions.start).toHaveBeenCalledTimes(1);
  });

  it("does not start when the user cancels the explanation", async () => {
    mount({});
    fireEvent.click(screen.getByRole("button", { name: /^go live$/i }));
    // The dialog labels its backdrop with the cancel label too, so there are two.
    const cancels = screen.getAllByRole("button", { name: "Cancel" });
    fireEvent.click(cancels[cancels.length - 1]);
    expect(actions.start).not.toHaveBeenCalled();
    expect(screen.queryByText(/Before you share your screen/i)).toBeNull();
  });

  it("never shows LIVE while starting, only once the screen is actually going out", () => {
    const { unmount } = mount({ phase: "starting" });
    expect(screen.queryByText("LIVE")).toBeNull();
    expect(screen.getByText(/Starting the broadcast/i)).toBeInTheDocument();
    unmount();

    mount({ phase: "live", sharingScreen: true, surface: "a browser tab" });
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText(/Sharing a browser tab/i)).toBeInTheDocument();
  });

  it("does not claim LIVE when the phase is live but nothing is publishing", () => {
    mount({ phase: "live", sharingScreen: false });
    expect(screen.queryByText("LIVE")).toBeNull();
  });

  it("offers a resume and an end after the browser stop-sharing bar was used", async () => {
    mount({ phase: "share-stopped" });
    expect(screen.getByText(/nothing is going out/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /share the board again/i }));
    expect(actions.resumeScreenShare).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /end broadcast/i }));
    expect(actions.stop).toHaveBeenCalledTimes(1);
  });

  it("toggles the camera through the hook", async () => {
    mount({ phase: "live", sharingScreen: true });
    fireEvent.click(screen.getByRole("switch"));
    expect(actions.setCameraEnabled).toHaveBeenCalledWith(true);
  });

  it("nudges the player to end a broadcast of a finished board", () => {
    mount({ phase: "live", sharingScreen: true }, true);
    expect(screen.getByText(/The match is over/i)).toBeInTheDocument();
  });

  it("offers going live again once ended", async () => {
    mount({ phase: "ended" });
    expect(screen.getByText(/has ended on Market Square/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /go live again/i }));
    expect(screen.getByText(/Before you share your screen/i)).toBeInTheDocument();
  });

  it("offers retrying the end, not going live, when the end was not confirmed", async () => {
    mount({ phase: "end-failed", error: "Market Square did not confirm." });
    expect(screen.queryByRole("button", { name: /go live/i })).toBeNull();
    expect(screen.getByText(/may still show as live there/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try ending again/i }));
    expect(actions.stop).toHaveBeenCalledTimes(1);
  });

  it("shows an upstream failure and lets the player dismiss it", async () => {
    mount({
      phase: "error",
      error: "Market Square would not create the stream: this account is not a creator yet.",
    });
    expect(screen.getByText(/not a creator yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(actions.dismissError).toHaveBeenCalledTimes(1);
  });

  it("shows a cleanup note under the failure without replacing it", () => {
    mount({
      phase: "error",
      error: "Market Square returned no browser publishing credentials.",
      cleanupWarning: "Nothing is going out from this page, but Market Square may still show it.",
    });
    expect(screen.getByText(/no browser publishing credentials/i)).toBeInTheDocument();
    expect(screen.getByText(/may still show it/i)).toBeInTheDocument();
  });

  it("disables every control while a call is in flight", () => {
    const { container } = mount({ phase: "live", sharingScreen: true, busy: true });
    const buttons = within(container).getAllByRole("button");
    expect(buttons.every((button) => button.hasAttribute("disabled"))).toBe(true);
  });
});

describe("GoLivePanel joining an existing broadcast", () => {
  it("offers to join what is already live instead of starting a rival stream", () => {
    mount({ joinable: [liveElsewhere] });
    expect(screen.getByRole("button", { name: /join chess: ada vs bo/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^go live$/i })).toBeNull();
  });

  it("joins through the hook when the button is used", () => {
    mount({ joinable: [liveElsewhere] });
    fireEvent.click(screen.getByRole("button", { name: /join chess: ada vs bo/i }));
    expect(actions.join).toHaveBeenCalledWith("s-other");
  });

  it("presents every live broadcast rather than picking one", () => {
    mount({
      joinable: [liveElsewhere, { ...liveElsewhere, id: "s-third", title: "Another angle" }],
    });
    expect(screen.getByRole("button", { name: /join chess: ada vs bo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join another angle/i })).toBeInTheDocument();
  });

  it("still lets a creator start their own instead", () => {
    mount({ joinable: [liveElsewhere], isCreator: true });
    fireEvent.click(screen.getByRole("button", { name: /start my own instead/i }));
    expect(screen.getByText(/Before you share your screen/i)).toBeInTheDocument();
  });

  it("does not offer a citizen a button that would be refused", () => {
    mount({ joinable: [liveElsewhere], isCreator: false });
    expect(screen.getByRole("button", { name: /join chess: ada vs bo/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start my own/i })).toBeNull();
  });

  it("says it is waiting, and never claims LIVE, while the host has not answered", () => {
    mount({ phase: "joining", role: "guest" });
    expect(screen.getByText(/Waiting for the host to let you in/i)).toBeInTheDocument();
    expect(screen.queryByText("LIVE")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /cancel request/i }));
    expect(actions.cancelJoin).toHaveBeenCalledTimes(1);
  });

  it("offers asking again after a decline", () => {
    mount({ phase: "join-declined", joinable: [liveElsewhere] });
    expect(screen.getByText(/did not let you into their broadcast/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ask again/i }));
    expect(actions.join).toHaveBeenCalledWith("s-other");
  });

  it("tells a guest the broadcast ended under them and offers a way back", () => {
    mount({ phase: "host-ended", isCreator: true });
    expect(screen.getByText(/broadcast you were in has ended/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start my own broadcast/i })).toBeInTheDocument();
  });

  it("shows a guest leaving, not ending, and offers their own screen share", () => {
    mount({ phase: "live", role: "guest", sharingCamera: true, stream: liveElsewhere });
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText(/publishing into Chess: Ada vs Bo/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /end broadcast/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /share the board too/i }));
    expect(actions.resumeScreenShare).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /leave broadcast/i }));
    expect(actions.stop).toHaveBeenCalledTimes(1);
  });
});

describe("GoLivePanel host moderation", () => {
  const waiting = [
    {
      id: "r-1",
      streamId: "s-1",
      userId: "u-2",
      status: "pending" as const,
      joinUrl: null,
      joinToken: null,
      expiresAt: null,
      profile: { id: "u-2", username: "bo", displayName: "Bo", avatarUrl: null },
    },
  ];

  it("shows the request inline, so the host never leaves the match to answer it", () => {
    mount({ phase: "live", role: "host", sharingScreen: true, pendingSpeakers: waiting });
    expect(screen.getByText(/Bo wants to join your broadcast/i)).toBeInTheDocument();
  });

  it("approves and declines through the hook", () => {
    mount({ phase: "live", role: "host", sharingScreen: true, pendingSpeakers: waiting });
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(actions.approveSpeaker).toHaveBeenCalledWith("r-1");
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    expect(actions.declineSpeaker).toHaveBeenCalledWith("r-1");
  });

  it("keeps the prompt visible when the host stopped sharing but is still live", () => {
    mount({ phase: "share-stopped", role: "host", pendingSpeakers: waiting });
    expect(screen.getByText(/Bo wants to join your broadcast/i)).toBeInTheDocument();
  });

  it("names a requester with no display name rather than showing a blank", () => {
    mount({
      phase: "live",
      role: "host",
      sharingScreen: true,
      pendingSpeakers: [{ ...waiting[0], profile: null }],
    });
    expect(screen.getByText(/Someone wants to join your broadcast/i)).toBeInTheDocument();
  });

  it("disables both answers while one is in flight", () => {
    mount({
      phase: "live",
      role: "host",
      sharingScreen: true,
      pendingSpeakers: waiting,
      resolving: ["r-1"],
    });
    expect(screen.getByRole("button", { name: /decline/i })).toBeDisabled();
  });
});

describe("GoLivePanel while discovery has not answered", () => {
  it("offers neither button until it knows whether somebody is already live", () => {
    mount({ discovering: true });
    expect(screen.getByText(/already being broadcast/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^go live$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^join/i })).toBeNull();
  });
});
