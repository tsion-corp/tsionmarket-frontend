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
  attemptCoachLesson,
  attemptCoachTraining,
  continueComputerCoachReview,
  createChallenge,
  createComputerMatch,
  deleteMatchComment,
  fetchCoachHome,
  fetchCoachTraining,
  fetchComputerCoachState,
  fetchMatch,
  fetchMatchChat,
  fetchMatchComments,
  fetchMatchNote,
  fetchJoinableMatches,
  fetchLobbyChallenges,
  fetchLiveMatches,
  fetchOpenChallenges,
  issueMatchVideoToken,
  extendMatchTime,
  postMatchChatMessage,
  requestComputerCoachMove,
  requestComputerHint,
  requestMatchAnalysis,
  saveMatchNote,
  undoComputerCoachReview,
  updateCoachProfile,
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
    videoEnabled: over.videoEnabled ?? false,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("human challenge creation", () => {
  it("rates a free game while preserving its equal-clock extension option", async () => {
    chessClient.chessPost.mockResolvedValue(waitingMatch("rated-free", "2026-08-01T18:00:00.000Z"));

    await createChallenge({
      creator: "0x1111111111111111111111111111111111111111",
      timeControl: "5+0",
      mode: "invite",
      allowTimeExtensions: true,
    });

    expect(chessClient.chessPost).toHaveBeenCalledWith(
      "/matches",
      expect.objectContaining({
        rated: true,
        allow_time_extensions: true,
      })
    );
  });

  it("always enables match video even when the caller omits the legacy flag", async () => {
    chessClient.chessPost.mockResolvedValue(
      waitingMatch("video-game", "2026-08-01T18:00:00.000Z", { videoEnabled: true })
    );

    const result = await createChallenge({
      creator: "0x1111111111111111111111111111111111111111",
      timeControl: "10+0",
      mode: "invite",
    });

    expect(chessClient.chessPost).toHaveBeenCalledWith(
      "/matches",
      expect.objectContaining({ videoEnabled: true })
    );
    expect(result.match.videoEnabled).toBe(true);
    expect(result.challenge.videoEnabled).toBe(true);
  });

  it("requests a short-lived room token with the tournament seat when present", async () => {
    chessClient.chessPost.mockResolvedValue({
      serverUrl: "wss://video.example.test",
      participantToken: "token",
      roomName: "chess-video-game",
      participantIdentity: "0xabc",
      role: "player",
      expiresAt: "2026-08-01T18:10:00.000Z",
    });

    await issueMatchVideoToken("3f2504e0-4f89-11d3-9a0c-0305e82c3301", "Player-abcd");

    expect(chessClient.chessPost).toHaveBeenCalledWith(
      "/matches/3f2504e0-4f89-11d3-9a0c-0305e82c3301/video/token",
      { player: "Player-abcd" }
    );
  });
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

  it("keeps private computer games out of the public live list", async () => {
    chessClient.chessGet.mockResolvedValue({
      items: [
        activeMatch("human", { startedAt: new Date().toISOString() }),
        activeMatch("computer", {
          startedAt: new Date().toISOString(),
          computer: {
            player: "0x00000000000000000000000000000000000000b2",
            name: "Stockfish level 2",
            side: "black",
            level: 2,
          },
        }),
      ],
    });

    const live = await fetchLiveMatches();

    expect(live.map((match) => match.id)).toEqual(["human"]);
  });
});

