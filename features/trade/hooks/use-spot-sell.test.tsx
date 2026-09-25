// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SellPayload } from "@/lib/modal-types";
import type { TradeResult } from "@/features/trade/hooks/use-meme-trade";

// A spot market that settles through a same-chain Base swap (lib/spot-swap.ts)
// is bought through the meme swap engine, because Dextopus carries no route for
// it. The sale has to leave by the same door: asking Dextopus to sell what it
// cannot buy comes back "no route for this sale".

const toasts = vi.hoisted(() => ({
  loading: vi.fn(() => "toast-1"),
  success: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast: toasts }));

const portfolioApi = vi.hoisted(() => ({
  refetch: vi.fn(),
  refetchUntilChanged: vi.fn(),
}));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({
    tokens: [{ symbol: "ETH", network: "base-mainnet", balance: 1, decimals: 18 }],
    loading: false,
    refetch: portfolioApi.refetch,
    refetchUntilChanged: portfolioApi.refetchUntilChanged,
  }),
}));

const sellMutation = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => ({ requestId: "req-1" })),
  isPending: false,
}));
vi.mock("@/features/trade/hooks/use-sell", () => ({ useSell: () => sellMutation }));
// The fee payer is the signed-in wallet; the hook reads it from the session.
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: "0xabc0000000000000000000000000000000000001",
    solanaAddress: null,
  }),
}));

const memeTradeHook = vi.hoisted(() => ({
  trade: vi.fn(async (): Promise<TradeResult> => ({
    outcome: "confirmed",
    swapId: "swap-1",
    requestId: null,
    amounts: null,
    txHash: null,
  })),
}));
vi.mock("@/features/trade/hooks/use-meme-trade", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/trade/hooks/use-meme-trade")>()),
  useMemeTrade: () => ({ phase: "idle", trade: memeTradeHook.trade }),
}));

const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: analytics.track }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const swapRoute = vi.hoisted(() => ({
  value: null as { tokenAddress: string; decimals: number; chainId: number } | null,
}));
vi.mock("@/lib/spot-swap", () => ({ swapRouteForSymbol: () => swapRoute.value }));

import { useSpotSell } from "@/features/trade/hooks/use-spot-sell";

const DOGE: SellPayload = {
  symbol: "DOGE",
  name: "Dogecoin",
  network: "base-mainnet",
  address: "0xcbD06E5A2B0C65597161de254AA074E489dEb510",
  decimals: 8,
  balance: 10.14812065,
  rawBalance: "1014812065",
  priceUsd: 0.0977,
  logo: null,
};

function sellHook(holding: SellPayload) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(
    () =>
      useSpotSell({
        holding,
        maxRequested: false,
        onSold: () => {},
        onAmountCorrected: () => {},
      }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }
  );
}

describe("useSpotSell on a swap market", () => {
  beforeEach(() => {
    swapRoute.value = null;
    toasts.success.mockClear();
    toasts.error.mockClear();
    sellMutation.mutateAsync.mockClear();
    memeTradeHook.trade.mockClear();
  });

  it("sells through the swap engine, not Dextopus", async () => {
    swapRoute.value = {
      tokenAddress: DOGE.address as string,
      decimals: 8,
      chainId: 8453,
    };
    const view = sellHook(DOGE);
    await act(async () => {
      await view.result.current.submit("10.14812065");
    });

    expect(memeTradeHook.trade).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 8453,
        side: "SELL",
        tokenAddress: DOGE.address,
        amount: "10.14812065",
      })
    );
    expect(sellMutation.mutateAsync).not.toHaveBeenCalled();
    expect(toasts.success).toHaveBeenCalled();
  });

  it("leaves an ordinary market on the Dextopus sell path", async () => {
    const link: SellPayload = { ...DOGE, symbol: "LINK", name: "Chainlink", decimals: 18 };
    const view = sellHook(link);
    await act(async () => {
      await view.result.current.submit("1");
    });

    expect(sellMutation.mutateAsync).toHaveBeenCalled();
    expect(memeTradeHook.trade).not.toHaveBeenCalled();
  });
});

