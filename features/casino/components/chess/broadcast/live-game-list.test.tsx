import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveGameList } from "./live-game-list";
import type { ChessMatch } from "@/features/casino/lib/api/types";

function liveMatch(id: string, videoEnabled = false): ChessMatch {
  return {
    id,
    state: "in_progress",
    videoEnabled,
    white: {
      id: "white",
      username: "Amina",
      rating: 1742,
      countryCode: "NG",
      walletAddress: "0x1111111111111111111111111111111111111111",
    },
    black: {
      id: "black",
      username: "Mateo",
      rating: 1688,
      countryCode: "ES",
      walletAddress: "0x2222222222222222222222222222222222222222",
    },
    timeControl: "5+3",
    clockMode: "real_time",
    computer: null,
    fen: "",
    moves: [],
    clocks: { w: 300, b: 300 },
    clockUpdatedAt: "2026-08-23T00:00:00.000Z",
    turn: "w",
    result: null,
    drawOffered: null,
    takeback: { white: false, black: false, takebackable: false },
    rematch: { offeredBy: null, nextMatchId: null },
    timeExtensions: {
      allowed: false,
      used: 0,
      totalSeconds: 0,
      maxUses: 0,
      maxTotalSeconds: 0,
    },
    rating: undefined,
    stakeUsdc: null,
    wagerStatus: null,
    liveTopic: `chess.match.${id}`,
    createdAt: "2026-08-23T00:00:00.000Z",
  };
}

describe("LiveGameList", () => {
  it("links public video matches to the spectator board", () => {
    render(<LiveGameList matches={[liveMatch("public", true)]} ownedMatchIds={new Set()} />);

    expect(screen.getByText("🇳🇬 Amina (1742)")).toBeInTheDocument();
    expect(screen.getByText("Player video")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Watch/u })).toHaveAttribute(
      "href",
      "/casino/chess/watch?match=public"
    );
  });

  it("returns the seated player to their own live game", () => {
    render(<LiveGameList matches={[liveMatch("mine")]} ownedMatchIds={new Set(["mine"])} />);

    expect(screen.getByRole("link", { name: /Resume/u })).toHaveAttribute(
      "href",
      "/casino/chess/play?match=mine"
    );
  });
});
