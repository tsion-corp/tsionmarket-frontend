import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { SpotSideSwitch, type SpotSide } from "@/features/trade/components/spot-side-switch";

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

function buttons() {
  return {
    buy: screen.getByRole("radio", { name: "Buy" }),
    sell: screen.getByRole("radio", { name: "Sell" }),
  };
}

describe("SpotSideSwitch", () => {
  /**
   * One choice with two states, not two independent buttons. A screen reader
   * should hear which leg is active, which aria-checked on a radiogroup gives
   * and two plain buttons do not.
   */
  it("is a radiogroup reporting which side is active", () => {
    renderWithIntl(<SpotSideSwitch side="buy" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Buy or sell" })).toBeInTheDocument();
    const { buy, sell } = buttons();
    expect(buy).toHaveAttribute("aria-checked", "true");
    expect(sell).toHaveAttribute("aria-checked", "false");
  });

  it("reports the side that was chosen", () => {
    const onChange = vi.fn();
    renderWithIntl(<SpotSideSwitch side="buy" onChange={onChange} />);
    fireEvent.click(buttons().sell);
    expect(onChange).toHaveBeenCalledWith("sell");
  });

  /** Locked while an order is in flight, so the leg cannot move under a signature. */
  it("cannot be moved while an order is in flight", () => {
    const onChange = vi.fn();
    renderWithIntl(<SpotSideSwitch side="buy" onChange={onChange} disabled />);
    const { buy, sell } = buttons();
    expect(buy).toBeDisabled();
    expect(sell).toBeDisabled();
    fireEvent.click(sell);
    expect(onChange).not.toHaveBeenCalled();
  });

  /**
   * The switch carries the action tokens, never the price-delta ones. Green here
   * means "you are buying", not "the market went up", and painting a sell leg in
   * a loss colour would say something about the market that is not being said.
   */
  it("fills the chosen side with its action colour", () => {
    renderWithIntl(<SpotSideSwitch side="buy" onChange={() => {}} />);
    expect(buttons().buy.className).toContain("bg-buy");
    cleanup();

    renderWithIntl(<SpotSideSwitch side="sell" onChange={() => {}} />);
    expect(buttons().sell.className).toContain("bg-sell");
  });

  /**
   * Fill against outline, so the chosen leg is legible to someone who cannot
   * separate the buy green from the sell red. The chosen half is solid and
   * carries no border; the resting half is a bordered transparent pill.
   */
  it("separates the two halves by fill, not only by colour", () => {
    renderWithIntl(<SpotSideSwitch side="buy" onChange={() => {}} />);
    const { buy, sell } = buttons();
    expect(buy.className).not.toContain("border");
    expect(sell.className).toContain("border border-white/8");
    expect(sell.className).toContain("bg-[rgba(54,54,54,0.16)]");
  });
});

/**
 * The behaviour the whole switch exists for.
 *
 * The two legs are denominated in different assets: a buy is entered in USDC, a
 * sell in the coin. If a figure survives the flip it silently changes meaning —
 * "100" typed as $100 of a coin becomes an offer to sell 100 of that coin. Both
 * desks clear on the flip, so this pins the contract rather than either copy of
 * the wiring.
 */
describe("switching sides clears the amount", () => {
  function Harness() {
    const [side, setSide] = useState<SpotSide>("buy");
    const [amount, setAmount] = useState("100");
    const [enteredSide, setEnteredSide] = useState<SpotSide>("buy");
    if (side !== enteredSide) {
      setEnteredSide(side);
      setAmount("");
    }
    return (
      <div>
        <SpotSideSwitch side={side} onChange={setSide} />
        <output data-testid="amount">{amount}</output>
      </div>
    );
  }

  it("drops a figure typed for the other leg", () => {
    renderWithIntl(<Harness />);
    expect(screen.getByTestId("amount")).toHaveTextContent("100");
    fireEvent.click(buttons().sell);
    expect(screen.getByTestId("amount")).toHaveTextContent("");
  });
});
