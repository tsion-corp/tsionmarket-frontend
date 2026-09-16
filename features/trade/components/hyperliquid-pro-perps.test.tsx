import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { HlAsset, HlMarketContext } from "@/features/trade/lib/hyperliquid-types";

// The pro desk is wiring: it hands the panels that already exist to
// LeverageDesktopLayout's slots. These tests cover that wiring, so the layout,
// the chart shell and the market picker are all the real components. Only the
// three panels that reach for wallets, modals and the network are stubbed, and
// each stub records the props it was handed.
const ticketProps = vi.fn();
const positionsListProps = vi.fn();
const ordersListProps = vi.fn();

// The desk now renders PerpOrderTicket, the 2.0 design, in place of
// HyperliquidOrderForm. Stubbing it records the props the desk hands across, so
// these tests prove the wiring rather than the ticket's own rendering, which
// perp-order-ticket.test.tsx covers.
vi.mock("@/features/trade/components/perp-order-ticket", () => ({
  PerpOrderTicket: (props: Record<string, unknown>) => {
    ticketProps(props);
    return <div data-testid="order-ticket">order ticket</div>;
  },
}));
vi.mock("@/features/trade/components/hyperliquid-positions-list", () => ({
  HyperliquidPositionsList: (props: Record<string, unknown>) => {
    positionsListProps(props);
    return <div data-testid="positions-list">positions</div>;
  },
}));
vi.mock("@/features/trade/components/hyperliquid-orders-list", () => ({
  HyperliquidOrdersList: (props: Record<string, unknown>) => {
    ordersListProps(props);
    return <div data-testid="orders-list">orders</div>;
  },
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

// A second market, so "switch the market from inside fullscreen" has somewhere
// to switch to. Only the tests that need two markets put it in `trading.assets`.
const eth: HlAsset = {
  id: "asset-eth",
  assetIndex: 1,
  dex: "",
  symbol: "ETH",
  category: "crypto",
  szDecimals: 4,
  maxLeverage: 25,
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

const ethContext: HlMarketContext = {
  symbol: "ETH",
  markPrice: "3200",
  oraclePrice: "3200",
  prevDayPrice: "3200",
  dayVolumeUsd: "500000",
  openInterest: "100",
  fundingRate: "0.0001",
};

// Mutable so a test can put a second market on the desk. The hook mock reads it
// at render, not at import.
let marketContexts: HlMarketContext[] = [btcContext];

const trading = {
  authenticated: true,
  assets: [btc],
  assetsLoading: false,
  prices: { BTC: "64000" } as Record<string, string>,
  positions: [],
  positionsLoading: false,
  orders: [],
  ordersLoading: false,
  // A whole HlClearinghouseState, not just the withdrawable the ticket used to
  // need. The cross-margin branch of the liquidation estimate reads
  // marginSummary.accountValue and crossMaintenanceMarginUsed, and the real
  // type requires both, so a stub carrying only withdrawable would pass the
  // types while throwing at render.
  clearinghouse: {
    marginSummary: {
      accountValue: "500",
      totalNtlPos: "0",
      totalRawUsd: "500",
      totalMarginUsed: "0",
    },
    crossMarginSummary: {
      accountValue: "500",
      totalNtlPos: "0",
      totalRawUsd: "500",
      totalMarginUsed: "0",
    },
    crossMaintenanceMarginUsed: "0",
    withdrawable: "500",
    assetPositions: [],
    time: 0,
  },
  walletId: "wallet-1" as string | null,
  refetchAll: vi.fn(),
  refetchOrders: vi.fn(),
  refreshBalances: vi.fn(),
  waitForPositionsChange: vi.fn(),
  waitForOrdersChange: vi.fn(),
  actions: {
    placeOrder: vi.fn(),
    updateLeverage: vi.fn(),
    bridge: vi.fn(),
    withdraw: vi.fn(),
    depositToPerps: vi.fn(),
    closePosition: vi.fn(),
    updateTriggerOrder: vi.fn(),
    cancelOrder: vi.fn(),
  },
};

vi.mock("@/features/trade/hooks/use-hyperliquid-trading", () => ({
  useHyperliquidTrading: () => trading,
}));
vi.mock("@/features/trade/hooks/use-hyperliquid-market-contexts", () => ({
  useHyperliquidMarketContexts: () => ({ contexts: marketContexts, loading: false }),
}));
// tokens is here because the desk now renders HyperliquidFundModal beside the
// ticket, and that modal looks for the user's Base USDC to fund a top up. The
// desk itself only needs refetchFresh.
// The fund modal renders for real here; its fee read is a query of its own.
vi.mock("@/features/trade/hooks/use-cctp-deposit-fee", () => ({
  useCctpDepositFee: () => ({ userPaysFee: false, maxFeeFor: () => null }),
}));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({ refetchFresh: vi.fn(), tokens: [] }),
}));

const { HyperliquidProPerps } = await import("@/features/trade/components/hyperliquid-pro-perps");

// The chart's fullscreen control is drawn only when the desk can label it, and
// perps.expandChart and perps.exitChartFullscreen now ship in all five
// catalogs, so the real English catalog labels the control and the tests below
// use it directly. The degrade path still matters, though: ChartPanelShell only
// draws the control when it is handed a name, so a catalog that ever loses
// those keys must hide the affordance rather than render a raw key path. That
// case is proved against a catalog with the two keys stripped out, rather than
// against whatever the shipped one happens to contain.
const messagesWithFullscreen = messages;

const messagesWithoutFullscreen = (() => {
  const perps = { ...(messages.perps as Record<string, unknown>) };
  delete perps.expandChart;
  delete perps.exitChartFullscreen;
  return { ...messages, perps } as typeof messages;
})();

function renderDesk(catalog: typeof messages = messages) {
  return render(
    <NextIntlClientProvider locale="en" messages={catalog}>
      <HyperliquidProPerps />
    </NextIntlClientProvider>
  );
}

function region(container: HTMLElement, name: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-region="${name}"]`);
}

beforeEach(() => {
  trading.authenticated = true;
  trading.assets = [btc];
  trading.assetsLoading = false;
  trading.walletId = "wallet-1";
  trading.prices = { BTC: "64000", ETH: "3200" };
  marketContexts = [btcContext];
  ticketProps.mockClear();
  trading.refetchAll.mockClear();
  trading.refetchOrders.mockClear();
  trading.refreshBalances.mockClear();
  trading.actions.withdraw.mockReset();
  trading.actions.cancelOrder.mockReset();
  trading.actions.updateTriggerOrder.mockReset();
  trading.actions.closePosition.mockReset();
});

describe("HyperliquidProPerps", () => {
  it("fills the market column, the ticket and the ledger", () => {
    const { container } = renderDesk();

    expect(region(container, "market-list")).toHaveTextContent("BTC-USDC");
    expect(region(container, "ticket")).not.toBeNull();
    expect(region(container, "order-entry")).toContainElement(screen.getByTestId("order-ticket"));
    expect(region(container, "ledger")).toContainElement(screen.getByTestId("positions-list"));
    expect(region(container, "ledger")).toContainElement(screen.getByTestId("orders-list"));
  });

  it("hands the order ticket the selected market and its mark price", () => {
    renderDesk();

    const props = ticketProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(props.pair).toContain("BTC");
    expect(props.maxLeverage).toBe(40);
    // The quantity is collateral in USDC, so the asset the ticket gates on is
    // the margin balance, not the market being traded.
    const quantityAsset = props.quantityAsset as { symbol: string; decimals: number };
    expect(quantityAsset.symbol).toBe("USDC");
    // Over-balance must not disable the buttons on perps: placeOrder bridges
    // from Arbitrum and retries, so a short HyperCore balance is advisory.
    expect(props.overBalancePolicy).toBe("warn");
    // The pair pill is a badge now, so there is no market-picker callback left
    // to hand it. The picker is the market card in the left column.
    expect(props.onSelectPair).toBeUndefined();
  });

  it("keeps the order book and the trade tape off this surface", () => {
    renderDesk();

    expect(screen.queryByText("Order Book")).not.toBeInTheDocument();
    expect(screen.queryByText("Trades")).not.toBeInTheDocument();
  });

  it("collapses the chart from the toggle and brings it back", () => {
    const { container } = renderDesk();

    expect(region(container, "chart")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /close chart/i }));
    expect(region(container, "chart")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /show chart/i }));
    expect(region(container, "chart")).not.toBeNull();
  });

  it("puts the chart and its toggle in the left column, under the market list", () => {
    const { container } = renderDesk();

    const column = region(container, "market-column");
    expect(column).not.toBeNull();
    expect(column).toContainElement(region(container, "market-list"));
    expect(column).toContainElement(region(container, "chart"));
    expect(column).toContainElement(region(container, "chart-toggle"));
    // Not in the ticket: this is the move the user asked for, so assert the
    // chart left rather than only that it arrived.
    expect(region(container, "ticket")).not.toContainElement(region(container, "chart"));
  });

  it("offers no interface switch anywhere on the desk", () => {
    const { container } = renderDesk();

    expect(region(container, "mode-switch")).toBeNull();
    expect(screen.queryByRole("group", { name: /interface mode/i })).not.toBeInTheDocument();
  });

  it("hides the fullscreen control when the catalog cannot label it", () => {
    renderDesk(messagesWithoutFullscreen);

    expect(screen.queryByRole("button", { name: /expand chart/i })).not.toBeInTheDocument();
  });

  it("offers the fullscreen control from the shipped catalog", () => {
    renderDesk();

    expect(screen.getByRole("button", { name: "Expand chart" })).toBeInTheDocument();
  });

  it("takes the chart fullscreen and back out again", () => {
    renderDesk(messagesWithFullscreen);

    const expand = screen.getByRole("button", { name: "Expand chart" });
    expect(expand).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(expand);

    const exit = screen.getByRole("button", { name: "Exit fullscreen" });
    expect(exit).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(exit);
    expect(screen.getByRole("button", { name: "Expand chart" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("leaves fullscreen on Escape", () => {
    renderDesk(messagesWithFullscreen);

    fireEvent.click(screen.getByRole("button", { name: "Expand chart" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByRole("button", { name: "Expand chart" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("drops fullscreen when the chart is closed, which takes the way out with it", () => {
    const { container } = renderDesk(messagesWithFullscreen);

    fireEvent.click(screen.getByRole("button", { name: "Expand chart" }));
    fireEvent.click(screen.getByRole("button", { name: /close chart/i }));
    expect(region(container, "chart")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /show chart/i }));
    expect(screen.getByRole("button", { name: "Expand chart" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  // The user's screenshot showed the pair pill, the 24h change and the mark
  // price twice down the left column: once on the market card, then again on
  // the chart panel's own header directly under it. The desk stopped handing
  // the shell those props; these lock that in, and lock in that the fullscreen
  // control did not leave with them.
  it("does not repeat the market identity above the chart", () => {
    const { container } = renderDesk();

    const header = region(container, "chart-panel-header");
    expect(header).not.toBeNull();
    expect(header).not.toHaveTextContent("BTC-USDC");
    expect(header).not.toHaveTextContent("64,000");
    expect(header).not.toHaveTextContent("%");
  });

  // Fullscreen is the other half of the same decision. The market card is not
  // on the backdrop the panel is lifted onto, so a chart with no identity
  // there is a chart of an unnamed market at an unnamed price. The identity
  // goes on for fullscreen and comes straight back off on the way out.
  it("carries the market identity on the chart only while it is fullscreen", () => {
    const { container } = renderDesk(messagesWithFullscreen);
    const header = () => region(container, "chart-panel-header") as HTMLElement;

    expect(header()).not.toHaveTextContent("BTC-USDC");

    fireEvent.click(screen.getByRole("button", { name: "Expand chart" }));

    expect(header()).toHaveTextContent("BTC-USDC");
    expect(header()).toHaveTextContent("$64,000");
    expect(header()).toHaveTextContent("+6.67%");

    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));

    expect(header()).not.toHaveTextContent("BTC-USDC");
    expect(header()).not.toHaveTextContent("64,000");
    expect(header()).not.toHaveTextContent("%");
  });

  // REVERSES an earlier decision, on the user's report. The fullscreen pair
  // used to be a badge, on the reasoning that the only picker was in the column
  // behind the overlay and a trigger there would be a control that appears to
  // work and does not. The user asked to be able to pick pairs from fullscreen,
  // so the picker itself now comes onto the overlay. What the old test was
  // really protecting, that the header carries no dead trigger, is protected
  // here by driving the live one.
  describe("picking a market from inside fullscreen", () => {
    const fullscreenHeader = (container: HTMLElement) =>
      region(container, "chart-panel-header") as HTMLElement;

    function openFullscreenPicker(container: HTMLElement) {
      fireEvent.click(screen.getByRole("button", { name: "Expand chart" }));
      const trigger = within(fullscreenHeader(container)).getByRole("button", {
        name: /BTC-USDC/,
      });
      fireEvent.click(trigger);
      return trigger;
    }

    it("puts the desk's own market picker in the fullscreen header", () => {
      trading.assets = [btc, eth];
      marketContexts = [btcContext, ethContext];
      const { container } = renderDesk(messagesWithFullscreen);

      openFullscreenPicker(container);

      // The same searchable Market/Last Price/24h Change table the column's
      // card opens, not a second list built for the overlay.
      expect(screen.getByPlaceholderText("Search markets")).toBeInTheDocument();
      expect(within(fullscreenHeader(container)).getByText("Open Interest")).toBeInTheDocument();
    });

    it("switches the market and stays fullscreen", () => {
      trading.assets = [btc, eth];
      marketContexts = [btcContext, ethContext];
      const { container } = renderDesk(messagesWithFullscreen);

      openFullscreenPicker(container);
      expect(fullscreenHeader(container)).toHaveTextContent("BTC-USDC");

      fireEvent.click(
        within(fullscreenHeader(container)).getByRole("button", { name: /ETH-USDC/ })
      );

      expect(fullscreenHeader(container)).toHaveTextContent("ETH-USDC");
      expect(fullscreenHeader(container)).not.toHaveTextContent("BTC-USDC");
      // Still fullscreen: the pick is not a way out of it.
      expect(screen.getByRole("button", { name: "Exit fullscreen" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(screen.queryByPlaceholderText("Search markets")).not.toBeInTheDocument();
    });

    it("drives the desk's own market state, not a copy of it", () => {
      trading.assets = [btc, eth];
      marketContexts = [btcContext, ethContext];
      const { container } = renderDesk(messagesWithFullscreen);

      openFullscreenPicker(container);
      fireEvent.click(
        within(fullscreenHeader(container)).getByRole("button", { name: /ETH-USDC/ })
      );

      // The order ticket moved with it while still fullscreen.
      const props = ticketProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(props.pair).toBe("ETH-USDC");
      expect(props.maxLeverage).toBe(25);

      // And the desk is still on that market once the overlay is gone.
      fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
      expect(region(container, "market-list")).toHaveTextContent("ETH-USDC");
    });

    // Escape already means "leave fullscreen" here. With a menu open it means
    // "close the menu" first, or the one key closes two things at once and the
    // user lands back on the desk they did not ask to return to.
    it("closes the menu on Escape without leaving fullscreen, then leaves on the next one", () => {
      trading.assets = [btc, eth];
      marketContexts = [btcContext, ethContext];
      const { container } = renderDesk(messagesWithFullscreen);

      openFullscreenPicker(container);
      expect(screen.getByPlaceholderText("Search markets")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });

      expect(screen.queryByPlaceholderText("Search markets")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Exit fullscreen" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      // Focus goes back to the control the user opened, not to the body.
      expect(document.activeElement).toBe(
        within(fullscreenHeader(container)).getByRole("button", { name: /BTC-USDC/ })
      );

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.getByRole("button", { name: "Expand chart" })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    });

    // The panel variant is unchanged: the market card sits directly above the
    // chart there, so the chart header stays a bare fullscreen control.
    it("keeps the picker off the chart header while the chart is in the column", () => {
      trading.assets = [btc, eth];
      const { container } = renderDesk(messagesWithFullscreen);

      const header = fullscreenHeader(container);
      expect(header).not.toHaveTextContent("BTC-USDC");
      const buttons = within(header).getAllByRole("button");
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveAttribute("aria-label", "Expand chart");
    });
  });

  it("leaves the market identity on the market card, which is the one copy", () => {
    const { container } = renderDesk();

    expect(region(container, "market-list")).toHaveTextContent("BTC-USDC");
    expect(region(container, "market-list")).toHaveTextContent("$64,000");
  });

  it("keeps the fullscreen control in the chart header the identity props no longer raise", () => {
    const { container } = renderDesk();

    const header = region(container, "chart-panel-header");
    expect(header).toContainElement(screen.getByRole("button", { name: "Expand chart" }));
  });

  // CHANGE 1: the two account actions used to stack full width under the
  // ticket, a mint-green Top up over a dark Withdraw. They are one row now, in
  // the geometry PerpOrderTicket gives Buy and Sell directly above them.
  // llms.txt §10: refetch what an action changed, not everything. A cancel or
  // a trigger edit touches only orders; opening or closing a trade moves
  // margin, positions and orders together.
  describe("refreshing after an action", () => {
    const order = { id: "order-1", status: "open" } as never;
    const position = { id: "position-1" } as never;

    it("refreshes only the orders after a cancel", async () => {
      renderDesk();
      const props = ordersListProps.mock.calls.at(-1)?.[0] as {
        onCancel: (o: unknown) => Promise<void>;
      };
      await act(async () => props.onCancel(order));
      expect(trading.actions.cancelOrder).toHaveBeenCalledWith("order-1");
      expect(trading.refetchOrders).toHaveBeenCalled();
      expect(trading.refetchAll).not.toHaveBeenCalled();
    });

    it("refreshes only the orders after a trigger edit", async () => {
      renderDesk();
      const props = positionsListProps.mock.calls.at(-1)?.[0] as {
        onEditTrigger: (p: unknown, kind: string, price: string, id?: string) => Promise<void>;
      };
      await act(async () => props.onEditTrigger(position, "take_profit", "70000", undefined));
      expect(trading.refetchOrders).toHaveBeenCalled();
      expect(trading.refetchAll).not.toHaveBeenCalled();
    });

    it("refreshes everything after a close", async () => {
      renderDesk();
      const props = positionsListProps.mock.calls.at(-1)?.[0] as {
        onClosePosition: (p: unknown, siblings: string[]) => Promise<void>;
      };
      await act(async () => props.onClosePosition(position, []));
      expect(trading.refetchAll).toHaveBeenCalled();
    });
  });

  describe("top up and withdraw", () => {
    const topUp = () => screen.getByRole("button", { name: "Top up" });
    const withdraw = () => screen.getByRole("button", { name: "Withdraw" });

    it("puts them side by side in one row, sharing the width", () => {
      renderDesk();

      const row = topUp().parentElement as HTMLElement;
      expect(withdraw().parentElement).toBe(row);
      expect(row.className).toContain("flex");
      expect(row.className).not.toContain("flex-col");
      for (const button of [topUp(), withdraw()]) {
        expect(button.className).toContain("flex-1");
      }
    });

    // The same height, radius and label type as the Buy/Sell pair in
    // perp-order-ticket.tsx, so the two rows read as one family.
    it("matches the order buttons' height, radius and label type", () => {
      renderDesk();

      for (const button of [topUp(), withdraw()]) {
        expect(button.className).toContain("h-12");
        expect(button.className).toContain("rounded-3xl");
        expect(button.className).toContain("text-[16px]");
        expect(button.className).toContain("font-semibold");
      }
    });

    // bg-buy and bg-sell mean "this places an order". A green button that is
    // not Buy, sitting under Buy, on a leveraged desk, is a misfire waiting to
    // happen, so these two are deliberately the quieter pair.
    it("does not dress account actions in the order action colours", () => {
      renderDesk();

      for (const button of [topUp(), withdraw()]) {
        expect(button.className).not.toContain("bg-buy");
        expect(button.className).not.toContain("bg-sell");
        expect(button.className).not.toContain("bg-up");
        expect(button.className).not.toContain("bg-down");
      }
    });

    it("hands the withdraw modal the exact free balance and withdraws the typed total", async () => {
      trading.actions.withdraw.mockResolvedValue({ treasuryMovementId: "movement-1" });
      renderDesk();
      fireEvent.click(withdraw());
      expect(screen.getByText("500 USDC available")).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "100" } });
      const confirm = screen.getAllByRole("button", { name: "Withdraw" }).at(-1) as HTMLElement;
      await act(async () => fireEvent.click(confirm));

      expect(trading.actions.withdraw).toHaveBeenCalledWith("100", expect.any(Function));
      expect(trading.refreshBalances).toHaveBeenCalled();
    });

    it("still opens the fund modal", () => {
      renderDesk();

      expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
      fireEvent.click(topUp());
      expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    });

    it("holds top up in a disabled Preparing state until the wallet exists", () => {
      trading.walletId = null;
      renderDesk();

      const preparing = screen.getByRole("button", { name: "Preparing…" });
      expect(preparing).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Top up" })).not.toBeInTheDocument();
      expect(withdraw()).toBeDisabled();
    });

    // The ticket stays live on a short balance (placeOrder bridges), so the way
    // to clear the shortfall gets the accent instead: the same kash tone the
    // ticket's "may bridge" advisory carries, so the note and the fix match.
    // The ticket is stubbed here, so the collateral is driven through the
    // onQuantityChange it was handed rather than by typing into a real field.
    const setCollateral = (value: string) => {
      const props = ticketProps.mock.calls.at(-1)?.[0] as {
        onQuantityChange: (v: string) => void;
      };
      act(() => props.onQuantityChange(value));
    };

    it("accents Top up when the entered collateral outruns the balance", () => {
      renderDesk(); // withdrawable is 500 USDC

      expect(topUp().className).toContain("border-hairline");
      expect(topUp().className).not.toContain("border-kash");

      setCollateral("600");

      expect(topUp().className).toContain("border-kash");
      expect(topUp().className).not.toContain("border-hairline");
    });

    it("leaves Top up unaccented when the collateral fits the balance", () => {
      renderDesk();

      setCollateral("100");

      expect(topUp().className).toContain("border-hairline");
      expect(topUp().className).not.toContain("border-kash");
    });

    // A shortfall while the wallet is still preparing has no live Top up to
    // accent, so the emphasis holds off rather than lighting a disabled button.
    it("does not accent Top up before the wallet exists", () => {
      trading.walletId = null;
      renderDesk();

      const preparing = screen.getByRole("button", { name: "Preparing…" });
      const props = ticketProps.mock.calls.at(-1)?.[0] as {
        onQuantityChange: (v: string) => void;
      };
      act(() => props.onQuantityChange("600"));

      expect(preparing.className).not.toContain("border-kash");
    });
  });

  // CHANGE 3, half one: the caret on the LEFT COLUMN market card stays, and
  // this is why. That card is the only market picker on the desk, so its caret
  // names a control that works. If this test ever fails because the column
  // grew an always-open market table, the caret has become noise and can go.
  it("keeps the market card as the live market picker", () => {
    const { container } = renderDesk();

    const list = region(container, "market-list") as HTMLElement;
    expect(screen.queryByPlaceholderText("Search markets")).not.toBeInTheDocument();

    fireEvent.click(within(list).getByRole("button", { name: /BTC-USDC/ }));

    expect(screen.getByPlaceholderText("Search markets")).toBeInTheDocument();
    expect(within(list).getByText("Open Interest")).toBeInTheDocument();
  });

  it("keeps the frame and shows the fallbacks when the session is signed out", () => {
    trading.authenticated = false;
    trading.assets = [];
    const { container } = renderDesk();

    expect(region(container, "market-list")).toHaveTextContent("Sign in to trade perps.");
    expect(region(container, "ticket")).toHaveTextContent("Sign in to trade perps.");
    expect(region(container, "order-entry")).toBeNull();
    expect(region(container, "ledger")).toBeNull();
    expect(screen.queryByTestId("order-form")).not.toBeInTheDocument();
  });

  it("stands the market column in with a loading message before the assets land", () => {
    trading.assets = [];
    trading.assetsLoading = true;
    const { container } = renderDesk();

    expect(region(container, "market-list")).toHaveTextContent("Loading markets…");
  });
});