// What a sale reports. `amount_usd` is dollars on a sell, never the number of
// tokens: that is the defect that put $1.26M of phantom volume into Mixpanel.
describe("useSpotSell analytics", () => {
  const completed = () =>
    analytics.track.mock.calls.filter(([name]) => name === "trade_completed").map(([, p]) => p);

  beforeEach(() => {
    swapRoute.value = null;
    analytics.track.mockClear();
    memeTradeHook.trade.mockReset();
  });

  it("reports a swap-engine sale at the USDC it paid out, with the quantity sold", async () => {
    swapRoute.value = { tokenAddress: DOGE.address as string, decimals: 8, chainId: 8453 };
    memeTradeHook.trade.mockResolvedValue({
      outcome: "confirmed",
      swapId: "swap-1",
      requestId: null,
      amounts: { amount_usd: 0.98, token_quantity: 10.14812065, amount_source: "fill" as const },
      txHash: "0xswap",
    });
    const view = sellHook(DOGE);
    await act(async () => {
      await view.result.current.submit("10.14812065");
    });

    expect(completed()).toEqual([
      {
        vertical: "spot",
        asset: "DOGE",
        side: "sell",
        amount_usd: 0.98,
        token_quantity: 10.14812065,
        amount_source: "fill",
        recorded: "confirmed",
        order_id: "swap-1",
        tx_hash: "0xswap",
      },
    ]);
  });

  it("counts a delivered sale as a trade, and a pending one not yet", async () => {
    swapRoute.value = { tokenAddress: DOGE.address as string, decimals: 8, chainId: 8453 };
    const amounts = {
      amount_usd: 0.98,
      token_quantity: 10.14812065,
      amount_source: "fill" as const,
    };
    memeTradeHook.trade
      .mockResolvedValueOnce({
        outcome: "delivered",
        swapId: "s1",
        requestId: null,
        amounts,
        txHash: null,
      })
      .mockResolvedValueOnce({
        outcome: "pending",
        swapId: "s2",
        requestId: null,
        amounts,
        txHash: null,
      });
    const view = sellHook(DOGE);
    await act(async () => {
      await view.result.current.submit("10.14812065");
    });
    await act(async () => {
      await view.result.current.submit("10.14812065");
    });

    expect(completed()).toHaveLength(1);
    expect(completed()[0]).toMatchObject({ recorded: "delivered", order_id: "s1" });
  });

  it("values a Dextopus sale at quantity times the quoted price, marked as a quote", async () => {
    const link: SellPayload = { ...DOGE, symbol: "LINK", name: "Chainlink" };
    const view = sellHook(link);
    await act(async () => {
      await view.result.current.submit("10.14812065");
    });

    expect(completed()).toEqual([
      {
        vertical: "spot",
        asset: "LINK",
        side: "sell",
        amount_usd: 0.991471,
        token_quantity: 10.14812065,
        // The price the sale was valued at, derived from the two amounts.
        fill_price_usd: 0.0977,
        amount_source: "quote",
        order_id: "req-1",
      },
    ]);
  });

  it("reports why a Dextopus sale failed, in the agreed vocabulary", async () => {
    sellMutation.mutateAsync.mockRejectedValueOnce(
      Object.assign(new Error("no route for this sale"), {
        name: "TradeApiError",
        code: "NO_ROUTE",
      })
    );
    const view = sellHook({ ...DOGE, symbol: "LINK" });
    await act(async () => {
      await view.result.current.submit("10.14812065");
    });
    expect(analytics.track).toHaveBeenCalledWith("trade_failed", {
      vertical: "spot",
      asset: "LINK",
      side: "sell",
      reason: "no_route",
      reason_detail: "NO_ROUTE",
      amount_usd: 0.991471,
    });
  });

  it("reports the order once Dextopus accepts it, under the id its completion carries", async () => {
    const view = sellHook({ ...DOGE, symbol: "LINK" });
    await act(async () => {
      await view.result.current.submit("10.14812065");
    });
    expect(analytics.track).toHaveBeenCalledWith("trade_submitted", {
      vertical: "spot",
      asset: "LINK",
      side: "sell",
      amount_usd: 0.991471,
      token_quantity: 10.14812065,
      order_id: "req-1",
    });
  });

  it("reports a swap-engine order when the engine says it was sent", async () => {
    swapRoute.value = { tokenAddress: DOGE.address as string, decimals: 8, chainId: 8453 };
    memeTradeHook.trade.mockImplementation(
      async (input?: { onSubmitted?: (id: string) => void }) => {
        input?.onSubmitted?.("swap-5");
        return {
          outcome: "pending",
          swapId: "swap-5",
          requestId: null,
          amounts: null,
          txHash: null,
        };
      }
    );
    const view = sellHook(DOGE);
    await act(async () => {
      await view.result.current.submit("10.14812065");
    });
    expect(analytics.track).toHaveBeenCalledWith(
      "trade_submitted",
      expect.objectContaining({ side: "sell", order_id: "swap-5", token_quantity: 10.14812065 })
    );
  });

  it("previews a sale in dollars and carries the quantity", async () => {
    const view = sellHook({ ...DOGE, symbol: "LINK" });
    await act(async () => {
      await view.result.current.submit("10.14812065");
    });

    expect(analytics.track).toHaveBeenCalledWith("trade_previewed", {
      vertical: "spot",
      asset: "LINK",
      side: "sell",
      amount_usd: 0.991471,
      token_quantity: 10.14812065,
    });
  });
});
