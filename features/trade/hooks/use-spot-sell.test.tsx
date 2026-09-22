// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SellPayload } from "@/lib/modal-types";

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

const memeTradeHook = vi.hoisted(() => ({
  trade: vi.fn(async () => ({ outcome: "confirmed", swapId: "swap-1", requestId: null })),
}));
vi.mock("@/features/trade/hooks/use-meme-trade", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/trade/hooks/use-meme-trade")>()),
  useMemeTrade: () => ({ phase: "idle", trade: memeTradeHook.trade }),
}));

vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));
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
