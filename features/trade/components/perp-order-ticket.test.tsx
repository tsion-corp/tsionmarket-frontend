import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import {
  PerpLeverageCard,
  LEVERAGE_PRESETS,
  clampLeverage,
  leverageFillPercent,
  visiblePresets,
  type PerpLeverageCardProps,
  type PerpMarginMode,
} from "@/features/trade/components/perp-leverage-card";
import {
  PerpOrderTicket,
  type PerpOrderTicketProps,
} from "@/features/trade/components/perp-order-ticket";

// Every string this ticket renders is read from the shipped English catalogue,
// so a key that is renamed or dropped out from under it fails here rather than
// reaching a trader as a raw key.
const messages = en;

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

const USDC_DECIMALS = 6;
// 1,240 USDC in base units. Written out rather than computed so the fixture
// cannot drift with the helper it is meant to check.
const BALANCE_1240 = 1_240_000_000n;

// An 18-decimal collateral holding one wei more than a whole token. Every
// float-based comparison reads this and the amount below it as the same
// number, which is the defect these fixtures exist to catch.
const WEI_DECIMALS = 18;
const BALANCE_ONE_TOKEN_PLUS_A_WEI = 1_000_000_000_000_000_001n;

// A long and a short break on opposite sides of entry, so the two figures are
// deliberately different: a fixture that reused one number could not tell a
// correctly labelled pair of rows from a single figure printed twice.
const SUMMARY: PerpOrderTicketProps["summary"] = {
  orderValue: "5,000 USDC",
  entryPrice: "$64,072.55",
  liquidation: { buy: "$57,982.40", sell: "$70,162.70" },
  openingFee: "3.50 USDC",
};

// The text of the row the given label sits in.
function summaryRowText(label: string): string {
  const cell = screen.getByText(label);
  return cell.parentElement?.textContent ?? "";
}

// ---------------------------------------------------------------------------
// Leverage card
// ---------------------------------------------------------------------------

type LeverageHarnessProps = Partial<PerpLeverageCardProps> & { initial?: number };

// The card is controlled, so the tests drive it through a real state holder.
// A slider that moved without the parent agreeing would pass an assertion made
// against internal state and fail here, which is the point.
function LeverageHarness({ initial = 10, onLeverageChange, ...rest }: LeverageHarnessProps) {
  const [leverage, setLeverage] = useState(initial);
  return (
    <PerpLeverageCard
      leverage={leverage}
      onLeverageChange={(next) => {
        onLeverageChange?.(next);
        setLeverage(next);
      }}
      max={20}
      {...rest}
    />
  );
}

function renderLeverage(props: LeverageHarnessProps = {}) {
  const onLeverageChange = vi.fn();
  renderWithIntl(<LeverageHarness onLeverageChange={onLeverageChange} {...props} />);
  return {
    onLeverageChange,
    slider: screen.getByRole("slider", { name: "Leverage" }),
    chip: (label: string) => screen.getByRole("button", { name: label }),
  };
}

// Margin mode is controlled the same way leverage is, so it gets the same kind
// of real state holder rather than an assertion made against internal state.
function MarginModeHarness({
  initial = "cross",
  onMarginModeChange,
}: {
  initial?: PerpMarginMode;
  onMarginModeChange?: (next: PerpMarginMode) => void;
}) {
  const [marginMode, setMarginMode] = useState<PerpMarginMode>(initial);
  return (
    <PerpLeverageCard
      leverage={10}
      onLeverageChange={vi.fn()}
      max={20}
      marginMode={marginMode}
      onMarginModeChange={(next) => {
        onMarginModeChange?.(next);
        setMarginMode(next);
      }}
    />
  );
}

describe("clampLeverage", () => {
  it("holds a value inside the market's own bounds", () => {
    expect(clampLeverage(10, 1, 20)).toBe(10);
    expect(clampLeverage(0, 1, 20)).toBe(1);
    expect(clampLeverage(40, 1, 20)).toBe(20);
  });

  it("falls back to the floor for a value that is not a finite number", () => {
    expect(clampLeverage(Number.NaN, 1, 20)).toBe(1);
    expect(clampLeverage(Number.POSITIVE_INFINITY, 1, 20)).toBe(20);
  });

  it("rounds to a whole multiplier, which is all a perp venue accepts", () => {
    expect(clampLeverage(10.4, 1, 20)).toBe(10);
    expect(clampLeverage(10.6, 1, 20)).toBe(11);
  });
});

