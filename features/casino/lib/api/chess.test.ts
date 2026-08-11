import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChessMatchWire } from "@/features/casino/lib/api/chess-wire";
import type { ChessMatch } from "@/features/casino/lib/api/types";

const chessClient = vi.hoisted(() => ({
  chessGet: vi.fn(),
  chessPost: vi.fn(),
  chessPut: vi.fn(),
  chessDelete: vi.fn(),
}));

vi.mock("@/features/casino/lib/api/chess-client", () => chessClient);

import {
  deleteMatchComment,
  fetchMatch,
  fetchMatchChat,
  fetchMatchComments,
  fetchMatchNote,
  fetchJoinableMatches,
  fetchLobbyChallenges,
  fetchLiveMatches,
  fetchOpenChallenges,
  postMatchChatMessage,
  saveMatchNote,
  upsertMatchComment,
} from "@/features/casino/lib/api/chess";

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

function activeMatch(id: string, over: Partial<ChessMatchWire> = {}): ChessMatchWire {
  return {
    ...waitingMatch(id, "2026-08-01T18:00:00.000Z", {
      status: "active",
      black: "0xguest",
      startedAt: "2026-08-01T18:01:00.000Z",
      clocks: { whiteMs: 295_000, blackMs: 294_000 },
      ...over,
    }),
  };
}

