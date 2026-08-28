import { beforeEach, describe, expect, it, vi } from "vitest";

const chessClient = vi.hoisted(() => ({
  chessGet: vi.fn(),
  chessPost: vi.fn(),
}));

vi.mock("@/features/casino/lib/api/chess-client", () => chessClient);

import { createSwiss } from "@/features/casino/lib/api/swiss";

beforeEach(() => vi.clearAllMocks());

describe("Swiss api", () => {
  it("creates a high-stakes event with the fixed pool policy", async () => {
    chessClient.chessPost.mockResolvedValue({
      id: "4dd9f506-194f-4e39-9b39-adee3e86e26f",
      name: "Friday Swiss",
      organizer: "0x001122-2233",
      game: "chess",
      status: "created",
      round: 0,
      nbRounds: 3,
      participantCount: 0,
      ongoingCount: 0,
      timeControl: { mode: "real_time", initialSeconds: 300, incrementSeconds: 3 },
      entryFeeUsdc: "2",
      maxPlayers: 16,
      prizePolicy: "highStakes",
      prizePoolBps: 5_000,
      platformShareBps: 5_000,
      minimumPlayers: 4,
      winner: null,
      createdAt: "2026-08-13T01:00:00.000Z",
      startedAt: null,
      finishedAt: null,
    });

    const result = await createSwiss({
      organizer: "0x001122-2233",
      name: "  Friday Swiss  ",
      game: "chess",
      nbRounds: 3,
      initialSeconds: 300,
      incrementSeconds: 3,
      entryFeeUsdc: "2",
      maxPlayers: 16,
      prizePolicy: "highStakes",
    });

    expect(chessClient.chessPost).toHaveBeenCalledWith("/swiss", {
      organizer: "0x001122-2233",
      name: "Friday Swiss",
      game: "chess",
      nbRounds: 3,
      initialSeconds: 300,
      incrementSeconds: 3,
      entryFeeUsdc: "2",
      maxPlayers: 16,
      prizePolicy: "highStakes",
    });
    expect(result).toMatchObject({
      prizePolicy: "highStakes",
      entryFeeUsdc: "2",
      minimumPlayers: 4,
    });
  });

  it("creates a 10,000-player Champions event with knockout settings", async () => {
    chessClient.chessPost.mockResolvedValue({
      id: "4dd9f506-194f-4e39-9b39-adee3e86e26f",
      name: "World Champions Cup",
      organizer: "0x001122-2233",
      game: "chess",
      status: "created",
      format: "champions",
      phase: "registration",
      round: 0,
      nbRounds: 8,
      leagueRounds: 0,
      participantCount: 0,
      ongoingCount: 0,
      timeControl: { mode: "real_time", initialSeconds: 300, incrementSeconds: 0 },
      entryFeeUsdc: "0",
      maxPlayers: 10_000,
      winner: null,
      createdAt: "2026-08-28T01:00:00.000Z",
      startedAt: null,
      finishedAt: null,
    });

    const result = await createSwiss({
      organizer: "0x001122-2233",
      name: "World Champions Cup",
      game: "chess",
      format: "champions",
      nbRounds: 8,
      initialSeconds: 300,
      incrementSeconds: 0,
      maxPlayers: 10_000,
      knockoutGamesPerTie: 2,
    });

    expect(chessClient.chessPost).toHaveBeenCalledWith(
      "/swiss",
      expect.objectContaining({
        format: "champions",
        maxPlayers: 10_000,
        knockoutGamesPerTie: 2,
      })
    );
    expect(result).toMatchObject({
      format: "champions",
      phase: "registration",
      maxPlayers: 10_000,
    });
  });
});