describe("leverageFillPercent", () => {
  it("measures the filled track from the floor, not from zero", () => {
    expect(leverageFillPercent(1, 1, 21)).toBe(0);
    expect(leverageFillPercent(11, 1, 21)).toBe(50);
    expect(leverageFillPercent(21, 1, 21)).toBe(100);
  });

  it("never leaves the track when the value is out of bounds", () => {
    expect(leverageFillPercent(0, 1, 20)).toBe(0);
    expect(leverageFillPercent(99, 1, 20)).toBe(100);
  });

  it("reads a degenerate range as empty rather than dividing by zero", () => {
    expect(leverageFillPercent(5, 5, 5)).toBe(0);
  });
});

describe("visiblePresets", () => {
  it("drops a preset the market does not allow", () => {
    expect(visiblePresets(LEVERAGE_PRESETS, 1, 10)).toEqual([2, 5, 10]);
    expect(visiblePresets(LEVERAGE_PRESETS, 5, 20)).toEqual([5, 10, 20]);
  });

  it("keeps the design's four chips when the market allows them all", () => {
    expect(visiblePresets(LEVERAGE_PRESETS, 1, 20)).toEqual([2, 5, 10, 20]);
  });
});

describe("PerpLeverageCard", () => {
  it("shows the slider and the presets on the same value", () => {
    const { slider } = renderLeverage({ initial: 10 });
    expect(slider).toHaveValue("10");
    expect(screen.getByText("10.0x")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10x" })).toHaveAttribute("aria-pressed", "true");
    for (const other of ["2x", "5x", "20x"]) {
      expect(screen.getByRole("button", { name: other })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("moves the chips when the slider moves", () => {
    const { slider, onLeverageChange } = renderLeverage({ initial: 10 });

    fireEvent.change(slider, { target: { value: "20" } });

    expect(onLeverageChange).toHaveBeenCalledWith(20);
    expect(slider).toHaveValue("20");
    expect(screen.getByText("20.0x")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "20x" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "10x" })).toHaveAttribute("aria-pressed", "false");
  });

  it("moves the slider when a chip is picked", () => {
    const { slider, chip, onLeverageChange } = renderLeverage({ initial: 10 });

    fireEvent.click(chip("5x"));

    expect(onLeverageChange).toHaveBeenCalledWith(5);
    expect(slider).toHaveValue("5");
    expect(screen.getByText("5.0x")).toBeInTheDocument();
    expect(chip("5x")).toHaveAttribute("aria-pressed", "true");
  });

  it("lands on a value between two presets with no chip pressed", () => {
    const { slider } = renderLeverage({ initial: 10 });

    fireEvent.change(slider, { target: { value: "7" } });

    expect(screen.getByText("7.0x")).toBeInTheDocument();
    for (const label of ["2x", "5x", "10x", "20x"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("holds the parent's value rather than any of its own", () => {
    // The parent here refuses every change, which is what an uncontrolled
    // internal state would quietly override.
    renderWithIntl(<PerpLeverageCard leverage={10} onLeverageChange={vi.fn()} max={20} />);
    const slider = screen.getByRole("slider", { name: "Leverage" });

    fireEvent.change(slider, { target: { value: "20" } });

    expect(slider).toHaveValue("10");
    expect(screen.getByRole("button", { name: "10x" })).toHaveAttribute("aria-pressed", "true");
  });

  it("takes the market's ceiling for the slider and hides the chips above it", () => {
    renderWithIntl(<PerpLeverageCard leverage={5} onLeverageChange={vi.fn()} max={10} />);

    expect(screen.getByRole("slider", { name: "Leverage" })).toHaveAttribute("max", "10");
    expect(screen.queryByRole("button", { name: "20x" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10x" })).toBeInTheDocument();
  });

  it("locks every control while an order is in flight", () => {
    renderWithIntl(<PerpLeverageCard leverage={10} onLeverageChange={vi.fn()} max={20} disabled />);

    expect(screen.getByRole("slider", { name: "Leverage" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "10x" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "2x" })).toBeDisabled();
  });

  it("draws no margin control when the composer does not own that state", () => {
    renderLeverage({ initial: 10 });

    expect(screen.queryByRole("button", { name: "Cross" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Isolated" })).not.toBeInTheDocument();
  });

  it("draws no margin control for a value handed over without a handler", () => {
    // Half a contract is worse than none: a pair of chips that cannot report a
    // change would look like a live risk setting and silently do nothing.
    renderWithIntl(
      <PerpLeverageCard leverage={10} onLeverageChange={vi.fn()} max={20} marginMode="isolated" />
    );

    expect(screen.queryByRole("button", { name: "Isolated" })).not.toBeInTheDocument();
  });

  it("reports a margin mode change and moves onto the new one", () => {
    const onMarginModeChange = vi.fn();
    renderWithIntl(<MarginModeHarness onMarginModeChange={onMarginModeChange} />);

    expect(screen.getByRole("button", { name: "Cross" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Isolated" }));

    expect(onMarginModeChange).toHaveBeenCalledWith("isolated");
    expect(screen.getByRole("button", { name: "Isolated" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Cross" })).toHaveAttribute("aria-pressed", "false");
  });

  it("holds the parent's margin mode rather than any of its own", () => {
    renderWithIntl(
      <PerpLeverageCard
        leverage={10}
        onLeverageChange={vi.fn()}
        max={20}
        marginMode="cross"
        onMarginModeChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Isolated" }));

    expect(screen.getByRole("button", { name: "Cross" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Isolated" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("locks the margin chips while an order is in flight", () => {
    renderWithIntl(
      <PerpLeverageCard
        leverage={10}
        onLeverageChange={vi.fn()}
        max={20}
        marginMode="cross"
        onMarginModeChange={vi.fn()}
        disabled
      />
    );

    expect(screen.getByRole("button", { name: "Cross" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Isolated" })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Order ticket
// ---------------------------------------------------------------------------

type TicketHarnessProps = Partial<PerpOrderTicketProps> & { initialQuantity?: string };

function TicketHarness({ initialQuantity = "", onQuantityChange, ...rest }: TicketHarnessProps) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [leverage, setLeverage] = useState(10);
  return (
    <PerpOrderTicket
      pair="BTC/USDT"
      change24h="-2.20%"
      changeDirection="down"
      mode="market"
      onModeChange={vi.fn()}
      price="1.00001"
      quoteSymbol="USDT"
      quantity={quantity}
      onQuantityChange={(next) => {
        onQuantityChange?.(next);
        setQuantity(next);
      }}
      quantityAsset={{ balance: BALANCE_1240, decimals: USDC_DECIMALS, symbol: "USDC" }}
      leverage={leverage}
      onLeverageChange={setLeverage}
      maxLeverage={20}
      summary={SUMMARY}
      onBuy={vi.fn()}
      onSell={vi.fn()}
      {...rest}
    />
  );
}

function renderTicket(props: TicketHarnessProps = {}) {
  const onBuy = vi.fn();
  const onSell = vi.fn();
  const onQuantityChange = vi.fn();
  renderWithIntl(
    <TicketHarness onBuy={onBuy} onSell={onSell} onQuantityChange={onQuantityChange} {...props} />
  );
  return {
    onBuy,
    onSell,
    onQuantityChange,
    buy: screen.getByRole("button", { name: "Buy" }),
    sell: screen.getByRole("button", { name: "Sell" }),
    quantity: screen.getByRole("textbox", { name: "Order quantity" }),
  };
}

// Triggers are controlled too: the disclosure's open state and both prices
// live with the composer, so the ticket cannot be holding a trigger price the
// order about to be signed knows nothing about.
function renderTicketWithTriggers(open = false, props: TicketHarnessProps = {}) {
  const takeProfit = vi.fn();
  const stopLoss = vi.fn();

  function Harness() {
    const [isOpen, setOpen] = useState(open);
    const [tp, setTp] = useState("");
    const [sl, setSl] = useState("");
    return (
      <TicketHarness
        initialQuantity="500"
        triggers={{
          open: isOpen,
          onOpenChange: setOpen,
          takeProfit: {
            value: tp,
            onChange: (next) => {
              takeProfit(next);
              setTp(next);
            },
          },
          stopLoss: {
            value: sl,
            onChange: (next) => {
              stopLoss(next);
              setSl(next);
            },
          },
        }}
        {...props}
      />
    );
  }

  renderWithIntl(<Harness />);
  return { takeProfit, stopLoss };
}

describe("PerpOrderTicket", () => {
  it("draws the design's rows from the values it is handed", () => {
    renderTicket({ initialQuantity: "500" });

    expect(screen.getByText("BTC/USDT")).toBeInTheDocument();
    expect(screen.getByText("-2.20%")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("1.00001")).toBeInTheDocument();
    expect(screen.getByText("USDT")).toBeInTheDocument();
    expect(screen.getByText("Balance: 1,240 USDC")).toBeInTheDocument();
    expect(screen.getByText("Order Value")).toBeInTheDocument();
    expect(screen.getByText("5,000 USDC")).toBeInTheDocument();
    expect(screen.getByText("$64,072.55")).toBeInTheDocument();
    expect(screen.getByText("3.50 USDC")).toBeInTheDocument();
  });

  // The comp draws one "Est. liquidation" row. This ticket has two action
  // buttons and picks the direction at the click, so an unlabelled figure
  // would be right for one button and wrong, unsafely, for the other.
  it("gives each direction its own labelled liquidation level", () => {
    renderTicket({ initialQuantity: "500" });

    expect(summaryRowText("Est. liquidation · Long")).toContain("$57,982.40");
    expect(summaryRowText("Est. liquidation · Short")).toContain("$70,162.70");
    expect(screen.queryByText("Est. liquidation")).not.toBeInTheDocument();
  });

  it("marks one direction unavailable without touching the other", () => {
    renderTicket({
      initialQuantity: "500",
      summary: { ...SUMMARY, liquidation: { buy: "$57,982.40", sell: null } },
    });

    expect(summaryRowText("Est. liquidation · Long")).toContain("$57,982.40");
    expect(summaryRowText("Est. liquidation · Short")).toContain("Unavailable");
    expect(summaryRowText("Est. liquidation · Short")).not.toContain("$57,982.40");
    expect(
      screen.getByText("No liquidation estimate is available for this order.")
    ).toBeInTheDocument();
  });

  it("blocks both sides with a visible reason before a quantity is entered", () => {
    const { buy, sell } = renderTicket();

    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    expect(screen.getByText("Enter a quantity")).toBeInTheDocument();
  });

  it("blocks both sides and names the asset when the quantity is over the balance", () => {
    const { buy, sell } = renderTicket({ initialQuantity: "1240.000001" });

    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    expect(screen.getByText("Not enough USDC")).toBeInTheDocument();
    // The reason is announced, not just painted: both buttons point at it.
    const reasonId = buy.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId as string)).toHaveTextContent("Not enough USDC");
  });

  it("hands the callback the exact string that was typed", () => {
    const { buy, sell, onBuy, onSell } = renderTicket({ initialQuantity: "500" });

    expect(buy).toBeEnabled();
    expect(sell).toBeEnabled();

    fireEvent.click(buy);
    fireEvent.click(sell);

    expect(onBuy).toHaveBeenCalledWith("500");
    expect(onSell).toHaveBeenCalledWith("500");
  });

  it("carries a fractional quantity through untouched", () => {
    const { buy, onBuy } = renderTicket({ initialQuantity: "0.5" });

    expect(buy).toBeEnabled();
    fireEvent.click(buy);

    // "0.5", not 0.5: no parse, no reformat, no trailing-zero drift.
    expect(onBuy).toHaveBeenCalledWith("0.5");
    expect(onBuy.mock.calls[0][0]).toBe("0.5");
  });

  it("keeps every digit of a long fractional quantity", () => {
    const { buy, onBuy } = renderTicket({ initialQuantity: "1239.999999" });

    expect(buy).toBeEnabled();
    fireEvent.click(buy);

    expect(onBuy).toHaveBeenCalledWith("1239.999999");
  });

  it("separates two amounts a float would read as equal", () => {
    // 1.000000000000000002 against a balance of 1.000000000000000001. As
    // doubles both are exactly 1, so a float gate lets the larger one through.
    const { buy, sell } = renderTicket({
      initialQuantity: "1.000000000000000002",
      quantityAsset: {
        balance: BALANCE_ONE_TOKEN_PLUS_A_WEI,
        decimals: WEI_DECIMALS,
        symbol: "ETH",
      },
    });

    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    expect(screen.getByText("Not enough ETH")).toBeInTheDocument();
  });

  // On perps the submit path can find money the balance line cannot see: it
  // bridges from Arbitrum, polls, and retries. Blocking an over-balance amount
  // here would take away an order a trader can place today, so the desk opts
  // into an advisory reading of the same gate.
  it("warns without blocking when the desk can bridge the difference", () => {
    const { buy, sell, onBuy } = renderTicket({
      initialQuantity: "1240.000001",
      overBalancePolicy: "warn",
    });

    expect(buy).toBeEnabled();
    expect(sell).toBeEnabled();
    expect(
      screen.getByText(
        "More than your perps margin. The rest is moved over when you place the order."
      )
    ).toBeInTheDocument();

    fireEvent.click(buy);
    expect(onBuy).toHaveBeenCalledWith("1240.000001");
  });

  it("announces the advisory on both actions rather than only painting it", () => {
    const { buy, sell } = renderTicket({
      initialQuantity: "1240.000001",
      overBalancePolicy: "warn",
    });

    for (const action of [buy, sell]) {
      const ids = (action.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
      const texts = ids.map((id) => document.getElementById(id)?.textContent ?? "");
      expect(texts).toContain(
        "More than your perps margin. The rest is moved over when you place the order."
      );
    }
  });

  it("does not mark an over-balance amount invalid when it will still execute", () => {
    renderTicket({ initialQuantity: "1240.000001", overBalancePolicy: "warn" });

    expect(screen.getByRole("textbox", { name: "Order quantity" })).toHaveAttribute(
      "aria-invalid",
      "false"
    );
  });

  it("blocks an over-balance amount by default, so spot is untouched", () => {
    const { buy, sell } = renderTicket({ initialQuantity: "1240.000001" });

    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    expect(screen.getByText("Not enough USDC")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "More than your perps margin. The rest is moved over when you place the order."
      )
    ).not.toBeInTheDocument();
  });

  // The advisory widens exactly one gate. Everything else still stops the order.
  it("keeps every other reason blocking under the advisory policy", () => {
    const cases: Array<[TicketHarnessProps, string]> = [
      [{ initialQuantity: "" }, "Enter a quantity"],
      [{ initialQuantity: "1e5" }, "Enter a valid quantity"],
      [{ initialQuantity: "500", pending: "buy" }, "Placing order…"],
      [
        { initialQuantity: "500", minNotional: { met: false, label: "$10" } },
        "Minimum order value is $10",
      ],
      [{ initialQuantity: "500", blockedReason: "Market likely closed" }, "Market likely closed"],
    ];

    for (const [props, reason] of cases) {
      const { buy, sell } = renderTicket({ overBalancePolicy: "warn", ...props });
      expect(buy).toBeDisabled();
      expect(sell).toBeDisabled();
      expect(screen.getByText(reason)).toBeInTheDocument();
      cleanup();
    }
  });

  it("keeps a one-sided reason blocking under the advisory policy", () => {
    const { buy, sell } = renderTicket({
      initialQuantity: "1240.000001",
      overBalancePolicy: "warn",
      sideBlockedReasons: { sell: "Take profit sits above the entry price" },
    });

    expect(buy).toBeEnabled();
    expect(sell).toBeDisabled();
    expect(
      screen.getByText(
        "More than your perps margin. The rest is moved over when you place the order."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Sell: Take profit sits above the entry price")).toBeInTheDocument();
  });

  it("still blocks an over-precise amount under the advisory policy", () => {
    // Too-precise is not a money question, it is a wire-format one: the venue
    // cannot represent the size at all, and no bridge fixes that.
    const { buy, sell } = renderTicket({
      initialQuantity: "1.0000000000000000012",
      overBalancePolicy: "warn",
      quantityAsset: {
        balance: BALANCE_ONE_TOKEN_PLUS_A_WEI,
        decimals: WEI_DECIMALS,
        symbol: "ETH",
      },
    });

    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    expect(screen.getByText("ETH allows at most 18 decimal places")).toBeInTheDocument();
  });

  it("lets the last spendable wei through", () => {
    const { buy, onBuy } = renderTicket({
      initialQuantity: "1.000000000000000001",
      quantityAsset: {
        balance: BALANCE_ONE_TOKEN_PLUS_A_WEI,
        decimals: WEI_DECIMALS,
        symbol: "ETH",
      },
    });

    expect(buy).toBeEnabled();
    fireEvent.click(buy);
    expect(onBuy).toHaveBeenCalledWith("1.000000000000000001");
  });

  it("refuses an over-precise keystroke instead of truncating it", () => {
    const { quantity, onQuantityChange } = renderTicket({ initialQuantity: "0.123456" });

    fireEvent.change(quantity, { target: { value: "0.1234567" } });

    expect(onQuantityChange).not.toHaveBeenCalled();
    expect(quantity).toHaveValue("0.123456");
  });

  it("refuses a keystroke that is not part of a decimal amount", () => {
    const { quantity, onQuantityChange } = renderTicket({ initialQuantity: "12" });

    fireEvent.change(quantity, { target: { value: "12e5" } });
    fireEvent.change(quantity, { target: { value: "-12" } });
    fireEvent.change(quantity, { target: { value: "1,200" } });

    expect(onQuantityChange).not.toHaveBeenCalled();
    expect(quantity).toHaveValue("12");
  });

  it("accepts a keystroke that is part of a decimal amount", () => {
    const { quantity, onQuantityChange } = renderTicket({ initialQuantity: "0" });

    fireEvent.change(quantity, { target: { value: "0.5" } });

    expect(onQuantityChange).toHaveBeenCalledWith("0.5");
  });

  it("locks both sides while an order is in flight and says so", () => {
    const { buy, sell } = renderTicket({ initialQuantity: "500", pending: "buy" });

    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    expect(buy).toHaveAttribute("aria-busy", "true");
    expect(sell).toHaveAttribute("aria-busy", "false");
    expect(screen.getByText("Placing order…")).toBeInTheDocument();
  });

  it("holds the quantity field still while an order is in flight", () => {
    const { quantity } = renderTicket({ initialQuantity: "500", pending: "buy" });
    expect(quantity).toBeDisabled();
  });

  it("blocks both sides with the reason the composer supplies", () => {
    const { buy, sell } = renderTicket({
      initialQuantity: "500",
      blockedReason: "Market likely closed · orders wait for reopen",
    });

    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    expect(screen.getByText("Market likely closed · orders wait for reopen")).toBeInTheDocument();
  });

  it("drives leverage from inside the ticket", () => {
    const onLeverageChange = vi.fn();
    renderTicket({ initialQuantity: "500", onLeverageChange });

    fireEvent.click(screen.getByRole("button", { name: "20x" }));

    expect(onLeverageChange).toHaveBeenCalledWith(20);
  });

  it("renders the price as a field only when the composer can take a new one", () => {
    const onPriceChange = vi.fn();
    renderTicket({ initialQuantity: "500", mode: "limit", onPriceChange });

    const price = screen.getByRole("textbox", { name: "Limit price" });
    fireEvent.change(price, { target: { value: "1.00002" } });

    expect(onPriceChange).toHaveBeenCalledWith("1.00002");
  });

  it("blocks both sides when an editable price is empty", () => {
    const { buy, sell } = renderTicket({
      initialQuantity: "500",
      mode: "limit",
      price: "",
      onPriceChange: vi.fn(),
    });

    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    expect(screen.getByText("Enter a price")).toBeInTheDocument();
  });

  it("shows placeholders rather than a stale summary while a quote is in flight", () => {
    renderTicket({ initialQuantity: "500", summary: { ...SUMMARY, loading: true } });

    expect(screen.queryByText("$57,982.40")).not.toBeInTheDocument();
    expect(screen.queryByText("$70,162.70")).not.toBeInTheDocument();
    expect(screen.getByText("Est. liquidation · Long")).toBeInTheDocument();
    expect(screen.getByText("Est. liquidation · Short")).toBeInTheDocument();
  });

  // The chart is a permanent panel in the left column on this surface, with its
  // own expand control. A "View Chart" disclosure in here would be a second
  // control for one chart, pointing at a panel the ticket does not render.
  it("carries no chart control of its own", () => {
    renderTicket({ initialQuantity: "500" });

    expect(screen.queryByText("View Chart")).not.toBeInTheDocument();
  });

  it("keeps the market and limit choice on the strip", () => {
    const onModeChange = vi.fn();
    renderTicket({ initialQuantity: "500", onModeChange });

    fireEvent.click(screen.getByRole("button", { name: "Limit" }));

    expect(onModeChange).toHaveBeenCalledWith("limit");
  });

  // The pair pill is a label. It used to be SpotPairSelector, which draws a
  // chevron and declares aria-haspopup="listbox", over a handler that opened
  // no list: the market is chosen from the column beside the ticket. A screen
  // reader was being promised a popup that did not exist.
  it("names the market without pretending to be a market picker", () => {
    renderTicket({ initialQuantity: "500" });

    expect(screen.getByText("BTC/USDT")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /BTC\/USDT/ })).not.toBeInTheDocument();
    expect(document.querySelector('[aria-haspopup="listbox"]')).toBeNull();
  });

  it("drives margin mode from inside the ticket", () => {
    const onMarginModeChange = vi.fn();
    renderTicket({ initialQuantity: "500", marginMode: "cross", onMarginModeChange });

    fireEvent.click(screen.getByRole("button", { name: "Isolated" }));

    expect(onMarginModeChange).toHaveBeenCalledWith("isolated");
  });

  it("blocks both sides when the order value is under the venue's floor", () => {
    const { buy, sell } = renderTicket({
      initialQuantity: "0.5",
      minNotional: { met: false, label: "$10" },
    });

    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    expect(screen.getByText("Minimum order value is $10")).toBeInTheDocument();
    // The same mechanism every other block uses, so it reaches a screen reader.
    const reasonId = buy.getAttribute("aria-describedby");
    expect(document.getElementById(reasonId as string)).toHaveTextContent(
      "Minimum order value is $10"
    );
  });

  it("lets both sides act once the order value clears the floor", () => {
    const { buy, sell } = renderTicket({
      initialQuantity: "500",
      minNotional: { met: true, label: "$10" },
    });

    expect(buy).toBeEnabled();
    expect(sell).toBeEnabled();
  });

  it("calls an empty field empty rather than too small", () => {
    renderTicket({ minNotional: { met: false, label: "$10" } });

    expect(screen.getByText("Enter a quantity")).toBeInTheDocument();
    expect(screen.queryByText("Minimum order value is $10")).not.toBeInTheDocument();
  });

  // A figure in this row reads as the price the position dies at. With no
  // estimate the row has to say so in words: a dash or a zero would be read as
  // a level, and a wrong level on a leveraged venue is worse than none.
  it("names a missing liquidation estimate instead of drawing a level", () => {
    renderTicket({
      initialQuantity: "500",
      summary: { ...SUMMARY, liquidation: { buy: null, sell: null } },
    });

    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(
      screen.getByText("No liquidation estimate is available for this order.")
    ).toBeInTheDocument();
    expect(screen.queryByText("-")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("treats a blank liquidation string as no estimate at all", () => {
    renderTicket({
      initialQuantity: "500",
      summary: { ...SUMMARY, liquidation: { buy: "   ", sell: "" } },
    });

    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
  });

  it("prefers the caller's own reason for a missing liquidation", () => {
    // The estimator declines for a handful of reasons, two of which happen in
    // ordinary use. Naming the real one beats a generic line.
    renderTicket({
      initialQuantity: "500",
      summary: {
        ...SUMMARY,
        liquidation: {
          buy: null,
          sell: null,
          unavailableNote: "You already hold a BTC position, so this is not an estimate.",
        },
      },
    });

    expect(
      screen.getByText("You already hold a BTC position, so this is not an estimate.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No liquidation estimate is available for this order.")
    ).not.toBeInTheDocument();
  });

  it("ignores a stale unavailable note once a real estimate arrives", () => {
    renderTicket({
      initialQuantity: "500",
      summary: {
        ...SUMMARY,
        liquidation: {
          ...SUMMARY.liquidation,
          unavailableNote: "You already hold a BTC position, so this is not an estimate.",
        },
      },
    });

    expect(screen.getByText("$57,982.40")).toBeInTheDocument();
    expect(screen.queryByText(/You already hold a BTC position/)).not.toBeInTheDocument();
  });

  it("does not claim a missing liquidation while the quote is still in flight", () => {
    renderTicket({
      initialQuantity: "500",
      summary: { ...SUMMARY, liquidation: { buy: null, sell: null }, loading: true },
    });

    expect(
      screen.queryByText("No liquidation estimate is available for this order.")
    ).not.toBeInTheDocument();
  });

  it("blocks one direction only when the reason belongs to that direction", () => {
    const { buy, sell } = renderTicket({
      initialQuantity: "500",
      sideBlockedReasons: { sell: "Take profit sits above the entry price" },
    });

    expect(buy).toBeEnabled();
    expect(sell).toBeDisabled();
    expect(screen.getByText("Sell: Take profit sits above the entry price")).toBeInTheDocument();
    const sellReasonId = sell.getAttribute("aria-describedby");
    expect(document.getElementById(sellReasonId as string)).toHaveTextContent(
      "Sell: Take profit sits above the entry price"
    );
  });

  it("keeps a block on both sides ahead of a one-sided one", () => {
    const { buy, sell } = renderTicket({
      sideBlockedReasons: { sell: "Take profit sits above the entry price" },
    });

    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    expect(screen.getByText("Enter a quantity")).toBeInTheDocument();
    expect(screen.queryByText(/Take profit sits above/)).not.toBeInTheDocument();
    // One sentence, one line, both buttons pointing at it.
    expect(buy.getAttribute("aria-describedby")).toBe(sell.getAttribute("aria-describedby"));
  });

  it("shows the signing step the composer streams instead of the generic line", () => {
    renderTicket({
      initialQuantity: "500",
      pending: "buy",
      pendingStatus: "Confirm in your wallet",
    });

    expect(screen.getByText("Confirm in your wallet")).toBeInTheDocument();
    expect(screen.queryByText("Placing order…")).not.toBeInTheDocument();
  });

  it("falls back to the generic in-flight line when no step is streaming", () => {
    renderTicket({ initialQuantity: "500", pending: "buy", pendingStatus: "   " });

    expect(screen.getByText("Placing order…")).toBeInTheDocument();
  });

  it("has no triggers at all unless the composer supplies them", () => {
    renderTicket({ initialQuantity: "500" });

    expect(
      screen.queryByRole("button", { name: "Take profit / Stop loss" })
    ).not.toBeInTheDocument();
  });

  it("keeps the trigger fields folded away until they are asked for", () => {
    renderTicketWithTriggers();

    const disclosure = screen.getByRole("button", { name: "Take profit / Stop loss" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Take profit" })).not.toBeInTheDocument();

    fireEvent.click(disclosure);

    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Take profit" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Stop loss" })).toBeInTheDocument();
  });

  it("hands a trigger price back exactly as it was typed", () => {
    const { takeProfit } = renderTicketWithTriggers(true);

    fireEvent.change(screen.getByRole("textbox", { name: "Take profit" }), {
      target: { value: "65000.50" },
    });

    expect(takeProfit).toHaveBeenCalledWith("65000.50");
    expect(takeProfit.mock.calls[0][0]).toBe("65000.50");
  });

  // A trigger price is a price. The same keystroke gate the price row uses
  // applies here, so nothing that a float would mangle ever reaches the state.
  it("refuses a trigger keystroke that is not part of a decimal price", () => {
    const { stopLoss } = renderTicketWithTriggers(true);
    const field = screen.getByRole("textbox", { name: "Stop loss" });

    fireEvent.change(field, { target: { value: "60e3" } });
    fireEvent.change(field, { target: { value: "-60000" } });
    fireEvent.change(field, { target: { value: "60,000" } });

    expect(stopLoss).not.toHaveBeenCalled();
    expect(field).toHaveValue("");
  });

  it("holds the trigger fields still while an order is in flight", () => {
    renderTicketWithTriggers(true, { pending: "buy" });

    expect(screen.getByRole("textbox", { name: "Take profit" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Stop loss" })).toBeDisabled();
  });
});

// The desk is stacked into a single narrow column on a phone, where the design
// sizes drawn for the two-column desk crowd the cards. Each of those sizes now
// has a smaller phone step under an sm: restore, so nothing moves from 640px
// up. Asserting the classes is the only way to see a breakpoint from jsdom,
// which has no layout.
describe("PerpOrderTicket at phone width", () => {
  it("sets the amount field a step smaller below sm and restores it above", () => {
    renderTicket({ initialQuantity: "500" });

    const amount = screen.getByRole("textbox", { name: "Order quantity" });

    expect(amount).toHaveClass("text-[26px]");
    expect(amount).toHaveClass("sm:text-[31px]");
  });

  it("does the same for the quantity card's labels", () => {
    renderTicket({ initialQuantity: "500" });

    const label = screen.getByText("Quantity");
    const balance = screen.getByText("Balance: 1,240 USDC");

    expect(label).toHaveClass("text-[13px]", "sm:text-[15px]");
    expect(balance).toHaveClass("text-[12px]", "sm:text-[14px]");
  });

  it("keeps the price card on the same two-step scale", () => {
    renderTicket({ initialQuantity: "500", mode: "limit", onPriceChange: vi.fn() });

    const price = screen.getByRole("textbox", { name: "Limit price" });

    expect(price).toHaveClass("text-[13px]", "sm:text-[15px]");
  });
});

// The top strip is the narrowest row on the desk: at 390px the pill, the 24h
// change and the Limit/Market toggle share roughly 320px, and the toggle used
// to be cut off at the screen edge. Type sizes are covered where those
// components live; what is locked here is that the row cannot clip the toggle
// whatever the pair or locale makes the cluster beside it.
describe("PerpOrderTicket top strip", () => {
  it("gives the order mode toggle a width it never has to yield", () => {
    renderTicket({ initialQuantity: "500" });

    const toggle = screen.getByRole("group", { name: "Order type" });

    expect(toggle).toHaveClass("shrink-0");
  });

  it("lets the change reading give up width before the row overruns", () => {
    renderTicket({ initialQuantity: "500" });

    const change = screen.getByText("-2.20%").parentElement as HTMLElement;

    expect(change).toHaveClass("truncate");
    expect(change.parentElement).toHaveClass("min-w-0");
  });
});
