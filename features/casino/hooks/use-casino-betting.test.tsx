import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bettingApi = vi.hoisted(() => ({
  fetchMarketOdds: vi.fn(),
  fetchMyBets: vi.fn(),
  placeBet: vi.fn(),
}));

vi.mock("@/features/casino/lib/api/betting", () => bettingApi);
vi.mock("@/features/casino/hooks/use-chess-cashier", () => ({
  CASHIER_KEYS: {
    balance: (wallet: string) => ["casino", "chess", "cashier", "balance", wallet],
  },
}));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));

import { BETTING_KEYS, useMatchMarket } from "@/features/casino/hooks/use-casino-betting";

const finalMarket = (status: "settled" | "voided") => ({
  status,
  total: status === "settled" ? "3" : "0",
  outcomes: {
    white: { pool: status === "settled" ? "2" : "0", odds: null },
    draw: { pool: "0", odds: null },
    black: { pool: status === "settled" ? "1" : "0", odds: null },
  },
  winningOutcome: status === "settled" ? "black" : null,
  voidReason: status === "voided" ? "no_winners_backed" : null,
});

describe("useMatchMarket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bettingApi.fetchMyBets.mockResolvedValue([]);
  });

  it.each(["settled", "voided"] as const)(
    "refreshes spectator bets and cashier balance when a market becomes %s",
    async (status) => {
      bettingApi.fetchMarketOdds.mockResolvedValue(finalMarket(status));
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useMatchMarket("m1", "0xabc"), { wrapper });

      await waitFor(() => expect(result.current.odds?.status).toBe(status));
      await waitFor(() => {
        expect(invalidate).toHaveBeenCalledWith({
          queryKey: BETTING_KEYS.myBets("m1", "0xabc"),
        });
        expect(invalidate).toHaveBeenCalledWith({
          queryKey: ["casino", "chess", "cashier", "balance", "0xabc"],
        });
      });
    }
  );
});