describe("computer matches", () => {
  it("creates an unlimited game through the backend computer endpoint", async () => {
    chessClient.chessPost.mockResolvedValue(
      activeMatch("computer", {
        timeControl: { mode: "unlimited", initialSeconds: 600, incrementSeconds: 3 },
        computer: {
          player: "0x00000000000000000000000000000000000000b4",
          name: "Stockfish level 4",
          side: "black",
          level: 4,
        },
      })
    );

    const match = await createComputerMatch({
      player: "0xhost",
      level: 4,
      color: "white",
      timeMode: "unlimited",
    });

    expect(chessClient.chessPost).toHaveBeenCalledWith("/computer/matches", {
      player: "0xhost",
      level: 4,
      color: "white",
      time_mode: "unlimited",
    });
    expect(match.timeControl).toBe("Unlimited");
    expect(match.clockMode).toBe("unlimited");
    expect(match.computer).toMatchObject({ level: 4, side: "black" });
    expect(match.black?.username).toBe("Stockfish level 4");
  });

  it("forces staked computer games to unlimited time", async () => {
    chessClient.chessPost.mockResolvedValue(activeMatch("computer-staked"));

    await createComputerMatch({
      player: "0xhost",
      level: 8,
      color: "black",
      timeMode: "real_time",
      initialSeconds: 300,
      incrementSeconds: 3,
      stakeUsdc: "2.5",
      idempotencyKey: "computer-create-1",
    });

    expect(chessClient.chessPost).toHaveBeenCalledWith("/computer/matches", {
      player: "0xhost",
      level: 8,
      color: "black",
      time_mode: "unlimited",
      stake_usdc: "2.5",
      idempotency_key: "computer-create-1",
    });
  });

  it("persists coach mode on a free computer game", async () => {
    chessClient.chessPost.mockResolvedValue(activeMatch("computer-coached"));

    await createComputerMatch({
      player: "0xhost",
      level: 2,
      color: "white",
      timeMode: "unlimited",
      coachEnabled: true,
    });

    expect(chessClient.chessPost).toHaveBeenCalledWith("/computer/matches", {
      player: "0xhost",
      level: 2,
      color: "white",
      time_mode: "unlimited",
      coach_enabled: true,
    });
  });

  it("spends hint and time-extension credits through idempotent requests", async () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3310";
    chessClient.chessPost
      .mockResolvedValueOnce({
        id: "hint-1",
        matchId: id,
        ply: 4,
        suggestedUci: "g1f3",
        createdAt: "2026-08-13T01:00:00.000Z",
      })
      .mockResolvedValueOnce(activeMatch(id));

    await requestComputerHint(id, "0xhost", "hint-key-1");
    await extendMatchTime(id, "0xhost", 300, "extension-key-1");

    expect(chessClient.chessPost).toHaveBeenNthCalledWith(1, `/computer/matches/${id}/hint`, {
      player: "0xhost",
      idempotencyKey: "hint-key-1",
    });
    expect(chessClient.chessPost).toHaveBeenNthCalledWith(2, `/matches/${id}/time-extension`, {
      player: "0xhost",
      seconds: 300,
      idempotencyKey: "extension-key-1",
    });
  });
});

describe("server coach workflow", () => {
  const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3399";
  const review = {
    attemptId: "6f2504e0-4f89-11d3-9a0c-0305e82c3399",
    matchId: id,
    ply: 0,
    status: "review",
    classification: "mistake",
    motif: "tacticalMiss",
    attemptedUci: "f2f3",
    attemptedSan: "f3",
    message: "That move gave the position away. Compare it with the stronger continuation.",
    centipawnLoss: 180,
    winChanceLoss: 0.12,
    bestUci: "e2e4",
    bestSan: "e4",
    principalVariation: "e2e4 e7e5",
    canRetry: true,
    canOverride: true,
    canUndo: true,
    canContinue: true,
    actions: [
      { type: "choice", id: "undo", label: "Try again", action: "undo" },
      { type: "choice", id: "continue", label: "Continue", action: "continue" },
    ],
    matchState: null,
    createdAt: "2026-08-13T01:00:00.000Z",
  };

  it("uses the server review state and explicit continue/undo actions", async () => {
    chessClient.chessGet.mockResolvedValue({
      matchId: id,
      enabled: true,
      player: "0xhost",
      ply: 1,
      canMove: false,
      awaitingResponse: true,
      hintLevel: 0,
      pendingWarning: null,
      pendingReview: review,
      summary: null,
      actions: review.actions,
    });
    chessClient.chessPost.mockResolvedValue(review);

    await fetchComputerCoachState(id, "0xhost");
    await requestComputerCoachMove(id, "0xhost", "f2f3", 0, "coach-move-1");
    await continueComputerCoachReview(id, "0xhost", review.attemptId, 1);
    await undoComputerCoachReview(id, "0xhost", review.attemptId, 1);

    expect(chessClient.chessGet).toHaveBeenCalledWith(`/computer/matches/${id}/coach`, {
      player: "0xhost",
    });
    expect(chessClient.chessPost).toHaveBeenNthCalledWith(1, `/computer/matches/${id}/coach/move`, {
      player: "0xhost",
      uci: "f2f3",
      expectedPly: 0,
      idempotencyKey: "coach-move-1",
    });
    expect(chessClient.chessPost).toHaveBeenNthCalledWith(
      2,
      `/computer/matches/${id}/coach/continue`,
      { player: "0xhost", attemptId: review.attemptId, expectedPly: 1 }
    );
    expect(chessClient.chessPost).toHaveBeenNthCalledWith(3, `/computer/matches/${id}/coach/undo`, {
      player: "0xhost",
      attemptId: review.attemptId,
      expectedPly: 1,
    });
  });

  it("routes onboarding, lesson scoring, and mistake training through the backend", async () => {
    chessClient.chessGet.mockResolvedValue({ items: [] });
    chessClient.chessPut.mockResolvedValue({
      player: "0xhost",
      experience: "beginner",
      onboardingComplete: true,
      preferredMode: "lessons",
      createdAt: "2026-08-13T01:00:00.000Z",
      updatedAt: "2026-08-13T01:00:00.000Z",
    });
    chessClient.chessPost.mockResolvedValue({});

    await fetchCoachHome("0xhost");
    await fetchCoachTraining("0xhost", 12);
    await updateCoachProfile("0xhost", {
      experience: "beginner",
      onboardingComplete: true,
      preferredMode: "lessons",
    });
    await attemptCoachLesson("core.rook", "straight-lines", "0xhost", "d4d8", "lesson-1");
    await attemptCoachTraining("0xhost", id, 3, "e2e4", "training-1");

    expect(chessClient.chessGet).toHaveBeenNthCalledWith(1, "/players/0xhost/coach/home");
    expect(chessClient.chessGet).toHaveBeenNthCalledWith(2, "/players/0xhost/coach/training", {
      limit: 12,
    });
    expect(chessClient.chessPut).toHaveBeenCalledWith("/players/0xhost/coach/profile", {
      experience: "beginner",
      onboardingComplete: true,
      preferredMode: "lessons",
    });
    expect(chessClient.chessPost).toHaveBeenNthCalledWith(
      1,
      "/coach/lessons/core.rook/chapters/straight-lines/attempt",
      { player: "0xhost", uci: "d4d8", idempotencyKey: "lesson-1" }
    );
    expect(chessClient.chessPost).toHaveBeenNthCalledWith(
      2,
      `/players/0xhost/coach/training/${id}/3/attempt`,
      { uci: "e2e4", idempotencyKey: "training-1" }
    );
  });
});

