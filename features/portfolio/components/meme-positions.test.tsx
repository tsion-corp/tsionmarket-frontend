import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { PagedList } from "@/features/portfolio/hooks/use-meme-portfolio";
import type { PortfolioPosition, PortfolioSummary, TradeActivity } from "@/lib/meme/types";

// The Memecoins section on /portfolio, from the trade service's portfolio.
// The contract's rendering rules are what these pin: a null valuation is
// "Valuation unavailable" and never $0 or -100%; a partial aggregate is
// labelled partial; P&L is coloured by sign with an explicit +; a ledger
// quantity says so; a stale mark says so; a partial cost basis says why; the
// valuation disclaimer is shown; Sell opens on the position's own chain.

const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

function position(over: Partial<PortfolioPosition> = {}): PortfolioPosition {
  return {
    chain: "base",
    chainId: 8453,
    address: "0x4cd9a847f39106e19a4e41aea8a232e915c82af5",
    name: "Ethoswarm",
    symbol: "MENTE",
    decimals: 18,
    logoUrl: null,
    positionStatus: "OPEN",
    costBasisStatus: "COMPLETE",
    quantityBought: "4",
    quantitySold: "0",
    quantityRemaining: "4",
    ledgerQuantityRemaining: "4",
    walletQuantity: "4",
    externalQuantityDelta: "0",
    balanceStatus: "MATCHED",
    balanceUpdatedAt: "2026-09-14T15:29:00.000Z",
    totalInvestedUsd: "5",
    totalProceedsUsd: "0",
    remainingCostBasisUsd: "5",
    averageEntryPriceUsd: "1.25",
    lowestEntryPriceUsd: "1.25",
    highestEntryPriceUsd: "1.25",
    currentPriceUsd: "1.5",
    currentValueUsd: "6",
    realizedPnlUsd: "0",
    realizedReturnPercent: null,
    unrealizedPnlUsd: "1",
    unrealizedReturnPercent: "20",
    totalPnlUsd: "1",
    totalReturnPercent: "20",
    buyCount: 1,
    sellCount: 0,
    firstBoughtAt: "2026-09-14T15:10:00.000Z",
    lastBoughtAt: "2026-09-14T15:10:00.000Z",
    lastActivityAt: "2026-09-14T15:10:00.000Z",
    liquidityUsd: "80000",
    volume24hUsd: "1000",
    priceChange24hPercent: "3",
    marketCapUsd: null,
    fdvUsd: null,
    pairAddress: "0xpair",
    dexName: "Uniswap",
    marketDataUpdatedAt: "2026-09-14T15:25:00.000Z",
    marketDataStatus: "READY",
    riskLevel: "LOW",
    sellEnabled: true,
    warnings: [],
    valuationDisclaimer: "Current value is an informational mark, not guaranteed proceeds.",
    ...over,
  };
}

function summary(over: Partial<PortfolioSummary> = {}): PortfolioSummary {
  return {
    totalPositions: 1,
    openPositions: 1,
    closedPositions: 0,
    totalInvestedUsd: "5",
    totalProceedsUsd: "0",
    currentValueUsd: "6",
    realizedPnlUsd: "0",
    unrealizedPnlUsd: "1",
    totalPnlUsd: "1",
    totalReturnPercent: "20",
    profitablePositions: 1,
    losingPositions: 0,
    marketValueComplete: true,
    calculatedAt: "2026-09-14T15:29:00.000Z",
    ...over,
  };
}

function activity(over: Partial<TradeActivity> = {}): TradeActivity {
  return {
    id: "swap-1",
    quoteId: "quote-1",
    chain: "base",
    chainId: 8453,
    side: "BUY",
    status: "CONFIRMED",
    walletAddress: "0xwallet",
    tokenAddress: "0x4cd9a847f39106e19a4e41aea8a232e915c82af5",
    tokenDecimals: 18,
    tokenName: "Ethoswarm",
    tokenSymbol: "MENTE",
    tokenLogoUrl: null,
    sellTokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    buyTokenAddress: "0x4cd9a847f39106e19a4e41aea8a232e915c82af5",
    sellAmountAtomic: "5000000",
    sellAmount: "5",
    buyAmountAtomic: "4000000000000000000",
    buyAmount: "4",
    usdAmount: "5",
    platformFeeAmountAtomic: "25000",
    platformFeeAmountUsd: null,
    transactionHashes: [],
    userOperationHashes: [],
    createdAt: "2026-09-14T15:10:00.000Z",
    submittedAt: null,
    confirmedAt: null,
    updatedAt: "2026-09-14T15:10:40.000Z",
    failureCode: null,
    failureReason: null,
    ...over,
  };
}

