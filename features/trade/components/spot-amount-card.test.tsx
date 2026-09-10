import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import {
  SpotAmountCard,
  spotAmountStatus,
  type SpotAmountCardProps,
} from "@/features/trade/components/spot-amount-card";
import {
  SPOT_QUICK_AMOUNTS,
  SpotQuickAmounts,
} from "@/features/trade/components/spot-quick-amounts";
import { SpotOrderModeToggle } from "@/features/trade/components/spot-order-mode-toggle";
import { SpotOrderSummary } from "@/features/trade/components/spot-order-summary";
import {
  SpotTradeActions,
  type SpotTradeActionsProps,
} from "@/features/trade/components/spot-trade-actions";

// The spot ticket body needs message keys the shared catalogs do not carry yet
// (the coordinator lands them in messages/*.json). Stub them over the real
// English catalog so the reused keys are still checked against the real text.
const PENDING_KEYS = {
  youArePaying: "You are paying",
  amountLabel: "Amount to pay",
  changeToken: "Change token",
  purchaseValue: "Purchase Value",
  fee: "Fee",
  amountInvalid: "Enter a valid amount",
  amountTooPrecise: "{symbol} allows at most {decimals} decimal places",
  quickAmountLabel: "Pay {amount}",
  ctaNoBalanceOf: "Not enough {symbol}",
};

const messages = { ...en, spot: { ...en.spot, ...PENDING_KEYS } };

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
// The sell leg is a different asset with different decimals, which is the whole
// point of gating the two sides separately.
const BTC_DECIMALS = 8;
const HALF_BTC = 50_000_000n;

type CardHarnessProps = Partial<SpotAmountCardProps> & { initial?: string };

// The card is controlled by its parent, so the tests drive it through a real
// state holder: a rejected keystroke must leave the displayed value alone.
function CardHarness({ initial = "", onAmountChange, ...rest }: CardHarnessProps) {
  const [amount, setAmount] = useState(initial);
  return (
    <SpotAmountCard
      amount={amount}
      onAmountChange={(next) => {
        onAmountChange?.(next);
        setAmount(next);
      }}
      balance={BALANCE_1240}
      payDecimals={USDC_DECIMALS}
      paySymbol="USDC"
      {...rest}
    />
  );
}

function renderCard(props: CardHarnessProps = {}) {
  const onAmountChange = vi.fn();
  renderWithIntl(<CardHarness onAmountChange={onAmountChange} {...props} />);
  return { onAmountChange, input: screen.getByRole("textbox", { name: "Amount to pay" }) };
}

function renderActions(props: Partial<SpotTradeActionsProps> = {}) {
  const onBuy = vi.fn();
  const onSell = vi.fn();
  renderWithIntl(
    <SpotTradeActions
      amount=""
      pay={{ balance: BALANCE_1240, decimals: USDC_DECIMALS, symbol: "USDC" }}
      sell={{ balance: HALF_BTC, decimals: BTC_DECIMALS, symbol: "BTC" }}
      onBuy={onBuy}
      onSell={onSell}
      {...props}
    />
  );
  return {
    onBuy,
    onSell,
    buy: screen.getByRole("button", { name: "Buy" }),
    sell: screen.getByRole("button", { name: "Sell" }),
  };
}

