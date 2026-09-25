// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DepositStatusResult } from "@/lib/deposit";
import type { ShineEvent } from "@/lib/shine";

/**
 * What a spot buy tells Shine.
 *
 * Spot has two execution paths and they confirm differently, so they are
 * tested apart:
 *
 *   * The Dextopus order path places an order and learns later, from a status
 *     poll, that it settled. That is derived state, not an event: it fires
 *     from a cached terminal row, so the same settlement can be read again.
 *   * A swap-market symbol settles through the memecoin engine, whose promise
 *     resolves once, and which reports the trade itself under spot's name.
 *     Nothing is reported from here for that path, or one buy would make two
 *     posts.
 */

const shine = vi.hoisted(() => ({ reportShine: vi.fn() }));
vi.mock("@/lib/shine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shine")>()),
  reportShine: shine.reportShine,
}));

const toasts = vi.hoisted(() => ({
  loading: vi.fn(() => "toast-1"),
  success: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast: toasts }));

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
    refetchUntilChanged: vi.fn(),
  }),
}));

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
const memeTradeHook = vi.hoisted(() => ({
  // The engine's TradeResult: one test hands back a `delivered` verdict with
  // a request id, so the stub's type has to allow one.
  trade: vi.fn(
    async (): Promise<{ outcome: string; swapId: string | null; requestId: string | null }> => ({
      outcome: "confirmed",
      swapId: "swap-1",
      requestId: null,
    })
  ),
}));
vi.mock("@/features/trade/hooks/use-meme-trade", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/trade/hooks/use-meme-trade")>()),
  useMemeTrade: () => ({ phase: "idle", trade: memeTradeHook.trade }),
}));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/buy", () => ({
  routesForSymbol: () => [{ symbol: "LINK", destinationChainId: 8453 }],
}));
const swapRoute = vi.hoisted(() => ({ value: null as { tokenAddress: string } | null }));
vi.mock("@/lib/spot-swap", () => ({ swapRouteForSymbol: () => swapRoute.value }));

import { useSpotBuy } from "@/features/trade/hooks/use-spot-buy";

function settled(over: Partial<DepositStatusResult>): DepositStatusResult {
  return { status: "", executionStatus: "", ...over } as DepositStatusResult;
}

function reported(): ShineEvent[] {
  return shine.reportShine.mock.calls.map((call) => call[0] as ShineEvent);
}

async function placeOrder() {
  const view = renderHook(() => useSpotBuy({ symbol: "LINK", name: "Chainlink", amount: "25" }));
  await act(async () => {
    await view.result.current.submit();
  });
  return view;
}

beforeEach(() => {
  status.data = undefined;
  swapRoute.value = null;
  vi.clearAllMocks();
  buyMutation.mutateAsync.mockResolvedValue({ requestId: "req-1" });
  memeTradeHook.trade.mockResolvedValue({
    outcome: "confirmed",
    swapId: "swap-1",
    requestId: null,
  });
});

describe("the Dextopus spot order path", () => {
  it("reports one buy, keyed on the request id, once the order settles", async () => {
    const { rerender } = await placeOrder();
    status.data = settled({ status: "settled" });
    rerender();

    expect(reported()).toEqual([
      {
        service: "spot",
        id: "req-1",
        kind: "buy",
        symbol: "LINK",
        // The deposit status row carries no execution price and nothing else
        // on this path knows one, so the post states the buy and not a figure.
        price: null,
      },
    ]);
  });

  /**
   * The defect this guard exists for. The effect fires from a cached terminal
   * status row rather than from an event, so every re-render is another read
   * of the same settlement. It must report once however many times it runs.
   */
  it("reports once however often the settled row is read again", async () => {
    const { rerender } = await placeOrder();
    status.data = settled({ status: "settled" });
    rerender();
    rerender();
    status.data = settled({ status: "COMPLETED" });
    rerender();

    expect(shine.reportShine).toHaveBeenCalledTimes(1);
  });

  /**
   * The backlog case, and the reason this path is safe without a freshness
   * bound. useDepositStatus stops polling on a terminal stage but keeps the
   * row CACHED, so a surface can be handed a settled order on its very first
   * render. Nothing may be posted from that: Shine's dedup store stops the
   * SECOND post of something and does nothing about the first, and on the day
   * Shine ships every store is empty while the app is full of settled orders.
   * A post carries no date, so last week's buy would read as today's.
   *
   * What makes it safe is that `requestId` is component state and starts
   * null. This locks that: a mount that did not place the order posts
   * nothing, however settled the cached row is.
   */
  it("reports nothing for an order that was already settled when it mounted", async () => {
    status.data = settled({ status: "settled" });

    const view = renderHook(() => useSpotBuy({ symbol: "LINK", name: "Chainlink", amount: "25" }));
    view.rerender();

    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  // The same thing from the other end: an order placed and settled, then the
  // hook thrown away and mounted again while the terminal row is still served.
  it("reports nothing again when the hook is remounted", async () => {
    const first = await placeOrder();
    status.data = settled({ status: "settled" });
    first.rerender();
    expect(shine.reportShine).toHaveBeenCalledTimes(1);

    first.unmount();
    renderHook(() => useSpotBuy({ symbol: "LINK", name: "Chainlink", amount: "25" }));

    expect(shine.reportShine).toHaveBeenCalledTimes(1);
  });

  it("reports the second order of the same session under its own request id", async () => {
    const view = await placeOrder();
    status.data = settled({ status: "settled" });
    view.rerender();

    buyMutation.mutateAsync.mockResolvedValue({ requestId: "req-2" });
    status.data = undefined;
    await act(async () => {
      await view.result.current.submit();
    });
    status.data = settled({ status: "settled" });
    view.rerender();

    expect(reported().map((event) => event.id)).toEqual(["req-1", "req-2"]);
  });

  it.each(["refunded", "failed"])("reports nothing when the order is %s", async (raw) => {
    const { rerender } = await placeOrder();
    status.data = settled({ status: raw });
    rerender();

    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("reports nothing while the order is still in flight", async () => {
    const { rerender } = await placeOrder();
    status.data = settled({ status: "processing" });
    rerender();

    expect(shine.reportShine).not.toHaveBeenCalled();
  });
});

describe("the swap-market spot path", () => {
  beforeEach(() => {
    swapRoute.value = { tokenAddress: "0xc0ffee" };
  });

  // The engine holds the quote the symbol and the price come from, and it
  // reaches CONFIRMED in exactly one place. Reporting here as well would
  // publish the same buy twice under two different sets of facts.
  it("leaves the report to the swap engine, under spot's own name", async () => {
    await placeOrder();

    expect(shine.reportShine).not.toHaveBeenCalled();
    expect(memeTradeHook.trade).toHaveBeenCalledWith(
      expect.objectContaining({ shineService: "spot" })
    );
  });

  it("still reports nothing when the swap is delivered rather than confirmed", async () => {
    memeTradeHook.trade.mockResolvedValue({
      outcome: "delivered",
      swapId: "swap-1",
      requestId: "req-9",
    });

    await placeOrder();

    expect(shine.reportShine).not.toHaveBeenCalled();
  });
});
