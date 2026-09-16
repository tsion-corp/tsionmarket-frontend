import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { SpotTicket } from "@/features/trade/components/spot-ticket";
import type { SpotMarket } from "@/features/trade/hooks/use-spot-markets";
import type { TokenBalance } from "@/lib/server/alchemy";

// The suite reads the shipped catalogue, so it asserts the English a reader
// actually sees and fails if a key is ever dropped from messages/*.json.
const messages = en;

const portfolioState = vi.hoisted(() => ({
  tokens: [] as TokenBalance[],
  loading: false,
  error: false,
  refetch: vi.fn(),
}));

vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => portfolioState,
}));

const buyState = vi.hoisted(() => ({ pending: false, submit: vi.fn() }));

vi.mock("@/features/trade/hooks/use-spot-buy", () => ({
  useSpotBuy: () => buyState,
}));

const sellState = vi.hoisted(() => ({
  pending: false,
  blockedReason: null as string | null,
  submit: vi.fn(),
}));

vi.mock("@/features/trade/hooks/use-spot-sell", () => ({
  useSpotSell: () => sellState,
}));

// A holding of the market this ticket points at, so the sell leg has something
// to draw down.
function btc(rawBalance: string): TokenBalance {
  return {
    symbol: "BTC",
    name: "Bitcoin",
    network: "base-mainnet",
    address: "0xbtc",
    decimals: 8,
    balance: Number(rawBalance) / 1e8,
    rawBalance,
    priceUsd: 64072.55,
    valueUsd: (Number(rawBalance) / 1e8) * 64072.55,
    logo: null,
  } as TokenBalance;
}

function market(over: Partial<SpotMarket> = {}): SpotMarket {
  return {
    symbol: "BTC",
    name: "Bitcoin",
    priceUsd: 64072.55,
    change24h: -2.2,
    marketCap: 1e12,
    logo: null,
    coingeckoId: "bitcoin",
    ...over,
  } as SpotMarket;
}

// A USDC holding on Base, the only balance the ticket spends from.
function usdc(rawBalance: string): TokenBalance {
  return {
    symbol: "USDC",
    name: "USD Coin",
    network: "base-mainnet",
    address: "0xusdc",
    decimals: 6,
    balance: Number(rawBalance) / 1e6,
    rawBalance,
    priceUsd: 1,
    valueUsd: Number(rawBalance) / 1e6,
    logo: null,
  } as TokenBalance;
}

function renderTicket(over: Partial<SpotMarket> = {}) {
  const onChangeMarket = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SpotTicket market={market(over)} onChangeMarket={onChangeMarket} />
    </NextIntlClientProvider>
  );
  return { onChangeMarket };
}

function amountField(): HTMLInputElement {
  return screen.getByLabelText(en.spot.amountLabel) as HTMLInputElement;
}

beforeEach(() => {
  sellState.pending = false;
  sellState.blockedReason = null;
  sellState.submit.mockClear();
  portfolioState.tokens = [usdc("1240000000")];
  portfolioState.loading = false;
  portfolioState.error = false;
  buyState.pending = false;
  vi.clearAllMocks();
});

