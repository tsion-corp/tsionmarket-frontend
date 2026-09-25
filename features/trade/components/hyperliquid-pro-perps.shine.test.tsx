import { act, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type {
  HlAsset,
  HlMarketContext,
  HlPositionView,
} from "@/features/trade/lib/hyperliquid-types";
import type { ShineEvent } from "@/lib/shine";

/**
 * What the perps desk tells Shine.
 *
 * The order response is an ACCEPTANCE, not a fill, and posting on it would
 * publish positions that never opened. The fill is the positions watcher the
 * desk already runs and used to discard: it resolves once Hyperliquid's own
 * books show the change. These tests drive that watcher directly and assert on
 * the event, so what is covered is the wiring — which moment reports, under
 * which id, with which facts.
 */

const shine = vi.hoisted(() => ({ reportShine: vi.fn() }));
vi.mock("@/lib/shine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shine")>()),
  reportShine: shine.reportShine,
}));

vi.mock("@/components/shine/shine-toggle", () => ({
  ShineToggle: ({ service }: { service: string }) => (
    <div data-testid="shine-toggle" data-service={service} />
  ),
}));

const ticketProps = vi.fn();
const positionsListProps = vi.fn();
vi.mock("@/features/trade/components/perp-order-ticket", () => ({
  PerpOrderTicket: (props: Record<string, unknown>) => {
    ticketProps(props);
    return <div data-testid="order-ticket" />;
  },
}));
vi.mock("@/features/trade/components/hyperliquid-positions-list", () => ({
  HyperliquidPositionsList: (props: Record<string, unknown>) => {
    positionsListProps(props);
    return <div data-testid="positions-list" />;
  },
}));
vi.mock("@/features/trade/components/hyperliquid-orders-list", () => ({
  HyperliquidOrdersList: () => <div data-testid="orders-list" />,
}));

const btc: HlAsset = {
  id: "asset-btc",
  assetIndex: 0,
  dex: "",
  symbol: "BTC",
  category: "crypto",
  szDecimals: 4,
  maxLeverage: 40,
  isActive: true,
};

const btcContext: HlMarketContext = {
  symbol: "BTC",
  markPrice: "64000",
  oraclePrice: "64000",
  prevDayPrice: "60000",
  dayVolumeUsd: "1000000",
  openInterest: "10",
  fundingRate: "0.0001",
};

// The position Hyperliquid reports once the entry fills, under the entry
// order's own id.
function openPosition(over: Partial<HlPositionView> = {}): HlPositionView {
  return {
    id: "position-1",
    walletId: "wallet-1",
    assetId: "asset-btc",
    entryOrderId: "order-1",
    side: "long",
    size: "0.0156",
    entryPrice: "64012.5",
    leverage: 10,
    marginMode: "isolated",
    status: "open",
    closeReason: null,
    closePrice: null,
    realizedPnlUsdc: null,
    markPrice: "64100",
    unrealizedPnlUsdc: "1.2",
    accruedFundingUsdc: "0",
    openedAt: new Date().toISOString(),
    closedAt: null,
    ...over,
  };
}

// The rows the positions watcher will be handed on its next look, or null when
// nothing changed inside its window (which is what a resting order looks
// like).
const watcher = vi.hoisted(() => ({ rows: null as unknown[] | null }));

const trading = {
  authenticated: true,
  assets: [btc],
  assetsLoading: false,
  prices: { BTC: "64000" } as Record<string, string>,
  positions: [] as HlPositionView[],
  positionsLoading: false,
  orders: [],
  ordersLoading: false,
  clearinghouse: {
    marginSummary: {
      accountValue: "5000",
      totalNtlPos: "0",
      totalRawUsd: "5000",
      totalMarginUsed: "0",
    },
    crossMarginSummary: {
      accountValue: "5000",
      totalNtlPos: "0",
      totalRawUsd: "5000",
      totalMarginUsed: "0",
    },
    crossMaintenanceMarginUsed: "0",
    withdrawable: "5000",
    assetPositions: [],
    time: 0,
  },
  walletId: "wallet-1" as string | null,
  refetchAll: vi.fn(),
  refetchOrders: vi.fn(),
  refreshBalances: vi.fn(),
  // The real hook polls and hands each fresh snapshot to the predicate. Here
  // one look is enough: the rows under test, or none.
  waitForPositionsChange: vi.fn(async (changed: (rows: unknown[]) => boolean) =>
    watcher.rows === null ? false : changed(watcher.rows)
  ),
  waitForOrdersChange: vi.fn(async () => false),
  actions: {
    // A leg is a row or nothing, and one test rejects a take-profit, so the
    // stub's own type has to allow both rather than being fixed by its first
    // return value.
    placeOrder: vi.fn(
      async (): Promise<{
        entryOrder: { id: string; status: string };
        takeProfitOrder: { id: string; status: string } | null;
        stopLossOrder: { id: string; status: string } | null;
      }> => ({
        entryOrder: { id: "order-1", status: "filled" },
        takeProfitOrder: null,
        stopLossOrder: null,
      })
    ),
    updateLeverage: vi.fn(),
    bridge: vi.fn(),
    withdraw: vi.fn(),
    depositToPerps: vi.fn(),
    closePosition: vi.fn(),
    updateTriggerOrder: vi.fn(),
    cancelOrder: vi.fn(),
  },
};

vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    userId: "trader-1",
    evmAddress: "0x0000000000000000000000000000000000000001",
    solanaAddress: null,
    profile: { name: "Trader", email: "", avatarSeed: "trader" },
    logout: vi.fn(),
  }),
}));
vi.mock("decane-connect-kit", () => ({
  useSocialWallet: () => ({
    getEthereumProvider: vi.fn(),
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
    getAccessToken: vi.fn(),
    isUnlocked: true,
  }),
  useSocialAuth: () => ({ canUsePasskey: false }),
}));
vi.mock("@/features/trade/hooks/use-hyperliquid-trading", () => ({
  useHyperliquidTrading: () => trading,
}));
vi.mock("@/features/trade/hooks/use-hyperliquid-market-contexts", () => ({
  useHyperliquidMarketContexts: () => ({ contexts: [btcContext], loading: false }),
}));
vi.mock("@/features/trade/hooks/use-cctp-deposit-fee", () => ({
  useCctpDepositFee: () => ({ userPaysFee: false, maxFeeFor: () => null }),
}));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({ refetchFresh: vi.fn(), tokens: [] }),
}));

const { HyperliquidProPerps } = await import("@/features/trade/components/hyperliquid-pro-perps");

function renderDesk() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HyperliquidProPerps />
    </NextIntlClientProvider>
  );
}

function ticket(): Record<string, unknown> {
  return ticketProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

function reported(): ShineEvent[] {
  return shine.reportShine.mock.calls.map((call) => call[0] as ShineEvent);
}

/** Enters collateral and presses Buy or Sell, then lets the watcher answer. */
async function placeOrder(side: "buy" | "sell", { limit = false } = {}) {
  renderDesk();
  if (limit) {
    await act(async () => (ticket().onModeChange as (m: string) => void)("limit"));
    await act(async () => (ticket().onPriceChange as (p: string) => void)("60000"));
  }
  await act(async () => (ticket().onQuantityChange as (q: string) => void)("100"));
  await act(async () => {
    (ticket()[side === "buy" ? "onBuy" : "onSell"] as () => void)();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  watcher.rows = null;
  trading.positions = [];
  trading.actions.placeOrder.mockResolvedValue({
    entryOrder: { id: "order-1", status: "filled" },
    takeProfitOrder: null,
    stopLossOrder: null,
  });
  trading.actions.closePosition.mockResolvedValue(undefined);
  trading.waitForPositionsChange.mockImplementation(
    async (changed: (rows: unknown[]) => boolean) =>
      watcher.rows === null ? false : changed(watcher.rows)
  );
});

describe("opening a perps position", () => {
  it("reports the fill once, keyed on the entry order id", async () => {
    watcher.rows = [openPosition()];

    await placeOrder("buy");

    expect(reported()).toEqual([
      {
        service: "perps",
        id: "order-1",
        kind: "open",
        symbol: "BTC-USDC",
        side: "long",
        leverage: 10,
        price: "$64,012.50",
      },
    ]);
  });

  it("reports a short as a short", async () => {
    watcher.rows = [openPosition({ side: "short", entryPrice: "63000" })];

    await placeOrder("sell");

    expect(reported()[0]).toMatchObject({ kind: "open", side: "short", price: "$63,000.00" });
  });

  /**
   * The case the ADR singles out. A limit order that only rests is not a
   * trade: the venue reports no position under its entry order, so the
   * watcher's window closes with nothing to say and nothing is published.
   */
  it("reports nothing for a limit order that only rests", async () => {
    watcher.rows = null;

    await placeOrder("buy", { limit: true });

    expect(trading.actions.placeOrder).toHaveBeenCalled();
    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  // The snapshot can move for reasons that are not this order: another
  // market's trigger firing, the backend's reconciliation sweep. Only a
  // position carrying this entry order's id is this order's fill.
  it("reports nothing when the positions list moved for another reason", async () => {
    watcher.rows = [openPosition({ id: "position-9", entryOrderId: "order-other" })];

    await placeOrder("buy");

    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  // Hyperliquid can accept the entry and reject a bracket leg of the same
  // batch. The bracket is not the trade; the entry filled.
  it("still reports the entry when a take-profit leg was rejected", async () => {
    trading.actions.placeOrder.mockResolvedValue({
      entryOrder: { id: "order-1", status: "filled" },
      takeProfitOrder: { id: "tp-1", status: "rejected" },
      stopLossOrder: null,
    });
    watcher.rows = [openPosition()];

    await placeOrder("buy");

    expect(reported()).toHaveLength(1);
    expect(reported()[0]).toMatchObject({ id: "order-1", kind: "open" });
  });
});

// The close is NOT reported from this file. The watcher here only says the
// position is gone; the record with the close price and the realised return
// is written seconds later and is picked up by HyperliquidPositionsList, which
// is already waiting for it to draw the share card. See
// hyperliquid-positions-list.shine.test.tsx.
describe("closing a perps position", () => {
  it("reports nothing from the desk, leaving the close to the record that has the figures", async () => {
    watcher.rows = [];

    renderDesk();
    const props = positionsListProps.mock.calls.at(-1)?.[0] as {
      onClosePosition: (p: unknown, s: string[]) => Promise<void>;
    };
    await act(async () => props.onClosePosition(openPosition(), []));

    expect(trading.actions.closePosition).toHaveBeenCalledWith("position-1", []);
    expect(shine.reportShine).not.toHaveBeenCalled();
  });
});
