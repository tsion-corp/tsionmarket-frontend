// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DepositStatusResult } from "@/lib/deposit";

/**
 * How a placed spot buy stops spinning.
 *
 * `buy.mutateAsync` only PLACES the order and returns a requestId; settlement
 * lands later. So the loading toast is left open on purpose and resolved by the
 * effect that watches the order's status. If that effect misreads the status,
 * the purchase still completes and the spinner never stops, which is exactly
 * what a user reported from staging: the token arrived, the toast span forever.
 */

const toasts = vi.hoisted(() => ({
  loading: vi.fn(() => "toast-1"),
  success: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast: toasts }));

const portfolioApi = vi.hoisted(() => ({ refetchUntilChanged: vi.fn() }));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({
    tokens: [
      {
        symbol: "USDC",
        network: "base-mainnet",
        balance: 500,
        rawBalance: "500000000",
        decimals: 6,
        valueUsd: 500,
        priceUsd: 1,
      },
    ],
    loading: false,
    refetchUntilChanged: portfolioApi.refetchUntilChanged,
  }),
}));

// The status the settlement effect reads. Each test sets the shape the service
// actually returns for that case.
const status = vi.hoisted(() => ({ data: undefined as DepositStatusResult | undefined }));
vi.mock("@/hooks/use-deposit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-deposit")>()),
  useDepositStatus: () => status,
}));

const buyMutation = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => ({ requestId: "req-1" })),
  isPending: false,
}));
vi.mock("@/features/trade/hooks/use-buy", () => ({ useBuy: () => buyMutation }));

vi.mock("@/features/trade/hooks/use-buy-catalog", () => ({
  useBuyDestinations: () => ({
    data: [{ symbol: "LINK", destinationChainId: 8453, destinationAsset: "0xlink" }],
  }),
}));
const memeTradeHook = vi.hoisted(() => ({ trade: vi.fn() }));
vi.mock("@/features/trade/hooks/use-meme-trade", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/trade/hooks/use-meme-trade")>()),
  useMemeTrade: () => ({ phase: "idle", trade: memeTradeHook.trade }),
}));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/buy", () => ({
  routesForSymbol: () => [{ symbol: "LINK", destinationChainId: 8453 }],
}));
const swapRoute = vi.hoisted(() => ({ value: null as { tokenAddress: string } | null }));
vi.mock("@/lib/spot-swap", () => ({ swapRouteForSymbol: () => swapRoute.value }));

import { useSpotBuy } from "@/features/trade/hooks/use-spot-buy";

function settled(over: Partial<DepositStatusResult>): DepositStatusResult {
  return { status: "", executionStatus: "", ...over } as DepositStatusResult;
}

// Places an order, which is what arms the settlement effect: the toast is only
// left open once there is a requestId to watch.
async function placeOrder() {
  const view = renderHook(() => useSpotBuy({ symbol: "LINK", name: "Chainlink", amount: "25" }));
  await act(async () => {
    await view.result.current.submit();
  });
  return view;
}

describe("useSpotBuy settlement", () => {
  beforeEach(() => {
    status.data = undefined;
    swapRoute.value = null;
    toasts.success.mockClear();
    toasts.error.mockClear();
    portfolioApi.refetchUntilChanged.mockClear();
    buyMutation.mutateAsync.mockClear();
  });

  it("resolves the toast on the literal settled status", async () => {
    const { rerender } = await placeOrder();
    status.data = settled({ status: "settled" });
    rerender();
    expect(toasts.success).toHaveBeenCalled();
  });

  /**
   * The reported bug. The service does not only say "settled": depositProgress
   * treats complete, success, filled, done, relayed and fulfilled as the same
   * thing. On any of those the poll stops, because the stage IS terminal, so a
   * literal string comparison here leaves the toast open with nothing left to
   * reopen it.
   */
  it.each(["COMPLETED", "complete", "success", "filled", "done", "relayed", "fulfilled"])(
    "resolves the toast when the service reports %s",
    async (raw) => {
      const { rerender } = await placeOrder();
      status.data = settled({ status: raw });
      rerender();
      expect(toasts.success).toHaveBeenCalled();
    }
  );

  /**
   * The other half of the same bug: completion can arrive on executionStatus
   * while status is still mid-flight. depositProgress takes whichever is
   * further along, and so must this.
   */
  it("resolves the toast when only executionStatus reports completion", async () => {
    const { rerender } = await placeOrder();
    status.data = settled({ status: "processing", executionStatus: "COMPLETED" });
    rerender();
    expect(toasts.success).toHaveBeenCalled();
  });

  it("reports a refund and a failure rather than leaving them open", async () => {
    const first = await placeOrder();
    status.data = settled({ status: "refunded" });
    first.rerender();
    expect(toasts.error).toHaveBeenCalled();

    toasts.error.mockClear();
    status.data = undefined;
    const second = await placeOrder();
    status.data = settled({ status: "EXPIRED" });
    second.rerender();
    expect(toasts.error).toHaveBeenCalled();
  });

  it("says nothing while the order is still in flight", async () => {
    const { rerender } = await placeOrder();
    status.data = settled({ status: "processing" });
    rerender();
    expect(toasts.success).not.toHaveBeenCalled();
    expect(toasts.error).not.toHaveBeenCalled();
  });
});

// The swap-market path (cbDOGE and friends) settles through the meme trade
// engine, whose word on the outcome is the trade service's. Only CONFIRMED is
// "bought"; delivered-but-unrecorded and pending say so, with the reference.
describe("useSpotBuy on a swap market", () => {
  beforeEach(() => {
    swapRoute.value = { tokenAddress: "0xdoge" };
    memeTradeHook.trade.mockReset();
    buyMutation.mutateAsync.mockClear();
    toasts.success.mockClear();
    toasts.error.mockClear();
  });

  it("says bought when the service confirmed", async () => {
    memeTradeHook.trade.mockResolvedValue({ outcome: "confirmed", swapId: "s1", requestId: null });
    await placeOrder();
    expect(toasts.success).toHaveBeenCalledWith("boughtToast", expect.anything());
  });

  it("says delivered, never bought, when the service has not confirmed", async () => {
    memeTradeHook.trade.mockResolvedValue({ outcome: "delivered", swapId: "s1", requestId: "r1" });
    await placeOrder();
    expect(toasts.success).toHaveBeenCalledWith("deliveredToast", expect.anything());
    expect(toasts.success).not.toHaveBeenCalledWith("boughtToast", expect.anything());
    expect(buyMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("says pending when the poll ran out of time", async () => {
    memeTradeHook.trade.mockResolvedValue({ outcome: "pending", swapId: "s2", requestId: null });
    await placeOrder();
    expect(toasts.success).toHaveBeenCalledWith("pendingToast", expect.anything());
    expect(toasts.success).not.toHaveBeenCalledWith("boughtToast", expect.anything());
  });
});