function list<T>(items: T[], over: Partial<PagedList<T>> = {}): PagedList<T> {
  return {
    items,
    total: items.length,
    hasMore: false,
    loadMore: vi.fn(),
    isLoading: false,
    isLoadingMore: false,
    error: null,
    loadMoreFailed: false,
    refetch: vi.fn(),
    ...over,
  };
}

const hooks = vi.hoisted(() => ({
  summary: null as unknown,
  positions: null as unknown,
  base: null as unknown,
  solana: null as unknown,
  activity: null as unknown,
  position: null as unknown,
}));
vi.mock("@/features/portfolio/hooks/use-meme-portfolio", () => ({
  useMemePortfolioSummary: () => hooks.summary,
  useMemePortfolio: (chain?: "base" | "solana") =>
    chain === "base" ? hooks.base : chain === "solana" ? hooks.solana : hooks.positions,
  useMemeActivity: () => hooks.activity,
  useMemePosition: () => hooks.position,
}));

import { MemePositions } from "@/features/portfolio/components/meme-positions";

const NOW = Date.parse("2026-09-14T15:30:00.000Z");

function setData({
  positions = [position()],
  sum = summary(),
  feed = [activity()],
}: { positions?: PortfolioPosition[]; sum?: PortfolioSummary; feed?: TradeActivity[] } = {}) {
  hooks.summary = { summary: sum, isLoading: false, error: null, refetch: vi.fn() };
  hooks.positions = list(positions);
  hooks.base = list(positions.filter((p) => p.chain === "base"));
  hooks.solana = list(positions.filter((p) => p.chain === "solana"));
  hooks.activity = list(feed);
  hooks.position = { position: null, isLoading: false, error: null, refetch: vi.fn() };
}

function renderSection() {
  const onSell = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <MemePositions onSell={onSell} />
    </NextIntlClientProvider>
  );
  return { onSell };
}

const row = (symbol: string) => screen.getByRole("listitem", { name: symbol });

