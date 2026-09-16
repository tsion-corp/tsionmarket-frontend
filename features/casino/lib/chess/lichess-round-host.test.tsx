import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChessMatch } from "@/features/casino/lib/api/types";

const roundState = vi.hoisted(() => ({
  current: {
    match: undefined,
    you: null,
    isLoading: true,
    error: null,
  },
}));

vi.mock("@/features/casino/hooks/use-casino-chess", () => ({
  useChessMatch: () => roundState.current,
}));

vi.mock("@/features/casino/lib/api/chess-ratings", () => ({
  fetchChessPlayerRatings: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import {
  anchoredRoundClocks,
  LichessRound,
  roundData,
} from "@/features/casino/components/chess-app/lichess-round";

const lobbyBotMatch: ChessMatch = {
  id: "lobby-bot-match",
  state: "in_progress",
  videoEnabled: false,
  white: {
    id: "human",
    username: "Abraham Anavheoba",
    rating: 108,
    walletAddress: "0x1111111111111111111111111111111111111111",
  },
  black: null,
  timeControl: "5+3",
  clockMode: "real_time",
  computer: {
    player: "0x00000000000000000000000000000000000000b1",
    name: "Haruto Sato",
    bot: true,
    countryCode: "JP",
    rating: 112,
    side: "black",
    level: 1,
    coachEnabled: false,
    hintsUsed: 0,
    wager: null,
  },
  variant: "standard",
  initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  chess960Position: null,
  fen: "rnbqkbnr/pppppppp/8/8/8/4P3/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  moves: ["e3"],
  clocks: { w: 298, b: 300 },
  clockUpdatedAt: "2026-09-13T11:50:16.000Z",
  turn: "b",
  result: null,
  drawOffered: null,
  takeback: { white: false, black: false, takebackable: true },
  rematch: { offeredBy: null, nextMatchId: null },
  timeExtensions: {
    allowed: false,
    used: 0,
    totalSeconds: 0,
    maxUses: 3,
    maxTotalSeconds: 1_800,
  },
  stakeUsdc: null,
  wagerStatus: null,
  liveTopic: "chess:match:lobby-bot-match",
  createdAt: "2026-09-13T11:49:00.000Z",
};

describe("LichessRound host", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '<main class="round"><div class="round__app"></div></main>',
      })
    );
  });

  it("keeps and hydrates the round host when the view arrives before the match", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={en}>
          <LichessRound matchId="30a4d5f7-93f6-4a86-bb9d-42c13d8257fd" seatName={null} />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(container.querySelector("#main-wrap .round__app")).toBeInTheDocument();
    });
    expect(container.querySelector("#main-wrap")).toHaveStyle({ display: "none" });
  });

  it("shows a lobby fallback opponent with its country flag and without a BOT title", () => {
    const data = roundData(lobbyBotMatch, "w");
    const opponent = data.opponent as {
      name: string;
      user?: { username: string; title?: string };
    };

    expect(lobbyBotMatch.computer?.bot).toBe(true);
    expect(opponent.name).toBe("🇯🇵 Haruto Sato");
    expect(opponent.user).toMatchObject({ username: "🇯🇵 Haruto Sato" });
    expect(opponent.user).not.toHaveProperty("title");
  });

  it("filters legal moves that do not belong to the authoritative FEN", () => {
    const match: ChessMatch = {
      ...lobbyBotMatch,
      round: {
        steps: [
          {
            ply: 1,
            uci: "e2e3",
            san: "e3",
            fen: lobbyBotMatch.fen,
            check: false,
            byPlayer: lobbyBotMatch.white?.id ?? null,
            clockMsRemaining: 298_000,
            createdAt: lobbyBotMatch.clockUpdatedAt,
          },
        ],
        legalMoves: ["e2e4", "e7e5"],
        check: false,
        serverTime: lobbyBotMatch.clockUpdatedAt,
      },
    };

    const data = roundData(match, "b");

    expect(data.possibleMoves).toEqual({ e7: "e5" });
    expect((data.pref as { voiceMove: boolean }).voiceMove).toBe(false);
  });

  it("anchors the active clock to the server update time", () => {
    const now = Date.parse(lobbyBotMatch.clockUpdatedAt) + 2_750;

    expect(anchoredRoundClocks(lobbyBotMatch, now)).toEqual({ w: 298, b: 297.25 });
  });
});
