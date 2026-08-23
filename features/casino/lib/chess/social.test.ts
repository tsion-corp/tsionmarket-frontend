import { describe, it, expect } from "vitest";
import { matchActorLabel, playerIdentityLabel } from "@/features/casino/lib/chess/social";
import type { ChessMatch, ChessPlayer } from "@/features/casino/lib/api/types";

const WHITE = "0x1111111111111111111111111111111111111111";
const BLACK = "0x2222222222222222222222222222222222222222";
const STRANGER = "0x3333333333333333333333333333333333333333";

const match = {
  white: { walletAddress: WHITE, username: "whitey" },
  black: { walletAddress: BLACK, username: "blacky" },
} as unknown as ChessMatch;

const base = {
  match,
  whiteDisplayName: "White Player",
  blackDisplayName: "Black Player",
  youLabel: "You",
};

describe("matchActorLabel", () => {
  it("labels the viewer's own lines as You", () => {
    expect(matchActorLabel({ ...base, actor: WHITE, walletAddress: WHITE })).toBe("You");
    expect(
      matchActorLabel({
        ...base,
        actor: WHITE.toUpperCase().replace("0X", "0x"),
        walletAddress: WHITE,
      })
    ).toBe("You");
  });

  it("labels the seated players by their display names", () => {
    expect(matchActorLabel({ ...base, actor: WHITE, walletAddress: BLACK })).toBe("White Player");
    expect(matchActorLabel({ ...base, actor: BLACK, walletAddress: WHITE })).toBe("Black Player");
  });

  it("never labels a stranger's line with the viewer's identity", () => {
    const label = matchActorLabel({ ...base, actor: STRANGER, walletAddress: WHITE });
    expect(label).toBe("0x3333…3333");
    expect(label).not.toBe("You");
  });

  it("shows a tournament seat name as-is", () => {
    expect(matchActorLabel({ ...base, actor: "GrandmasterFlash", walletAddress: WHITE })).toBe(
      "GrandmasterFlash"
    );
  });

  it("labels the viewer as spectator by wallet when they are not seated", () => {
    expect(matchActorLabel({ ...base, actor: STRANGER, walletAddress: STRANGER })).toBe("You");
  });
});

describe("playerIdentityLabel", () => {
  it("shows the country and rating without treating provisional status as an unknown rating", () => {
    const player = {
      rating: 1_647,
      provisional: true,
      countryCode: "NG",
    } as ChessPlayer;

    expect(playerIdentityLabel("abrahambre", player)).toBe("🇳🇬 abrahambre (1647)");
  });
});
