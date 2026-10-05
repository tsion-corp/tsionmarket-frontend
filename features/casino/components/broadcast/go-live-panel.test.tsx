import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type {
  GameBroadcastActions,
  GameBroadcastState,
} from "@/features/casino/hooks/use-game-broadcast";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import {
  GameBroadcastProvider,
  GoLivePanel,
} from "@/features/casino/components/broadcast/go-live-panel";

type Broadcast = GameBroadcastState & GameBroadcastActions;

const noop = vi.fn(async () => {});

function mount(overrides: Partial<Broadcast>) {
  const broadcast = {
    phase: "idle",
    role: null,
    joinable: [],
    discovering: false,
    pendingSpeakers: [],
    resolving: [],
    supported: true,
    isCreator: null,
    roleUnavailable: false,
    signedOut: false,
    stream: null,
    sharingScreen: false,
    sharingCamera: false,
    surface: null,
    error: null,
    cleanupWarning: null,
    busy: false,
    applying: false,
    start: noop,
    join: noop,
    cancelJoin: noop,
    approveSpeaker: noop,
    declineSpeaker: noop,
    stop: noop,
    resumeScreenShare: noop,
    setCameraEnabled: noop,
    recheckRole: noop,
    applyForCreatorRole: noop,
    dismissError: vi.fn(),
    ...overrides,
  } as Broadcast;
  render(
    <GameBroadcastProvider broadcast={broadcast} copy={{ subject: "the game", finishedNotice: "" }}>
      <GoLivePanel />
    </GameBroadcastProvider>
  );
}

describe("GoLivePanel without a session", () => {
  it("asks for a sign-in instead of checking a role it cannot read", () => {
    mount({ signedOut: true });
    expect(screen.getByText("gate.broadcast")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "signIn" })).toBeInTheDocument();
    expect(screen.queryByText(/Checking whether you can broadcast/)).toBeNull();
  });
});