function cachedMatch(id: string, moves: string[], over: Partial<ChessMatch> = {}): ChessMatch {
  return {
    id,
    state: "in_progress",
    white: { id: "0xhost", username: "0xhost", rating: 0, walletAddress: "0xhost" },
    black: { id: "0xguest", username: "0xguest", rating: 0, walletAddress: "0xguest" },
    timeControl: "5+3",
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    moves,
    clocks: { w: 295, b: 294 },
    clockUpdatedAt: "2026-08-01T18:02:00.000Z",
    turn: "w",
    result: null,
    drawOffered: null,
    takeback: { white: false, black: false, takebackable: true },
    rematch: { offeredBy: null, nextMatchId: null },
    stakeUsdc: null,
    wagerStatus: null,
    liveTopic: `chess:match:${id}`,
    createdAt: "2026-08-01T18:00:00.000Z",
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

describe("chess live-match filters", () => {
  it("drops active matches that have outlived their total clock budget", async () => {
    chessClient.chessGet.mockResolvedValue({
      items: [
        activeMatch("fresh", {
          ply: 8,
          startedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
          timeControl: { initialSeconds: 300, incrementSeconds: 3 },
        }),
        activeMatch("stale", {
          ply: 8,
          startedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
          timeControl: { initialSeconds: 300, incrementSeconds: 3 },
        }),
      ],
    });

    const live = await fetchLiveMatches();

    expect(live.map((match) => match.id)).toEqual(["fresh"]);
  });
});

describe("match fetch reconciliation", () => {
  it("reuses cached san history when the server ply already matches it", async () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    chessClient.chessGet.mockImplementation(async (path: string) => {
      if (path === `/matches/${id}`) {
        return activeMatch(id, {
          ply: 1,
          fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
          turn: "black",
        });
      }
      throw new Error(`unexpected path ${path}`);
    });

    const previous = cachedMatch(id, ["e4"], {
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      turn: "b",
    });
    const match = await fetchMatch(id, previous);

    expect(chessClient.chessGet).toHaveBeenCalledTimes(1);
    expect(match.moves).toEqual(["e4"]);
    expect(match.clockUpdatedAt).toBe("2026-08-01T18:02:00.000Z");
  });

  it("reloads /moves only when the cached history is short", async () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3302";
    chessClient.chessGet.mockImplementation(async (path: string) => {
      if (path === `/matches/${id}`) {
        return activeMatch(id, {
          ply: 2,
          fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
          turn: "white",
        });
      }
      if (path === `/matches/${id}/moves`) {
        return {
          moves: [
            {
              ply: 1,
              uci: "e2e4",
              san: "e4",
              fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
              byPlayer: "0xhost",
              clockMsRemaining: 299_000,
              createdAt: "2026-08-01T18:01:30.000Z",
            },
            {
              ply: 2,
              uci: "e7e5",
              san: "e5",
              fenAfter: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
              byPlayer: "0xguest",
              clockMsRemaining: 298_000,
              createdAt: "2026-08-01T18:02:05.000Z",
            },
          ],
        };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const match = await fetchMatch(id, cachedMatch(id, ["e4"]));

    expect(chessClient.chessGet).toHaveBeenCalledTimes(2);
    expect(match.moves).toEqual(["e4", "e5"]);
    expect(match.clockUpdatedAt).toBe("2026-08-01T18:02:05.000Z");
  });
});

describe("match social api", () => {
  it("reads chat history from the selected room", async () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3303";
    chessClient.chessGet.mockResolvedValue({
      items: [
        {
          id: 1,
          matchId: id,
          room: "spectator",
          author: "0xhost",
          text: "gl hf",
          createdAt: "2026-08-02T20:00:00.000Z",
        },
      ],
    });

    const items = await fetchMatchChat(id, { room: "spectator", limit: 20 });

    expect(chessClient.chessGet).toHaveBeenCalledWith(
      `/matches/${id}/chat`,
      { room: "spectator", limit: "20" },
      { requireAuth: false }
    );
    expect(items[0]).toMatchObject({ id: 1, room: "spectator", text: "gl hf" });
  });

  it("posts chat messages through the authenticated write path", async () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3304";
    chessClient.chessPost.mockResolvedValue({
      id: 2,
      matchId: id,
      room: "player",
      author: "0xhost",
      text: "ready",
      createdAt: "2026-08-02T20:01:00.000Z",
    });

    const line = await postMatchChatMessage(id, "player", "ready");

    expect(chessClient.chessPost).toHaveBeenCalledWith(`/matches/${id}/chat`, {
      room: "player",
      text: "ready",
    });
    expect(line.author).toBe("0xhost");
  });

  it("loads and saves the viewer's private match note", async () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3305";
    chessClient.chessGet.mockResolvedValue({
      matchId: id,
      player: "0xhost",
      text: "prep",
      createdAt: "2026-08-02T20:02:00.000Z",
      updatedAt: "2026-08-02T20:03:00.000Z",
    });
    chessClient.chessPut.mockResolvedValue({
      matchId: id,
      player: "0xhost",
      text: "updated prep",
      createdAt: "2026-08-02T20:02:00.000Z",
      updatedAt: "2026-08-02T20:04:00.000Z",
    });

    const note = await fetchMatchNote(id);
    const saved = await saveMatchNote(id, "updated prep");

    expect(chessClient.chessGet).toHaveBeenCalledWith(`/matches/${id}/note`, undefined, {
      requireAuth: true,
    });
    expect(chessClient.chessPut).toHaveBeenCalledWith(`/matches/${id}/note`, {
      text: "updated prep",
    });
    expect(note.text).toBe("prep");
    expect(saved.text).toBe("updated prep");
  });

  it("loads, upserts, and deletes current-position comments", async () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3306";
    chessClient.chessGet.mockResolvedValue({
      items: [
        {
          id: "c1",
          matchId: id,
          ply: 3,
          fen: "fen",
          author: "0xhost",
          text: "idea",
          createdAt: "2026-08-02T20:05:00.000Z",
          updatedAt: "2026-08-02T20:05:00.000Z",
        },
      ],
    });
    chessClient.chessPost.mockResolvedValue({
      id: "c2",
      matchId: id,
      ply: 3,
      fen: "fen",
      author: "0xhost",
      text: "new idea",
      createdAt: "2026-08-02T20:06:00.000Z",
      updatedAt: "2026-08-02T20:06:00.000Z",
    });
    chessClient.chessDelete.mockResolvedValue({
      id: "c2",
      matchId: id,
      ply: 3,
      fen: "fen",
      author: "0xhost",
      text: "new idea",
      createdAt: "2026-08-02T20:06:00.000Z",
      updatedAt: "2026-08-02T20:06:00.000Z",
    });

    const items = await fetchMatchComments(id, 3);
    const saved = await upsertMatchComment(id, { ply: 3, text: "new idea" });
    const deleted = await deleteMatchComment(id, "c2");

    expect(chessClient.chessGet).toHaveBeenCalledWith(`/matches/${id}/comments`, { ply: "3" });
    expect(chessClient.chessPost).toHaveBeenCalledWith(`/matches/${id}/comments`, {
      ply: 3,
      text: "new idea",
    });
    expect(chessClient.chessDelete).toHaveBeenCalledWith(`/matches/${id}/comments/c2`, {});
    expect(items).toHaveLength(1);
    expect(saved.id).toBe("c2");
    expect(deleted.id).toBe("c2");
  });
});