describe("SpotTicket", () => {
  it("names the market as a pair against the token the ticket actually pays with", () => {
    renderTicket();
    expect(screen.getByRole("button", { name: en.spot.selectMarket })).toHaveTextContent(
      "BTC/USDC"
    );
  });

  it("sends the reader back to the list to change market, since the list is the picker", () => {
    const { onChangeMarket } = renderTicket();
    fireEvent.click(screen.getByRole("button", { name: en.spot.selectMarket }));
    expect(onChangeMarket).toHaveBeenCalledOnce();
  });

  it("prints the 24h change in the loss tone, never as a bare number", () => {
    renderTicket();
    expect(screen.getByText("-2.20%").className).toContain("text-down");
  });

  // Spot fills at market. A Limit segment would offer an order this desk has no
  // backend to rest, so it is not drawn at all.
  it("offers no order-type toggle", () => {
    renderTicket();
    expect(screen.queryByRole("button", { name: en.spot.limit })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.spot.market })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: en.spot.orderType })).not.toBeInTheDocument();
  });

  it("shows the market price beside the token it is quoted in", () => {
    renderTicket();
    const price = screen.getByTestId("spot-price-row");
    expect(within(price).getByText("64,072.55")).toBeInTheDocument();
    expect(within(price).getByText("USDC")).toBeInTheDocument();
  });

  it("says the price is unavailable rather than printing a zero", () => {
    renderTicket({ priceUsd: 0 });
    const price = screen.getByTestId("spot-price-row");
    expect(within(price).getByText(en.spot.priceUnavailable)).toBeInTheDocument();
    expect(within(price).queryByText("0")).not.toBeInTheDocument();
    expect(within(price).queryByText("0.00")).not.toBeInTheDocument();
  });

  it("holds the amount card back until the balance is known, so no zero is invented", () => {
    portfolioState.loading = true;
    portfolioState.tokens = [];
    renderTicket();

    expect(screen.getByText(en.spot.loadingBalance)).toBeInTheDocument();
    expect(screen.queryByLabelText(en.spot.amountLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(/Balance 0 USDC/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.spot.buy })).not.toBeInTheDocument();
  });

  it("offers a retry when the balance fails to load", () => {
    portfolioState.error = true;
    portfolioState.tokens = [];
    renderTicket();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(portfolioState.refetch).toHaveBeenCalled();
  });

  it("shows the balance from base units, not from a float", () => {
    renderTicket();
    expect(screen.getByText("Balance 1,240 USDC")).toBeInTheDocument();
  });

  it("prices the order and its fee in exact base units", () => {
    renderTicket();
    fireEvent.change(amountField(), { target: { value: "500" } });

    expect(screen.getByText("500.00 USDC")).toBeInTheDocument();
    // 10 bps of 500 USDC, computed as bigint base units.
    expect(screen.getByText("0.50 USDC")).toBeInTheDocument();
  });

  // Spot is unleveraged. There is no liquidation price to show, so any number
  // in that row would be invented.
  it("never shows a liquidation price", () => {
    renderTicket();
    fireEvent.change(amountField(), { target: { value: "500" } });
    expect(screen.queryByText(/liquidation/i)).not.toBeInTheDocument();
  });

  // There is no spot order-list or trade-history service, so a strip promising
  // three views is not drawn.
  it("draws no Orders / Positions / History strip", () => {
    renderTicket();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByText(/history/i)).not.toBeInTheDocument();
  });

  /**
   * Buy and Sell are words on the switch, not two live buttons over one field.
   * The pair still never reads by colour alone; it is just the switch that
   * carries the pair now, and the action below follows whichever is chosen.
   */
  it("names both legs on the switch and shows the action for the chosen one", () => {
    renderTicket();
    expect(screen.getByRole("radio", { name: en.spot.buy })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: en.spot.sell })).toBeInTheDocument();

    fireEvent.change(amountField(), { target: { value: "500" } });
    const action = screen.getByRole("button", { name: en.spot.buy });
    // 48px tall, over the 44px minimum touch target.
    expect(action.className).toContain("h-12");
    expect(screen.queryByRole("button", { name: en.spot.sell })).not.toBeInTheDocument();
  });

  /**
   * The bug this switch removes. The field is denominated in USDC while buying
   * and in the coin while selling, so the figure must not survive the flip: 500
   * meaning "$500 of BTC" would otherwise become "sell 500 BTC".
   */
  it("clears the amount when the leg changes, so no figure changes meaning", () => {
    renderTicket();
    fireEvent.change(amountField(), { target: { value: "500" } });
    expect(amountField().value).toBe("500");

    fireEvent.click(screen.getByRole("radio", { name: en.spot.sell }));
    expect(screen.getByLabelText(en.spot.amountLabelSell)).toHaveValue("");
  });

  /**
   * The three sell-leg pieces are built separately and each has its own unit
   * test. This is the one that proves they are actually wired into the panel
   * together, which no unit test can say.
   */
  it("fills the sell leg with the share shortcuts and a payout summary", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("radio", { name: en.spot.sell }));

    // Inside the field's own border, under the input.
    const shortcuts = screen.getByRole("group", { name: en.spot.sellShortcutsLabel });
    expect(shortcuts).toBeInTheDocument();
    for (const label of ["25%", "50%", "75%", en.spot.max]) {
      expect(within(shortcuts).getByRole("button", { name: label })).toBeInTheDocument();
    }

    // The summary keeps the area above the action filled, and says these are
    // estimates rather than the quoted figures the sell sheet will produce.
    expect(screen.getByText(en.spot.youReceive)).toBeInTheDocument();
    expect(screen.getByText(en.spot.estFee)).toBeInTheDocument();
    expect(screen.queryByText(en.spot.purchaseValue)).not.toBeInTheDocument();
  });

  /** The buy leg keeps the rows it always had, and shows no share shortcuts. */
  it("leaves the buy leg priced in USDC with no share shortcuts", () => {
    renderTicket();
    expect(screen.getByText(en.spot.purchaseValue)).toBeInTheDocument();
    expect(screen.getByText(en.spot.fee)).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: en.spot.sellShortcutsLabel })
    ).not.toBeInTheDocument();
  });

  /**
   * The defect this test was written for.
   *
   * Pressing Sell under the Sell tab used to open the sell sheet instead of
   * selling: a modal on the desktop desk, an extra panel below the ticket on a
   * phone. The amount is already entered, in the coin, on the leg the user
   * chose, so a second screen asking for it again is the ticket refusing to do
   * the one thing its button says it does.
   */
  it("sells from the ticket instead of opening a second screen", async () => {
    portfolioState.tokens = [usdc("1240000000"), btc("50000000")];
    renderTicket();
    fireEvent.click(screen.getByRole("radio", { name: en.spot.sell }));
    fireEvent.change(screen.getByLabelText(en.spot.amountLabelSell), {
      target: { value: "0.25" },
    });

    fireEvent.click(screen.getByRole("button", { name: en.spot.sell }));

    expect(sellState.submit).toHaveBeenCalledWith("0.25");
    // No sheet, on either breakpoint: the ticket is the whole flow now.
    expect(screen.queryByText(en.buySell.amountToSell)).not.toBeInTheDocument();
  });

  /** Selling counts the coin, so the field names it and measures the holding. */
  it("denominates the field in the coin on the sell leg", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("radio", { name: en.spot.sell }));
    expect(screen.getByText(en.spot.youAreSelling)).toBeInTheDocument();
    expect(screen.getByText("Balance 0 BTC")).toBeInTheDocument();
  });

  it("submits the buy the amount field holds", () => {
    renderTicket();
    fireEvent.change(amountField(), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: en.spot.buy }));
    expect(buyState.submit).toHaveBeenCalled();
  });

  it("opens on the chart, and folds it away when asked", () => {
    renderTicket();
    const disclosure = screen.getByRole("button", { name: new RegExp(en.spot.viewChart) });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
  });

  it("shows what is held in this market, from base units", () => {
    portfolioState.tokens = [
      usdc("1240000000"),
      {
        symbol: "BTC",
        name: "Bitcoin",
        network: "base-mainnet",
        address: "0xbtc",
        decimals: 8,
        balance: 0.5,
        rawBalance: "50000000",
        priceUsd: 64072.55,
        valueUsd: 32036.27,
        logo: null,
      } as TokenBalance,
    ];
    renderTicket();
    expect(screen.getByText("0.5 BTC")).toBeInTheDocument();
    expect(screen.getByText("$32,036.27")).toBeInTheDocument();
  });

  it("says so plainly when nothing is held in this market", () => {
    renderTicket();
    expect(screen.getByText("You don't hold any BTC yet.")).toBeInTheDocument();
  });

  it("cannot sell a market the wallet holds none of, and says which", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("radio", { name: en.spot.sell }));
    expect(screen.getByRole("button", { name: en.spot.sell })).toBeDisabled();
    expect(screen.getAllByText("You don't own any BTC to sell yet.").length).toBeGreaterThan(0);
    // Nothing to sell means nothing to type, so the field is closed too.
    expect(screen.getByLabelText(en.spot.amountLabelSell)).toBeDisabled();
  });
});
