import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  const side = props.side ?? "buy";
  renderWithIntl(
    <SpotTradeActions
      side={side}
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
    // One button, for the chosen side. Rendering both at once is what let a
    // USDC-denominated amount be measured against a coin balance.
    action: screen.getByRole("button", { name: side === "buy" ? "Buy" : "Sell" }),
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
  it("disables the action and says why when no amount is entered", () => {
    const { action } = renderActions({ amount: "" });
    expect(action).toBeDisabled();
    expect(screen.getByText("Enter an amount")).toBeInTheDocument();
  });

  it("ties the reason to the button for screen readers", () => {
    const { action } = renderActions({ amount: "" });
    const reason = screen.getByText("Enter an amount");
    expect(action).toHaveAttribute("aria-describedby", reason.id);
  });

  it("reports the exact string typed, on either side", () => {
    const buy = renderActions({ side: "buy", amount: "0.12345" });
    expect(buy.action).toBeEnabled();
    fireEvent.click(buy.action);
    expect(buy.onBuy).toHaveBeenCalledWith("0.12345");
    cleanup();

    const sell = renderActions({ side: "sell", amount: "0.12345" });
    expect(sell.action).toBeEnabled();
    fireEvent.click(sell.action);
    expect(sell.onSell).toHaveBeenCalledWith("0.12345");
  });

  it("spends the whole pay balance when the amount equals it", () => {
    const { action, onBuy } = renderActions({ side: "buy", amount: "1240" });
    expect(action).toBeEnabled();
    fireEvent.click(action);
    expect(onBuy).toHaveBeenCalledWith("1240");
  });

  /**
   * The trapping case. Gating Sell on the pay balance would strand a user who
   * holds the asset but no USDC: they could not close the position.
   */
  it("lets a holder sell with an empty pay balance", () => {
    const { action, onSell } = renderActions({
      side: "sell",
      amount: "0.25",
      pay: { balance: 0n, decimals: USDC_DECIMALS, symbol: "USDC" },
    });
    expect(action).toBeEnabled();
    fireEvent.click(action);
    expect(onSell).toHaveBeenCalledWith("0.25");
  });

  /**
   * The bug this switch was built for. 900 sits inside the 1,240 USDC pay
   * balance and far past the 0.5 BTC held, so the SAME string is spendable on
   * one leg and impossible on the other. Before the switch both buttons read it
   * at once and one of them was always wrong about what it meant.
   */
  it("measures one string against whichever asset the side is denominated in", () => {
    const buy = renderActions({ side: "buy", amount: "900" });
    expect(buy.action).toBeEnabled();
    expect(screen.queryByText("Not enough BTC")).not.toBeInTheDocument();
    cleanup();

    const sell = renderActions({ side: "sell", amount: "900" });
    expect(sell.action).toBeDisabled();
    expect(screen.getByText("Not enough BTC")).toBeInTheDocument();
    expect(screen.queryByText("Not enough USDC")).not.toBeInTheDocument();
  });

  it("names the asset the active side is short of, and refuses to fire", () => {
    const { action, onBuy } = renderActions({ side: "buy", amount: "1240.000001" });
    expect(action).toBeDisabled();
    expect(screen.getByText("Not enough USDC")).toBeInTheDocument();
    fireEvent.click(action);
    expect(onBuy).not.toHaveBeenCalled();
  });

  /**
   * BTC carries 8 decimals and USDC 6, so an 8dp amount is fine to sell and too
   * precise to spend. Each side applies its own asset's limit.
   */
  it("applies the active side's own decimal limit", () => {
    const sell = renderActions({ side: "sell", amount: "0.12345678" });
    expect(sell.action).toBeEnabled();
    cleanup();

    const buy = renderActions({ side: "buy", amount: "0.12345678" });
    expect(buy.action).toBeDisabled();
    expect(screen.getByText("USDC allows at most 6 decimal places")).toBeInTheDocument();
  });

  it("explains rather than offering a sell for a coin the wallet holds none of", () => {
    const { action } = renderActions({
      side: "sell",
      amount: "1",
      sell: { balance: null, symbol: "BTC" },
    });
    expect(action).toBeDisabled();
    expect(screen.getByText("You don't own any BTC to sell yet.")).toBeInTheDocument();
  });
});
