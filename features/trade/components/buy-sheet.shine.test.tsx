import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { DepositStatusResult } from "@/lib/deposit";
import { memeToken } from "@/lib/meme/fixture";
import type { MemeToken } from "@/lib/meme/api";
import type { ShineEvent } from "@/lib/shine";

/**
 * What the buy sheet tells Shine.
 *
 * The sheet is the twin of useSpotBuy and confirms the same two ways: a
 * Dextopus order settles through a status poll, and a swap-market symbol
 * settles through the memecoin engine. The poll is the dangerous one — it
 * reads a cached terminal row, so the same settlement can be read again — and
 * the engine must not be reported twice, once by itself and once from here.
 */

const shine = vi.hoisted(() => ({ reportShine: vi.fn() }));
vi.mock("@/lib/shine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shine")>()),
  reportShine: shine.reportShine,
}));

// The live tradability read the sheet makes for a swap-market symbol. Null
// where the symbol routes through Dextopus instead, which is what the sheet
// asks for.
const swapToken = vi.hoisted(() => ({ token: null as MemeToken | null }));
vi.mock("@/features/trade/hooks/use-meme-tokens", () => ({
  useMemeToken: () => ({ token: swapToken.token, isLoading: false, unavailable: null }),
}));

const trade = vi.hoisted(() =>
  vi.fn(async () => ({ outcome: "confirmed", swapId: "swap-1", requestId: null }))
);
vi.mock("@/features/trade/hooks/use-meme-trade", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/trade/hooks/use-meme-trade")>()),
  useMemeTrade: () => ({
    phase: "idle",
    error: null,
    received: null,
    settled: null,
    swapId: null,
    requestId: null,
    trade,
  }),
}));

vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({
    tokens: [{ network: "base-mainnet", symbol: "USDC", balance: 500 }],
    loading: false,
    refetchUntilChanged: vi.fn(),
  }),
}));

const status = vi.hoisted(() => ({ data: undefined as DepositStatusResult | undefined }));
vi.mock("@/hooks/use-deposit", () => ({
  useDepositChains: () => ({ data: [] }),
  useDepositStatus: () => status,
}));

vi.mock("@/features/trade/hooks/use-buy-catalog", () => ({
  useBuyDestinations: () => ({ data: [] }),
}));
const buyMutation = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => ({
    requestId: "req-1",
    txHash: "0xtx",
    estimatedOutput: 1_000_000n,
  })),
  isPending: false,
  error: null,
}));
vi.mock("@/features/trade/hooks/use-buy", () => ({ useBuy: () => buyMutation }));

// The Dextopus route this sheet buys through, or none when the symbol is a
// swap market instead. A symbol never has both.
const routes = vi.hoisted(() => ({
  value: [] as { symbol: string; destinationChainId: number; decimals: number }[],
}));
vi.mock("@/lib/buy", () => ({ routesForSymbol: () => routes.value }));
const swapRoute = vi.hoisted(() => ({ value: null as { tokenAddress: string } | null }));
vi.mock("@/lib/spot-swap", () => ({ swapRouteForSymbol: () => swapRoute.value }));

vi.mock("@/components/ui/currency-select", () => ({
  useMoney: () => ({ format: (usd: number) => `$${usd}` }),
}));
vi.mock("@/components/share/share-to-square", () => ({ ShareToSquare: () => null }));
vi.mock("@/features/trade/components/spot-mode", () => ({
  useSpotMode: () => ({ mode: "simple" }),
}));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { loading: vi.fn(() => "t1"), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

import { BuySheet } from "@/features/trade/components/buy-sheet";

const buyLabel = messages.buySell.buyToken.replace("{name}", "Chainlink");

function renderSheet() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BuySheet payload={{ symbol: "LINK", name: "Chainlink", priceUsd: 20 }} onClose={() => {}} />
    </NextIntlClientProvider>
  );
}

function reported(): ShineEvent[] {
  return shine.reportShine.mock.calls.map((call) => call[0] as ShineEvent);
}

async function buy() {
  const view = renderSheet();
  fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "25" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: buyLabel }));
  });
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  status.data = undefined;
  routes.value = [];
  swapRoute.value = null;
  swapToken.token = null;
  buyMutation.mutateAsync.mockResolvedValue({
    requestId: "req-1",
    txHash: "0xtx",
    estimatedOutput: 1_000_000n,
  });
  trade.mockResolvedValue({ outcome: "confirmed", swapId: "swap-1", requestId: null });
});

describe("the buy sheet's Dextopus order path", () => {
  beforeEach(() => {
    routes.value = [{ symbol: "LINK", destinationChainId: 8453, decimals: 6 }];
  });

  it("reports one buy, keyed on the request id, once the order settles", async () => {
    const view = await buy();
    expect(shine.reportShine).not.toHaveBeenCalled();

    status.data = { status: "settled", executionStatus: "" } as DepositStatusResult;
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BuySheet
          payload={{ symbol: "LINK", name: "Chainlink", priceUsd: 20 }}
          onClose={() => {}}
        />
      </NextIntlClientProvider>
    );

    expect(reported()).toEqual([
      {
        service: "spot",
        id: "req-1",
        kind: "buy",
        symbol: "LINK",
        // The settlement row carries no execution price, and the quantity the
        // sheet shows is an amount, which may never reach a post.
        price: null,
      },
    ]);
  });

  /**
   * The backlog case. useDepositStatus keeps a terminal row cached, so a sheet
   * can be handed a settled order on its first render — and on the day Shine
   * ships the dedup store is empty, so that would be a first post about a buy
   * from last week, stamped by the square as happening now. What makes it safe
   * is that `requestId` is component state: a sheet opened fresh has none, so
   * the tracking view never shows and the cached row is never read.
   */
  it("reports nothing for an order that was already settled when it opened", async () => {
    status.data = { status: "settled", executionStatus: "" } as DepositStatusResult;

    renderSheet();

    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("reports nothing when the order is refunded", async () => {
    const view = await buy();
    status.data = { status: "refunded", executionStatus: "" } as DepositStatusResult;
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BuySheet
          payload={{ symbol: "LINK", name: "Chainlink", priceUsd: 20 }}
          onClose={() => {}}
        />
      </NextIntlClientProvider>
    );

    expect(shine.reportShine).not.toHaveBeenCalled();
  });
});

describe("the buy sheet's swap-market path", () => {
  beforeEach(() => {
    swapRoute.value = { tokenAddress: "0xc0ffee" };
    swapToken.token = memeToken({ symbol: "cbLINK", address: "0xc0ffee", warnings: [] });
  });

  // The engine reports the trade itself, from the one place it reaches
  // CONFIRMED and with the quote's own symbol and price in hand. Reporting
  // from the settle effect as well would publish the same buy twice.
  it("leaves the report to the swap engine, under spot's own name", async () => {
    await buy();

    expect(shine.reportShine).not.toHaveBeenCalled();
    expect(trade).toHaveBeenCalledWith(expect.objectContaining({ shineService: "spot" }));
  });
});
