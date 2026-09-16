import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock("@tanstack/react-query", () => ({
  useMutation: vi.fn(),
  useQuery: query.useQuery,
  useQueryClient: vi.fn(),
}));
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    user: { id: "user-1" },
    ready: true,
    authenticated: true,
  }),
}));
vi.mock("@/features/casino/lib/api/cashier", () => ({
  cashierLockBuckets: () => ({ match: "0", swiss: "0", bet: "0", lottery: "0", other: "0" }),
  confirmChessDeposit: vi.fn(),
  createChessWithdrawal: vi.fn(),
  feePctFromBps: (bps: number) => bps / 100,
  fetchCashierConfig: vi.fn(),
  fetchChessBalance: vi.fn(),
  isCashierAccessDenied: () => false,
  isCashierUnavailable: () => false,
  isChessDepositPending: () => false,
  USDC_DECIMALS: 6,
}));
vi.mock("@/hooks/use-withdraw", () => ({ useSendToken: vi.fn() }));
vi.mock("@/lib/user", () => ({
  getWalletAddress: () => "0x0000000000000000000000000000000000000001",
}));

import {
  CASHIER_BALANCE_POLL_MS,
  CASHIER_BALANCE_STALE_MS,
  useChessCashierStatus,
} from "@/features/casino/hooks/use-chess-cashier";

describe("useChessCashierStatus", () => {
  beforeEach(() => {
    query.useQuery.mockReset();
    query.useQuery
      .mockReturnValueOnce({
        isSuccess: true,
        data: { platformFeeBps: 1_000 },
        error: null,
      })
      .mockReturnValueOnce({
        isLoading: false,
        data: { availableUsdc: "1", lockedUsdc: "0", totalUsdc: "1" },
        error: null,
      });
  });

  it("uses a slow foreground-only repair poll for the cashier balance", () => {
    renderHook(() => useChessCashierStatus());

    const options = query.useQuery.mock.calls[1]?.[0] as {
      staleTime: number;
      refetchInterval: (query: { state: { error: null } }) => number | false;
      refetchIntervalInBackground: boolean;
      refetchOnWindowFocus: boolean;
    };

    expect(CASHIER_BALANCE_STALE_MS).toBe(60_000);
    expect(CASHIER_BALANCE_POLL_MS).toBe(120_000);
    expect(options.staleTime).toBe(CASHIER_BALANCE_STALE_MS);
    expect(options.refetchInterval({ state: { error: null } })).toBe(CASHIER_BALANCE_POLL_MS);
    expect(options.refetchIntervalInBackground).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(true);
  });
});
