import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ChessMatch } from "@/features/casino/lib/api/types";
import messages from "@/messages/en.json";

const history = vi.hoisted(() => ({ matches: [] as ChessMatch[] }));

vi.mock("@/features/casino/hooks/use-casino-chess", () => ({
  useChessHistory: () => ({
    matches: history.matches,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/features/casino/hooks/use-casino-wallet", () => ({
  useCasinoWallet: () => ({ connected: false, address: null }),
}));

vi.mock("@/features/casino/lib/api/chess", () => ({ fetchPgn: vi.fn() }));

import { HistorySection } from "@/features/casino/components/chess/history-section";

const unlimitedMatch: ChessMatch = {
  id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  state: "in_progress",
  videoEnabled: false,
  white: {
    id: "white",
    username: "Abraham",
    rating: null,
    walletAddress: "0x1111111111111111111111111111111111111111",
  },
  black: {
    id: "black",
    username: "Stockfish level 8",
    rating: null,
    walletAddress: "0x00000000000000000000000000000000000000b8",
  },
  timeControl: "Unlimited",
  clockMode: "unlimited",
  computer: null,
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  moves: [],
  clocks: { w: 600, b: 600 },
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
    maxUses: 3,
    maxTotalSeconds: 1800,
  },
  stakeUsdc: null,
  wagerStatus: null,
  liveTopic: "chess:match:3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  createdAt: "2026-08-23T00:00:00.000Z",
};

describe("HistorySection", () => {
  it("renders an unlimited match without parsing it as a numeric clock", () => {
    history.matches = [unlimitedMatch];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <HistorySection />
      </NextIntlClientProvider>
    );

    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(screen.queryByText("Unlimited Rapid")).not.toBeInTheDocument();
  });
});
