import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));
const store = vi.hoisted(() => ({ followed: null as number | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("@/features/casino/lib/last-standing/followed-game", () => ({
  subscribeFollowedGame: () => () => {},
  followedGameSnapshot: () => store.followed,
  followedGameServerSnapshot: () => null,
}));

vi.mock("@/features/casino/components/last-standing/mini-timer", () => ({
  MiniTimerHost: () => <i data-testid="host" />,
}));

import { MiniTimerGate } from "@/features/casino/components/last-standing/mini-timer-gate";

describe("MiniTimerGate", () => {
  beforeEach(() => {
    navigation.pathname = "/dashboard";
    store.followed = null;
  });

  it("mounts nothing off the arcade with no game followed", async () => {
    render(<MiniTimerGate />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("host")).toBeNull();
  });

  it("mounts the host while a game is followed, on any route", async () => {
    store.followed = 42;
    render(<MiniTimerGate />);
    expect(await screen.findByTestId("host")).toBeInTheDocument();
  });

  // It used to mount on every Arkade route so the launcher's click handler
  // could reach the host inside the user gesture. That launcher is The Last
  // Man's tile, hidden on production, so an Arkade route with nothing followed
  // no longer pays for the wager stack.
  it("mounts nothing on an arcade route with no game followed", async () => {
    navigation.pathname = "/casino";
    render(<MiniTimerGate />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("host")).toBeNull();
  });
});
