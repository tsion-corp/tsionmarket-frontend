import { describe, expect, it } from "vitest";
import { resolveViewerColor } from "@/features/casino/lib/chess/viewer";
import type { ChessMatch } from "@/features/casino/lib/api/types";

function match(over: Partial<ChessMatch> = {}): ChessMatch {
  return {
    id: "m1",
    state: "in_progress",
    videoEnabled: over.videoEnabled ?? false,
    white: {
      id: "0xDD0737-6C2E",
      username: "0xDD0737-6C2E",
      rating: 0,
      walletAddress: "0xDD0737-6C2E",
    },
    black: {
      id: "0x235e47-6278",
      username: "0x235e47-6278",
      rating: 0,
      walletAddress: "0x235e47-6278",
    },
    timeControl: "5+0",
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    moves: [],
    clocks: { w: 300, b: 300 },
    clockUpdatedAt: "2026-08-02T00:00:00.000Z",
    turn: "w",
    result: null,
    drawOffered: null,
    takeback: { white: false, black: false, takebackable: false },
    rematch: { offeredBy: null, nextMatchId: null },
    stakeUsdc: null,
    wagerStatus: null,
    liveTopic: "chess:match:m1",
    createdAt: "2026-08-02T00:00:00.000Z",
    ...over,
    clockMode: over.clockMode ?? "real_time",
    computer: over.computer ?? null,
    timeExtensions: over.timeExtensions ?? {
      allowed: false,
      used: 0,
      totalSeconds: 0,
      maxUses: 3,
      maxTotalSeconds: 1_800,
    },
  };
}

describe("resolveViewerColor", () => {
  it("uses the wallet address on normal wallet-backed games", () => {
    expect(
      resolveViewerColor(match(), "0x235e4742935226A09D79916f9d08f27e16596278", null)
    ).toBeNull();
    expect(
      resolveViewerColor(
        match({
          black: {
            id: "0x235e4742935226A09D79916f9d08f27e16596278",
            username: "0x235e…6278",
            rating: 0,
            walletAddress: "0x235e4742935226A09D79916f9d08f27e16596278",
          },
        }),
        "0x235e4742935226A09D79916f9d08f27e16596278",
        null
      )
    ).toBe("b");
  });

  it("falls back to the carried swiss seat name on managed boards", () => {
    expect(
      resolveViewerColor(match(), "0x235e4742935226A09D79916f9d08f27e16596278", "0x235e47-6278")
    ).toBe("b");
    expect(
      resolveViewerColor(match(), "0xDD0737edCc438E4E4F4532E1D3d1cdCBEBae6C2E", "0xDD0737-6C2E")
    ).toBe("w");
  });
});