describe("premium analysis", () => {
  it("requests the premium tier with a retry-safe credit key", async () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3311";
    chessClient.chessPost.mockResolvedValue({
      matchId: id,
      analysed: false,
      status: "queued",
      requestOrigin: "manual",
      requestedBy: "0xhost",
      requestCount: 1,
      depth: 21,
      tier: "premium",
      engineName: null,
      failure: null,
      queuedAt: "2026-08-13T01:00:00.000Z",
      startedAt: null,
      completedAt: null,
      updatedAt: "2026-08-13T01:00:00.000Z",
      createdAt: "2026-08-13T01:00:00.000Z",
      summaries: [],
      moves: [],
    });

    const analysis = await requestMatchAnalysis(id, "0xhost", {
      premium: true,
      idempotencyKey: "review-key-1",
    });

    expect(chessClient.chessPost).toHaveBeenCalledWith(`/matches/${id}/analysis/request`, {
      player: "0xhost",
      premium: true,
      idempotencyKey: "review-key-1",
    });
    expect(analysis.tier).toBe("premium");
  });
});

describe("match fetch reconciliation", () => {
  it("resets the creator clock to the server start when an opponent joins", async () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3300";
    chessClient.chessGet.mockResolvedValue(
      activeMatch(id, {
        ply: 0,
        clocks: { whiteMs: 300_000, blackMs: 300_000 },
        startedAt: "2026-08-01T18:01:00.000Z",
      })
    );
    const waiting = cachedMatch(id, [], {
      state: "awaiting_opponent",
      black: null,
      clockUpdatedAt: "2026-08-01T18:00:00.000Z",
    });

    const match = await fetchMatch(id, waiting);

    expect(match.state).toBe("in_progress");
    expect(match.clockUpdatedAt).toBe("2026-08-01T18:01:00.000Z");
  });

  it("uses the backend clock anchor on every browser snapshot", async () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3309";
    chessClient.chessGet.mockResolvedValue(
      activeMatch(id, {
        clockUpdatedAt: "2026-08-01T18:01:07.250Z",
      })
    );

    const match = await fetchMatch(
      id,
      cachedMatch(id, [], { clockUpdatedAt: "2026-08-01T18:00:00.000Z" })
    );

    expect(match.clockUpdatedAt).toBe("2026-08-01T18:01:07.250Z");
  });

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

  it("preserves clock-extension capability when a repair snapshot omits it", async () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3310";
    chessClient.chessGet.mockResolvedValue(activeMatch(id));
    const previous = cachedMatch(id, [], {
      timeExtensions: {
        allowed: true,
        used: 0,
        totalSeconds: 0,
        maxUses: 3,
        maxTotalSeconds: 1_800,
      },
    });

    const match = await fetchMatch(id, previous);

    expect(match.timeExtensions.allowed).toBe(true);
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
