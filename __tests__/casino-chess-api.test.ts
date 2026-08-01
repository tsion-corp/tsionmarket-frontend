import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChessMatchWire } from "@/lib/casino/api/chess-wire";

const chessClient = vi.hoisted(() => ({
  chessGet: vi.fn(),
  chessPost: vi.fn(),
}));

vi.mock("@/lib/casino/api/chess-client", () => chessClient);

import {
  fetchJoinableMatches,
  fetchLobbyChallenges,
  fetchOpenChallenges,
} from "@/lib/casino/api/chess";

function waitingMatch(
  id: string,
  createdAt: string,
  over: Partial<ChessMatchWire> = {}
): ChessMatchWire {
  return {
    id,
    status: "waiting",
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    turn: "white",
    ply: 0,
    timeControl: { initialSeconds: 300, incrementSeconds: 3 },
    clocks: { whiteMs: 300_000, blackMs: 300_000 },
    white: "0xhost",
    black: null,
    drawOfferBy: null,
    result: null,
    resultReason: null,
    wager: null,
    createdAt,
    startedAt: null,
    finishedAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("chess waiting-match filters", () => {
  it("drops stale waiting games from the public lobby", async () => {
    chessClient.chessGet.mockResolvedValue({
      items: [
        waitingMatch("fresh", new Date(Date.now() - 10 * 60 * 1000).toISOString()),
        waitingMatch("stale", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()),
      ],
    });

    const challenges = await fetchOpenChallenges();

    expect(challenges.map((challenge) => challenge.id)).toEqual(["fresh"]);
  });

  it("keeps quick match off stale seats and the caller's own seat", async () => {
    chessClient.chessGet.mockResolvedValue({
      items: [
        waitingMatch("stale", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()),
        waitingMatch("mine", new Date(Date.now() - 5 * 60 * 1000).toISOString(), {
          white: "0xabc",
        }),
        waitingMatch("fresh", new Date(Date.now() - 5 * 60 * 1000).toISOString(), {
          white: "0xdef",
        }),
      ],
    });

    const joinable = await fetchJoinableMatches("0xAbC");

    expect(joinable.map((match) => match.id)).toEqual(["fresh"]);
  });

  it("keeps the caller's own waiting game resumable while hiding stale public seats", async () => {
    chessClient.chessGet.mockResolvedValue({
      items: [
        waitingMatch("mine-stale", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), {
          white: "0xabc",
        }),
        waitingMatch("other-stale", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), {
          white: "0xdef",
        }),
        waitingMatch("other-fresh", new Date(Date.now() - 5 * 60 * 1000).toISOString(), {
          white: "0xdef",
        }),
      ],
    });

    const lobby = await fetchLobbyChallenges("0xAbC");

    expect(lobby.myOpenGames.map((challenge) => challenge.id)).toEqual(["mine-stale"]);
    expect(lobby.challenges.map((challenge) => challenge.id)).toEqual(["other-fresh"]);
  });
});
