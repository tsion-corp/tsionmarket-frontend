import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { TradeSideSwitch, type TradeSide } from "@/components/ui/trade-side-switch";

// No NextIntlClientProvider anywhere in this file, and that is the point. A
// primitive below the feature line reads no message catalogue, so every render
// here would throw if a useTranslations call crept back in.
const LABELS = { group: "Buy or sell", buy: "Buy", sell: "Sell" };

function buttons() {
  return {
    buy: screen.getByRole("radio", { name: LABELS.buy }),
    sell: screen.getByRole("radio", { name: LABELS.sell }),
  };
}

describe("TradeSideSwitch", () => {
  it("renders the wording it is handed, with no catalogue in reach", () => {
    render(<TradeSideSwitch side="buy" onChange={() => {}} labels={LABELS} />);
    expect(screen.getByRole("radiogroup", { name: "Buy or sell" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Buy" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sell" })).toBeInTheDocument();
  });

  // Another desk hands in its own words, and none of them are the spot ones.
  it("prints another desk's wording just as readily", () => {
    render(
      <TradeSideSwitch
        side="sell"
        onChange={() => {}}
        labels={{ group: "Kaufen oder verkaufen", buy: "Kaufen", sell: "Verkaufen" }}
      />
    );
    expect(screen.getByRole("radiogroup", { name: "Kaufen oder verkaufen" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Verkaufen" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.queryByRole("radio", { name: "Sell" })).toBeNull();
  });

  /**
   * One choice with two states, not two independent buttons. A screen reader
   * should hear which leg is active, which aria-checked on a radiogroup gives
   * and two plain buttons do not.
   */
  it("is a radiogroup reporting which side is active", () => {
    render(<TradeSideSwitch side="buy" onChange={() => {}} labels={LABELS} />);
    const { buy, sell } = buttons();
    expect(buy).toHaveAttribute("aria-checked", "true");
    expect(sell).toHaveAttribute("aria-checked", "false");
    expect(buy).not.toHaveAttribute("aria-pressed");
  });

  it("reports the side that was chosen", () => {
    const onChange = vi.fn();
    render(<TradeSideSwitch side="buy" onChange={onChange} labels={LABELS} />);
    fireEvent.click(buttons().sell);
    expect(onChange).toHaveBeenCalledWith("sell");
  });

  /** Locked while an order is in flight, so the leg cannot move under a signature. */
  it("cannot be moved while an order is in flight", () => {
    const onChange = vi.fn();
    render(<TradeSideSwitch side="buy" onChange={onChange} labels={LABELS} disabled />);
    const { buy, sell } = buttons();
    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    fireEvent.click(sell);
    expect(onChange).not.toHaveBeenCalled();
  });

  /**
   * The switch carries the action tokens, never the price-delta ones. Green
   * here means "you are buying", not "the market went up".
   */
  it("fills the chosen side with its action colour", () => {
    render(<TradeSideSwitch side="buy" onChange={() => {}} labels={LABELS} />);
    expect(buttons().buy.className).toContain("bg-buy");
    cleanup();

    render(<TradeSideSwitch side="sell" onChange={() => {}} labels={LABELS} />);
    expect(buttons().sell.className).toContain("bg-sell");
  });

  /**
   * Fill against outline, so the chosen leg is legible to someone who cannot
   * separate the buy green from the sell red.
   */
  it("separates the two halves by fill, not only by colour", () => {
    render(<TradeSideSwitch side="buy" onChange={() => {}} labels={LABELS} />);
    const { buy, sell } = buttons();
    expect(buy.className).not.toContain("border");
    expect(sell.className).toContain("border border-white/8");
    expect(sell.className).toContain("bg-[rgba(54,54,54,0.16)]");
  });
});

/**
 * The behaviour the whole switch exists for. The two legs are denominated in
 * different assets, so a figure that survives the flip silently changes
 * meaning. The switch does not hold the amount, so what is pinned here is that
 * it reports the flip cleanly enough for a parent to clear on.
 */
describe("switching sides clears the amount", () => {
  function Harness() {
    const [side, setSide] = useState<TradeSide>("buy");
    const [amount, setAmount] = useState("100");
    const [enteredSide, setEnteredSide] = useState<TradeSide>("buy");
    if (side !== enteredSide) {
      setEnteredSide(side);
      setAmount("");
    }
    return (
      <div>
        <TradeSideSwitch side={side} onChange={setSide} labels={LABELS} />
        <output data-testid="amount">{amount}</output>
      </div>
    );
  }

  it("drops a figure typed for the other leg", () => {
    render(<Harness />);
    expect(screen.getByTestId("amount")).toHaveTextContent("100");
    fireEvent.click(buttons().sell);
    expect(screen.getByTestId("amount")).toHaveTextContent("");
  });
});
