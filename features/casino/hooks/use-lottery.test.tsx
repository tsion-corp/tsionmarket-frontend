import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const state = vi.hoisted(() => ({
  wallet: "0x0000000000000000000000000000000000000001",
  configured: true,
  loading: false,
  error: false,
  rawBalance: "825794",
  ledgerBalance: "0",
  deposit: vi.fn(),
  confirm: vi.fn(),
  purchase: vi.fn(),
  portfolio: vi.fn(),
  refetchFresh: vi.fn(),
  onDepositSent: undefined as ((txHash: string) => void) | undefined,
}));

// The hook reads the Decane session, not Privy. The same signed-in player with
// the same wallet, expressed the way the session actually provides it.
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: state.wallet,
    solanaAddress: null,
    profile: null,
  }),
}));
vi.mock("@/features/casino/lib/api/chess-client", () => ({
  chessGet: vi.fn(),
  chessPost: vi.fn(),
}));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: (options: unknown) => {
    state.portfolio(options);
    return {
      tokens: [
        {
          network: "base-mainnet",
          address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          symbol: "USDC",
          decimals: 6,
          rawBalance: state.rawBalance,
        },
      ],
      loading: state.loading,
      error: state.error,
      refetchFresh: state.refetchFresh,
    };
  },
}));
vi.mock("@/features/casino/hooks/use-chess-cashier", () => ({
  CASHIER_KEYS: { balance: (wallet: string) => ["cashier", wallet] },
  CASHIER_BALANCE_STALE_MS: 60_000,
  CASHIER_BALANCE_POLL_MS: 120_000,
  useChessCashier: (options?: { onDepositSent?: (txHash: string) => void }) => {
    state.onDepositSent = options?.onDepositSent;
    return {
      configured: state.configured,
      wallet: state.wallet,
      available: state.ledgerBalance,
      balanceLoading: false,
      balanceError: false,
      deposit: state.deposit,
      depositing: false,
    };
  },
}));
vi.mock("@/features/casino/lib/api/cashier", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/casino/lib/api/cashier")>()),
  fetchChessBalance: vi.fn(async () => ({ availableUsdc: "0", lockedUsdc: "0" })),
  confirmChessDeposit: state.confirm,
}));
vi.mock("@/features/casino/lib/api/lottery", () => ({
  fetchLotteryConfig: vi.fn(async () => ({ rule: { pricePerTicketUsdc: "0.37" } })),
  fetchCurrentLotteryDraw: vi.fn(async () => ({
    id: "draw-1",
    status: "open",
    salesCloseAt: "2099-01-01T00:00:00Z",
  })),
  fetchLotteryResults: vi.fn(async () => []),
  fetchLotteryTickets: vi.fn(async () => []),
  fetchLotteryEligibility: vi.fn(async () => ({ eligible: true })),
  createLotteryQuickPick: vi.fn(),
  purchaseLotteryTicket: state.purchase,
}));

import { useLottery } from "./use-lottery";

const selection = { whiteNumbers: [1, 2, 3, 4, 5], powerNumber: 6 };
const request = { selection, idempotencyKey: "ticket-key-1" };
const hash = `0x${"a".repeat(64)}`;
const ticket = { id: "ticket-1" };
let queryClient: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