// A row shows the coin, its value and its P&L; the rest of the position opens
// under it when the row is tapped, as the asset sheet would show it.
function openRow(symbol: string) {
  fireEvent.click(within(row(symbol)).getByRole("button", { expanded: false }));
  return within(row(symbol));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  setData();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("MemePositions, a position the market cannot value", () => {
  const unpriced = position({
    currentPriceUsd: null,
    currentValueUsd: null,
    unrealizedPnlUsd: null,
    unrealizedReturnPercent: null,
    totalReturnPercent: null,
    realizedPnlUsd: "-2",
    totalPnlUsd: "-2",
    marketDataUpdatedAt: null,
    marketDataStatus: "UNAVAILABLE",
  });

  it("says Valuation unavailable, and never $0 or -100%", () => {
    setData({ positions: [unpriced] });
    renderSection();
    expect(within(row("MENTE")).getByText("Valuation unavailable")).toBeInTheDocument();
    // Opened too, so the stats underneath are held to the same rule.
    openRow("MENTE");
    expect(row("MENTE").textContent).not.toMatch(/\$0(\.0+)?(?!\d)/);
    expect(row("MENTE").textContent).not.toContain("-100%");
  });

  it("keeps what is still known: the average entry and the realised P&L", () => {
    setData({ positions: [unpriced] });
    renderSection();
    // The total P&L on the row is the realised P&L alone.
    expect(within(row("MENTE")).getByText("-$2.00")).toHaveClass("text-down");
    const mente = openRow("MENTE");
    expect(mente.getByText("$1.25")).toBeInTheDocument();
    expect(mente.getAllByText("-$2.00")).toHaveLength(2);
    expect(mente.getByText("Realised only")).toBeInTheDocument();
  });

  it("labels a missing market-data timestamp as no market data", () => {
    setData({ positions: [unpriced] });
    renderSection();
    expect(openRow("MENTE").getByText("No market data")).toBeInTheDocument();
  });

  it("looks the logo up by contract when the service sent none", () => {
    setData({ positions: [unpriced] });
    renderSection();
    expect(within(row("MENTE")).getByRole("img", { name: "MENTE" })).toHaveAttribute(
      "src",
      "/api/token-logo/base/0x4cd9a847f39106e19a4e41aea8a232e915c82af5"
    );
  });

  it("keeps the service's own logo when it sent one", () => {
    setData({ positions: [position({ logoUrl: "https://cdn.example/mente.png" })] });
    renderSection();
    expect(within(row("MENTE")).getByRole("img", { name: "MENTE" })).toHaveAttribute(
      "src",
      "https://cdn.example/mente.png"
    );
  });
});

describe("MemePositions summary strip", () => {
  it("labels the aggregate value and P&L partial when some positions can't be priced", () => {
    setData({ sum: summary({ marketValueComplete: false }) });
    renderSection();
    const strip = within(screen.getByRole("region", { name: "Memecoin summary" }));
    expect(strip.getAllByText("Partial — some positions can't be priced").length).toBeGreaterThan(
      0
    );
  });

  it("carries no partial label when every position is priced", () => {
    renderSection();
    expect(screen.queryByText("Partial — some positions can't be priced")).toBeNull();
  });

  it("shows current value, a signed total P&L, the return and the realised P&L", () => {
    setData({
      sum: summary({
        currentValueUsd: "1234.5",
        totalPnlUsd: "-40.1",
        realizedPnlUsd: "12",
        totalReturnPercent: "-3.25",
      }),
    });
    renderSection();
    const strip = within(screen.getByRole("region", { name: "Memecoin summary" }));
    expect(strip.getByText("$1,234.50")).toBeInTheDocument();
    expect(strip.getByText("-$40.10")).toHaveClass("text-down");
    expect(strip.getByText("-3.25%")).toHaveClass("text-down");
    expect(strip.getByText("+$12.00")).toHaveClass("text-up");
    expect(strip.getByText(/Calculated/)).toBeInTheDocument();
  });
});

describe("MemePositions position rows", () => {
  it("colours P&L by sign, keeps the minus and gives a gain its +", () => {
    setData({
      positions: [
        position({ symbol: "UP", address: "0xup", totalPnlUsd: "12.5", totalReturnPercent: "32" }),
        position({
          symbol: "DOWN",
          address: "0xdown",
          totalPnlUsd: "-3.2",
          totalReturnPercent: "-0.5",
        }),
      ],
    });
    renderSection();
    expect(within(row("UP")).getByText("+$12.50")).toHaveClass("text-up");
    expect(within(row("UP")).getByText("+32%")).toHaveClass("text-up");
    expect(within(row("DOWN")).getByText("-$3.20")).toHaveClass("text-down");
    expect(within(row("DOWN")).getByText("-0.5%")).toHaveClass("text-down");
  });

  it("labels the quantity ledger-derived when the wallet balance could not be read", () => {
    setData({
      positions: [
        position({
          symbol: "LEDGER",
          address: "0xl",
          balanceStatus: "UNAVAILABLE",
          walletQuantity: null,
        }),
        position({ symbol: "LIVE", address: "0xv", balanceStatus: "MATCHED" }),
      ],
    });
    renderSection();
    expect(openRow("LEDGER").getByText("Ledger-derived")).toBeInTheDocument();
    expect(openRow("LIVE").queryByText("Ledger-derived")).toBeNull();
  });

  it("shows the mark's age, and calls it stale once it passes fifteen minutes", () => {
    setData({
      positions: [position({ marketDataUpdatedAt: new Date(NOW - 14 * 60_000).toISOString() })],
    });
    renderSection();
    expect(openRow("MENTE").getByText("Price 14 min ago")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    });
    expect(within(row("MENTE")).getByText("Stale price · 16 min ago")).toBeInTheDocument();
  });

  it("badges a partial cost basis and says why", () => {
    setData({ positions: [position({ costBasisStatus: "PARTIAL" })] });
    renderSection();
    const mente = openRow("MENTE");
    expect(mente.getByText("Partial cost basis")).toBeInTheDocument();
    expect(
      mente.getByText(/transfer or trade outside this app has no known price/)
    ).toBeInTheDocument();
  });

  it("shows the service's valuation disclaimer as fine print", () => {
    renderSection();
    expect(
      screen.getByText("Current value is an informational mark, not guaranteed proceeds.")
    ).toBeInTheDocument();
  });

  it("opens a Solana position's sale on Solana, with the mint exactly as written", () => {
    setData({
      positions: [
        position({ chain: "solana", chainId: 101, address: MINT, symbol: "BONK", name: "Bonk" }),
      ],
    });
    const { onSell } = renderSection();
    fireEvent.click(openRow("BONK").getByRole("button", { name: "Sell BONK" }));
    expect(onSell).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 101, address: MINT, symbol: "BONK", sellEnabled: true })
    );
  });

  it("offers no sale for a closed position, and a paused one for a sell-disabled coin", () => {
    setData({
      positions: [
        position({
          symbol: "SHUT",
          address: "0xs",
          positionStatus: "CLOSED",
          quantityRemaining: "0",
        }),
        position({ symbol: "PAUSED", address: "0xp", sellEnabled: false }),
      ],
    });
    renderSection();
    fireEvent.click(screen.getByRole("tab", { name: "Closed" }));
    expect(openRow("SHUT").queryByRole("button", { name: "Sell SHUT" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Open" }));
    const paused = openRow("PAUSED");
    expect(paused.getByRole("button", { name: "Sell PAUSED" })).toBeDisabled();
    expect(paused.getByText("Selling is paused for this coin")).toBeInTheDocument();
  });

  it("opens a row's details on tap and folds them away again", () => {
    renderSection();
    const toggle = within(row("MENTE")).getByRole("button", { expanded: false });
    expect(within(row("MENTE")).queryByText("Avg entry")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(row("MENTE")).getByText("Avg entry")).toBeInTheDocument();
    expect(within(row("MENTE")).getByText("Trades")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(within(row("MENTE")).queryByText("Avg entry")).toBeNull();
  });
});

describe("MemePositions tabs and paging", () => {
  it("lists open positions first, and closed ones under Closed", () => {
    setData({
      positions: [
        position({ symbol: "OPEN1", address: "0x1" }),
        position({
          symbol: "GONE",
          address: "0x2",
          positionStatus: "CLOSED",
          quantityRemaining: "0",
        }),
      ],
    });
    renderSection();
    expect(screen.getByRole("tab", { name: "Open" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("listitem", { name: "GONE" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Closed" }));
    expect(row("GONE")).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "OPEN1" })).toBeNull();
  });

  it("scopes the Solana tab to the chain query", () => {
    setData({
      positions: [
        position({ symbol: "BASED", address: "0xb" }),
        position({ symbol: "BONK", chain: "solana", chainId: 101, address: MINT }),
      ],
    });
    renderSection();
    fireEvent.click(screen.getByRole("tab", { name: "Solana" }));
    expect(row("BONK")).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "BASED" })).toBeNull();
  });

  it("asks the server for the next page on Load more, and offers none once the total is in", () => {
    setData();
    hooks.positions = list([position()], { hasMore: true, total: 120 });
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect((hooks.positions as PagedList<PortfolioPosition>).loadMore).toHaveBeenCalledTimes(1);

    hooks.positions = list([position()], { hasMore: false, total: 1 });
    fireEvent.click(screen.getByRole("tab", { name: "Closed" }));
    fireEvent.click(screen.getByRole("tab", { name: "Open" }));
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("says it couldn't load, with a retry, rather than showing an empty portfolio", () => {
    setData();
    const refetch = vi.fn();
    hooks.positions = list([], { error: new Error("down"), refetch });
    renderSection();
    expect(screen.getByText("Couldn't load your memecoin positions.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("MemePositions activity", () => {
  it("lists a trade with side, amounts, USD, fee and its status", () => {
    setData({ feed: [activity()] });
    renderSection();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    const trade = within(screen.getByRole("listitem", { name: "Buy MENTE" }));
    expect(trade.getByText("5 USDC → 4 MENTE")).toBeInTheDocument();
    expect(trade.getByText("$5.00")).toBeInTheDocument();
    expect(trade.getByText("Fee 0.025 USDC")).toBeInTheDocument();
    expect(trade.getByText("Confirmed")).toBeInTheDocument();
  });

  it("links a transaction only when the service has a hash for it", () => {
    setData({
      feed: [
        activity({
          id: "no-hash",
          tokenSymbol: "NOHASH",
          transactionHashes: [],
          userOperationHashes: ["0xuop"],
        }),
        activity({
          id: "hashed",
          tokenSymbol: "HASHED",
          transactionHashes: ["0xapprove", "0xswap"],
        }),
      ],
    });
    renderSection();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(
      within(screen.getByRole("listitem", { name: "Buy NOHASH" })).queryByRole("link")
    ).toBeNull();
    expect(
      within(screen.getByRole("listitem", { name: "Buy HASHED" })).getByRole("link", {
        name: "View transaction",
      })
    ).toHaveAttribute("href", "https://basescan.org/tx/0xswap");
  });

  it("says a pending trade is not in the holdings yet", () => {
    setData({ feed: [activity({ status: "CONFIRMING", side: "SELL" })] });
    renderSection();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    const trade = within(screen.getByRole("listitem", { name: "Sell MENTE" }));
    expect(trade.getByText("Confirming")).toBeInTheDocument();
    expect(trade.getByText("Not in your holdings until confirmed.")).toBeInTheDocument();
    expect(trade.getByText("5 MENTE → 4 USDC")).toBeInTheDocument();
  });
});
