// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// chess_game_started used to fire only in the accept path, so the player who
// created a game, and every auto-paired game, never reported its start. Both
// players pass through the play screen, so the start is reported from there,
// once per match on a device.

const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: analytics.track }));

import { useChessStartReport } from "@/features/casino/hooks/use-chess-start-report";

type Match = Parameters<typeof useChessStartReport>[0];
const match = (over: Partial<NonNullable<Match>> = {}) =>
  ({ id: "m1", state: "in_progress", stakeUsdc: "5", computer: null, ...over }) as Match;

beforeEach(() => {
  analytics.track.mockClear();
  window.localStorage.clear();
});

describe("useChessStartReport", () => {
  it("reports a player's game once it is under way, with its stake and id", () => {
    renderHook(() => useChessStartReport(match(), "w"));
    expect(analytics.track).toHaveBeenCalledWith("chess_game_started", {
      game_id: "m1",
      amount_usd: 5,
      opponent_type: "human",
    });
  });

  it("does not report a game that has not started, or one being watched", () => {
    renderHook(() => useChessStartReport(match({ state: "waiting" as never }), "w"));
    renderHook(() => useChessStartReport(match(), null));
    expect(analytics.track).not.toHaveBeenCalled();
  });

  it("reports a match once, across re-renders and a reload", () => {
    const first = renderHook(() => useChessStartReport(match(), "b"));
    first.rerender();
    first.unmount();
    renderHook(() => useChessStartReport(match(), "b"));
    expect(analytics.track).toHaveBeenCalledTimes(1);
  });

  it("takes a computer game's stake from its wager, and names the bot", () => {
    renderHook(() =>
      useChessStartReport(
        match({
          stakeUsdc: null,
          computer: { wager: { stakeUsdc: "2.5" }, level: 4 } as never,
        }),
        "w"
      )
    );
    expect(analytics.track).toHaveBeenCalledWith("chess_game_started", {
      game_id: "m1",
      amount_usd: 2.5,
      mode: "vs_computer",
      opponent_type: "bot",
      bot_level: 4,
    });
  });

  it("leaves the bot level off when the server reports one outside 1 to 8", () => {
    // Absent beats a number the catalog has no meaning for.
    renderHook(() =>
      useChessStartReport(
        match({ stakeUsdc: null, computer: { wager: null, level: 20 } as never }),
        "w"
      )
    );
    const [, props] = analytics.track.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(props).not.toHaveProperty("bot_level");
    expect(props).toMatchObject({ opponent_type: "bot" });
  });
});