async function readyLottery() {
  const hook = renderHook(() => useLottery(), { wrapper: Wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("ArkBall main-wallet funding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    state.wallet = "0x0000000000000000000000000000000000000001";
    state.configured = true;
    state.loading = false;
    state.error = false;
    state.rawBalance = "825794";
    state.ledgerBalance = "0";
    state.onDepositSent = undefined;
    state.deposit.mockImplementation(async () => {
      state.onDepositSent?.(hash);
      return { txHash: hash, credited: "0.37" };
    });
    state.confirm.mockResolvedValue({ amountUsdc: "0.37" });
    state.purchase.mockResolvedValue(ticket);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    localStorage.clear();
  });

  it("shows cached Base USDC even when the Chess ledger is empty", async () => {
    const { result } = await readyLottery();
    expect(result.current.availableUsdc).toBe("0.825794");
    expect(state.portfolio).toHaveBeenCalledWith({ scope: "base" });
  });

  it("funds the exact ticket price before purchasing with the original key", async () => {
    const { result } = await readyLottery();
    await act(async () => {
      await result.current.purchase(request);
    });
    expect(state.deposit).toHaveBeenCalledWith("0.37");
    expect(state.purchase).toHaveBeenCalledWith("draw-1", {
      player: state.wallet,
      ...selection,
      idempotencyKey: request.idempotencyKey,
    });
    expect(state.deposit.mock.invocationCallOrder[0]).toBeLessThan(
      state.purchase.mock.invocationCallOrder[0]!
    );
    expect(state.refetchFresh).toHaveBeenCalledWith(["base-mainnet"]);
  });

  it("uses existing in-play USDC without another blockchain transfer", async () => {
    state.ledgerBalance = "0.37";
    state.rawBalance = "0";
    const { result } = await readyLottery();
    await act(async () => {
      await result.current.purchase(request);
    });
    expect(state.deposit).not.toHaveBeenCalled();
    expect(state.purchase).toHaveBeenCalledTimes(1);
  });

  it("transfers only the shortfall after using existing in-play funds", async () => {
    state.ledgerBalance = "0.10";
    const { result } = await readyLottery();
    await act(async () => {
      await result.current.purchase(request);
    });
    expect(state.deposit).toHaveBeenCalledWith("0.27");
  });

  it("retries a pending confirmation without charging an emptied wallet again", async () => {
    state.deposit.mockImplementationOnce(async () => {
      state.onDepositSent?.(hash);
      return { txHash: hash, credited: null };
    });
    const { result, rerender } = await readyLottery();
    await act(async () => {
      await expect(result.current.purchase(request)).rejects.toThrow(/confirm/i);
    });
    expect(state.purchase).not.toHaveBeenCalled();
    state.rawBalance = "0";
    rerender();
    await act(async () => {
      await result.current.purchase(request);
    });
    expect(state.deposit).toHaveBeenCalledTimes(1);
    expect(state.confirm).toHaveBeenCalledWith(state.wallet, hash);
    expect(state.purchase).toHaveBeenCalledTimes(1);
  });

  it("restores a funded purchase after remount and reuses its key", async () => {
    state.purchase.mockRejectedValueOnce(new Error("Purchase request timed out"));
    const first = await readyLottery();
    await act(async () => {
      await expect(first.result.current.purchase(request)).rejects.toThrow(/funding.*saved/i);
    });
    first.unmount();
    state.rawBalance = "0";
    const second = await readyLottery();
    await act(async () => {
      await second.result.current.purchase({ ...request, idempotencyKey: "new-ui-key" });
    });
    expect(state.deposit).toHaveBeenCalledTimes(1);
    expect(state.purchase.mock.calls[1]?.[1].idempotencyKey).toBe(request.idempotencyKey);
  });

  it("preserves a sent transfer when confirmation throws a non-pending error", async () => {
    state.deposit.mockImplementationOnce(async () => {
      state.onDepositSent?.(hash);
      throw new Error("Confirmation service unreachable");
    });
    const { result } = await readyLottery();
    await act(async () => {
      await expect(result.current.purchase(request)).rejects.toThrow(/funding.*saved/i);
    });
    await act(async () => {
      await result.current.purchase(request);
    });
    expect(state.deposit).toHaveBeenCalledTimes(1);
    expect(state.confirm).toHaveBeenCalledWith(state.wallet, hash);
  });

  it("blocks changing the selection while an earlier funded ticket is unresolved", async () => {
    state.purchase.mockRejectedValueOnce(new Error("Purchase request timed out"));
    const { result } = await readyLottery();
    await act(async () => {
      await expect(result.current.purchase(request)).rejects.toThrow();
    });
    await act(async () => {
      await expect(
        result.current.purchase({ ...request, selection: { ...selection, powerNumber: 7 } })
      ).rejects.toThrow(/pending/i);
    });
    expect(state.deposit).toHaveBeenCalledTimes(1);
    expect(state.purchase).toHaveBeenCalledTimes(1);
  });

  it.each(["loading", "error", "unconfigured", "insufficient"])(
    "does not send funds when the balance or funding state is %s",
    async (kind) => {
      state.loading = kind === "loading";
      state.error = kind === "error";
      state.configured = kind !== "unconfigured";
      if (kind === "insufficient") state.rawBalance = "369999";
      const { result } = await readyLottery();
      await act(async () => {
        await expect(result.current.purchase(request)).rejects.toThrow();
      });
      expect(state.deposit).not.toHaveBeenCalled();
      expect(state.purchase).not.toHaveBeenCalled();
    }
  );
});