describe("spotAmountStatus", () => {
  it("reads an empty, blank or zero amount as nothing entered", () => {
    expect(spotAmountStatus("", BALANCE_1240, USDC_DECIMALS)).toBe("empty");
    expect(spotAmountStatus("   ", BALANCE_1240, USDC_DECIMALS)).toBe("empty");
    expect(spotAmountStatus("0", BALANCE_1240, USDC_DECIMALS)).toBe("empty");
    expect(spotAmountStatus("0.00", BALANCE_1240, USDC_DECIMALS)).toBe("empty");
  });

  it("rejects a malformed amount instead of coercing it", () => {
    expect(spotAmountStatus("1e3", BALANCE_1240, USDC_DECIMALS)).toBe("invalid");
    expect(spotAmountStatus("1,240", BALANCE_1240, USDC_DECIMALS)).toBe("invalid");
    expect(spotAmountStatus("-5", BALANCE_1240, USDC_DECIMALS)).toBe("invalid");
    expect(spotAmountStatus("1.2.3", BALANCE_1240, USDC_DECIMALS)).toBe("invalid");
  });

  // Truncating the extra digits would let 1240.0000001 read as exactly the
  // balance and pass the check. It is rejected instead.
  it("rejects more fraction digits than the token carries", () => {
    expect(spotAmountStatus("1.1234567", BALANCE_1240, USDC_DECIMALS)).toBe("too-precise");
    expect(spotAmountStatus("1240.0000001", BALANCE_1240, USDC_DECIMALS)).toBe("too-precise");
  });

  it("compares against the balance in base units, to the last unit", () => {
    expect(spotAmountStatus("1240", BALANCE_1240, USDC_DECIMALS)).toBe("ok");
    // Exactly the balance is spendable; one base unit more is not.
    expect(spotAmountStatus("1240.000000", BALANCE_1240, USDC_DECIMALS)).toBe("ok");
    expect(spotAmountStatus("1240.000001", BALANCE_1240, USDC_DECIMALS)).toBe("above-balance");
  });

  // 0.1 + 0.2 is 0.30000000000000004 in binary floating point. An amount of
  // that size against a 0.3 balance must fail, and 0.3 itself must pass.
  it("does not round a high-precision amount into the balance", () => {
    const threeTenths = 300_000_000_000_000_000n; // 0.3 at 18 decimals
    expect(spotAmountStatus("0.3", threeTenths, 18)).toBe("ok");
    expect(spotAmountStatus("0.30000000000000004", threeTenths, 18)).toBe("above-balance");
  });
});

describe("SpotAmountCard", () => {
  it("shows the paying label, the balance and the pay token", () => {
    renderCard({ initial: "500" });
    expect(screen.getByText("You are paying")).toBeInTheDocument();
    expect(screen.getByText("Balance 1,240 USDC")).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();
  });

  it("passes an accepted keystroke through unchanged", () => {
    const { onAmountChange, input } = renderCard();
    fireEvent.change(input, { target: { value: "12.345678" } });
    expect(onAmountChange).toHaveBeenCalledWith("12.345678");
    expect(input).toHaveValue("12.345678");
  });

  it("accepts a bare decimal point so a fraction can be typed", () => {
    const { onAmountChange } = renderCard();
    fireEvent.change(screen.getByRole("textbox", { name: "Amount to pay" }), {
      target: { value: "." },
    });
    expect(onAmountChange).toHaveBeenCalledWith(".");
  });

  it("rejects letters, signs, separators and a second decimal point", () => {
    const { onAmountChange, input } = renderCard({ initial: "12" });
    for (const bad of ["12a", "12e5", "-12", "1,200", "12.3.4", "+12"]) {
      fireEvent.change(input, { target: { value: bad } });
    }
    expect(onAmountChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("12");
  });

  it("rejects a keystroke that would exceed the token's decimals", () => {
    const { onAmountChange, input } = renderCard({ initial: "1.123456" });
    fireEvent.change(input, { target: { value: "1.1234567" } });
    expect(onAmountChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("1.123456");
  });

  it("opens the token picker when the pill is pressed", () => {
    const onSelectPayToken = vi.fn();
    renderWithIntl(<CardHarness onSelectPayToken={onSelectPayToken} />);
    fireEvent.click(screen.getByRole("button", { name: "Change token" }));
    expect(onSelectPayToken).toHaveBeenCalledOnce();
  });

  it("marks the field invalid once the amount is above the balance", () => {
    renderCard({ initial: "1240.000001" });
    expect(screen.getByRole("textbox", { name: "Amount to pay" })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });
});

describe("SpotQuickAmounts", () => {
  it("sets the amount to the exact chip value", () => {
    const onSelect = vi.fn();
    renderWithIntl(<SpotQuickAmounts values={SPOT_QUICK_AMOUNTS} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Pay $50" }));
    expect(onSelect).toHaveBeenCalledWith("50");
  });

  it("renders one chip per distinct value", () => {
    renderWithIntl(
      <SpotQuickAmounts values={["10", "20", "50", "100", "200"]} onSelect={vi.fn()} />
    );
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(screen.getByText("$10")).toBeInTheDocument();
  });

  // The Figma frame repeats the $100 chip (nodes 173:42211 and 173:42212).
  // Two identical chips are a design defect, not a feature, so a repeat
  // collapses to one rather than shipping a dead duplicate.
  it("collapses a repeated value to a single chip", () => {
    renderWithIntl(
      <SpotQuickAmounts values={["10", "20", "50", "100", "100", "200"]} onSelect={vi.fn()} />
    );
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("marks the chip matching the current amount as pressed", () => {
    renderWithIntl(
      <SpotQuickAmounts values={SPOT_QUICK_AMOUNTS} selected="100" onSelect={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Pay $100" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("disables every chip while an order is in flight", () => {
    renderWithIntl(<SpotQuickAmounts values={SPOT_QUICK_AMOUNTS} onSelect={vi.fn()} disabled />);
    for (const chip of screen.getAllByRole("button")) expect(chip).toBeDisabled();
  });

  // The design's chip is 43.6px: 11px of padding either side of a 21.6px line
  // box. Left to Tailwind's default leading of 1.5 the line box is 25.5px and
  // the chip is 47.5px, and the row wraps, so the panel pays it twice. jsdom
  // has no layout engine, so the height cannot be measured here; what is
  // assertable is the leading that sets it. No fixed height goes with it, so a
  // longer label in another locale grows the chip instead of being clipped.
  it("carries the design's line box rather than the default leading", () => {
    renderWithIntl(<SpotQuickAmounts values={["10"]} onSelect={vi.fn()} />);
    const chip = screen.getByRole("button", { name: "Pay $10" });
    expect(chip).toHaveClass("leading-[21.6px]");
    expect(chip.className).not.toMatch(/(^|\s)h-/);
  });
});

describe("SpotOrderSummary", () => {
  it("shows the purchase value and the fee against the pay symbol", () => {
    renderWithIntl(<SpotOrderSummary purchaseValue="5,000" fee="3.50" symbol="USDC" />);
    expect(screen.getByText("Purchase Value")).toBeInTheDocument();
    expect(screen.getByText("5,000 USDC")).toBeInTheDocument();
    expect(screen.getByText("Fee")).toBeInTheDocument();
    expect(screen.getByText("3.50 USDC")).toBeInTheDocument();
  });

  it("holds the rows with placeholders while a quote is loading", () => {
    renderWithIntl(<SpotOrderSummary purchaseValue="5,000" fee="3.50" symbol="USDC" loading />);
    expect(screen.queryByText("5,000 USDC")).not.toBeInTheDocument();
    expect(screen.getByText("Purchase Value")).toBeInTheDocument();
  });

  // The design's card is 74px: 16px of padding and a 2px edge either side, a
  // 10px gap, and two 14px rows. Tailwind's default leading of 1.5 makes each
  // row 21px and the card 88px, the largest single inflation in the panel. The
  // leading sits on the card so both rows inherit one line box; the label and
  // the value must not drift apart. Heights stay unset, so a longer label in
  // another locale still sets its own row.
  it("sets one line box for both rows, rather than the default leading", () => {
    renderWithIntl(<SpotOrderSummary purchaseValue="5,000" fee="3.50" symbol="USDC" />);
    const card = screen.getByText("Purchase Value").parentElement?.parentElement;
    expect(card).toHaveClass("leading-[14px]");
    expect(card?.className).not.toMatch(/(^|\s)h-/);
  });
});

describe("SpotOrderModeToggle", () => {
  function renderToggle() {
    renderWithIntl(<SpotOrderModeToggle mode="market" onModeChange={vi.fn()} />);
    return {
      group: screen.getByRole("group", { name: "Order type" }),
      segments: screen.getAllByRole("button"),
    };
  }

  // Figma 173:42180 draws the track at 1.686px and 12% white. ws-inset, which
  // supplies the radius and the ground, carries the 1px at 8% that the app's
  // field containers use, and it has call sites elsewhere, so the weight and
  // the colour are overridden on this control alone.
  it("draws the track's own border weight over the shared inset utility", () => {
    const { group } = renderToggle();
    expect(group).toHaveClass("ws-inset");
    expect(group).toHaveClass("border-[1.686px]");
    expect(group).toHaveClass("border-[rgba(255,255,255,0.12)]");
  });

  // 15.5px of line box per segment, not the 23.25px Tailwind's default leading
  // of 1.5 gives, which the track's padding and border carry straight into the
  // panel's rhythm. Nothing is height-capped, so a longer label in another
  // locale grows the control.
  it("carries the design's line box on each segment", () => {
    const { segments } = renderToggle();
    expect(segments).toHaveLength(2);
    for (const segment of segments) {
      expect(segment).toHaveClass("leading-none");
      expect(segment.className).not.toMatch(/(^|\s)h-/);
    }
  });
});

describe("SpotTradeActions", () => {
  it("disables both actions and says why once, when no amount is entered", () => {
    const { buy, sell } = renderActions({ amount: "" });
    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    // Both sides stall for the same reason, so it is said once rather than twice.
    expect(screen.getByText("Enter an amount")).toBeInTheDocument();
  });

  it("ties a shared reason to both buttons for screen readers", () => {
    const { buy, sell } = renderActions({ amount: "" });
    const reason = screen.getByText("Enter an amount");
    expect(buy).toHaveAttribute("aria-describedby", reason.id);
    expect(sell).toHaveAttribute("aria-describedby", reason.id);
  });

  it("enables both actions for a valid amount and reports the exact string", () => {
    const { buy, sell, onBuy, onSell } = renderActions({ amount: "0.12345" });
    expect(buy).toBeEnabled();
    expect(sell).toBeEnabled();
    fireEvent.click(buy);
    fireEvent.click(sell);
    expect(onBuy).toHaveBeenCalledWith("0.12345");
    expect(onSell).toHaveBeenCalledWith("0.12345");
  });

  it("spends the whole pay balance when the amount equals it", () => {
    const { buy, onBuy } = renderActions({ amount: "1240" });
    expect(buy).toBeEnabled();
    fireEvent.click(buy);
    expect(onBuy).toHaveBeenCalledWith("1240");
  });

  // The trapping case. Gating Sell on the pay balance would strand a user who
  // holds the asset but no USDC: they could not close the position.
  it("lets a holder sell with an empty pay balance", () => {
    const { buy, sell, onSell } = renderActions({
      amount: "0.25",
      pay: { balance: 0n, decimals: USDC_DECIMALS, symbol: "USDC" },
    });
    expect(sell).toBeEnabled();
    expect(buy).toBeDisabled();
    fireEvent.click(sell);
    expect(onSell).toHaveBeenCalledWith("0.25");
  });

  it("names the asset each side is actually short of", () => {
    const { buy, sell } = renderActions({ amount: "900" });
    expect(buy).toBeEnabled();
    expect(sell).toBeDisabled();
    // 900 is inside the 1,240 USDC pay balance but far past the 0.5 BTC held.
    expect(screen.getByText("Not enough BTC")).toBeInTheDocument();
    expect(screen.queryByText("Not enough USDC")).not.toBeInTheDocument();
  });

  it("reports each side against its own balance when both are short", () => {
    const { buy, sell, onBuy, onSell } = renderActions({ amount: "1240.000001" });
    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    expect(screen.getByText("Not enough USDC")).toBeInTheDocument();
    expect(screen.getByText("Not enough BTC")).toBeInTheDocument();
    fireEvent.click(buy);
    fireEvent.click(sell);
    expect(onBuy).not.toHaveBeenCalled();
    expect(onSell).not.toHaveBeenCalled();
  });

  // BTC carries 8 decimals and USDC 6, so an 8dp amount is fine to sell and too
  // precise to spend. Each side applies its own asset's limit.
  it("applies each side's own decimal limit", () => {
    const { buy, sell } = renderActions({ amount: "0.12345678" });
    expect(sell).toBeEnabled();
    expect(buy).toBeDisabled();
    expect(screen.getByText("USDC allows at most 6 decimal places")).toBeInTheDocument();
  });

  it("points each button at its own reason when the two differ", () => {
    const { buy, sell } = renderActions({ amount: "900" });
    const sellReason = screen.getByText("Not enough BTC");
    expect(sell).toHaveAttribute("aria-describedby", sellReason.id);
    // Buy is fine here, so its reason element is present but silent, and the
    // two buttons never share an id.
    expect(buy.getAttribute("aria-describedby")).not.toBe(sellReason.id);
    expect(document.getElementById(buy.getAttribute("aria-describedby") ?? "")).toBeTruthy();
  });

  it("blocks selling and names the asset when the user holds none of it", () => {
    const { sell, onSell } = renderActions({
      amount: "0.25",
      // No holding means no token record, so there are no decimals to pass.
      sell: { balance: null, symbol: "BTC" },
    });
    expect(sell).toBeDisabled();
    expect(screen.getByText("You don't own any BTC to sell yet.")).toBeInTheDocument();
    fireEvent.click(sell);
    expect(onSell).not.toHaveBeenCalled();
  });

  // No sell leg at all is a different thing from holding none, and must not
  // quietly fall back to the pay balance.
  it("asks for a market rather than guessing when no sell asset is given", () => {
    const { buy, sell } = renderActions({ amount: "500", sell: undefined });
    expect(sell).toBeDisabled();
    expect(screen.getByText("Select a market")).toBeInTheDocument();
    expect(screen.queryByText("Not enough USDC")).not.toBeInTheDocument();
    expect(buy).toBeEnabled();
  });

  it("locks both actions and shows progress while an order is in flight", () => {
    const { buy, sell, onBuy } = renderActions({ amount: "0.25", pending: "buy" });
    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    expect(screen.getByText("Placing your order")).toBeInTheDocument();
    expect(buy).toHaveAttribute("aria-busy", "true");
    fireEvent.click(buy);
    expect(onBuy).not.toHaveBeenCalled();
  });

  it("says nothing extra once both sides are good and nothing is in flight", () => {
    renderActions({ amount: "0.25" });
    expect(screen.queryByText("Enter an amount")).not.toBeInTheDocument();
    expect(screen.queryByText("Not enough USDC")).not.toBeInTheDocument();
    expect(screen.queryByText("Not enough BTC")).not.toBeInTheDocument();
  });

  // The design draws each button 48px tall. It rendered 24px, because the
  // button sits in a column and flex-1 sets flex-basis: 0% on the column's own
  // axis, which replaces h-12 as the flex base size; the column is
  // content-height, so the button shrank to its 24px line box. jsdom has no
  // layout engine, so the height itself cannot be measured here. What is
  // assertable is the cause: the button keeps its fixed height and never
  // becomes a growable flex item again.
  it("keeps both buttons at the fixed design height, not flex-sized", () => {
    const { buy, sell } = renderActions({ amount: "0.25" });
    for (const button of [buy, sell]) {
      expect(button).toHaveClass("h-12");
      expect(button.className).not.toMatch(/(^|\s)flex-1(\s|$)/);
      expect(button.className).not.toMatch(/(^|\s)basis-/);
      expect(button).toHaveClass("shrink-0");
    }
  });

  // 8px between the pair, per the design. The gap lives on the row that holds
  // the two sides, so it is read from there rather than from a button.
  it("holds the design gap between the two sides", () => {
    const { buy, sell } = renderActions({ amount: "0.25" });
    const row = buy.parentElement?.parentElement;
    expect(row).toBe(sell.parentElement?.parentElement);
    expect(row).toHaveClass("gap-2");
  });

  // bg-buy and bg-sell are the action tokens. --color-up and --color-down are
  // price-delta colours and must never stand in for them.
  it("paints each side with its action token", () => {
    const { buy, sell } = renderActions({ amount: "0.25" });
    expect(buy).toHaveClass("bg-buy");
    expect(sell).toHaveClass("bg-sell");
  });
});
