import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TradeQuickAmounts } from "@/components/ui/trade-quick-amounts";

// No NextIntlClientProvider: the chips read no catalogue, and the accessible
// name arrives as a function the caller has already bound to one.
const payLabel = (amount: string) => `Pay ${amount}`;

const VALUES = ["10", "20", "50"];

function chip(name: string) {
  return screen.getByRole("button", { name });
}

describe("TradeQuickAmounts", () => {
  it("names each chip through the function it is handed, with no catalogue in reach", () => {
    render(<TradeQuickAmounts values={VALUES} onSelect={() => {}} amountLabel={payLabel} />);
    expect(chip("Pay $10")).toBeInTheDocument();
    expect(chip("Pay $20")).toBeInTheDocument();
    expect(chip("Pay $50")).toBeInTheDocument();
  });

  // The interpolation is the caller's, so another desk can word it any way its
  // own catalogue does, in any language.
  it("lets another desk word the name its own way", () => {
    render(
      <TradeQuickAmounts
        values={["25"]}
        onSelect={() => {}}
        amountLabel={(amount) => `${amount} einzahlen`}
      />
    );
    expect(chip("$25 einzahlen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay $25" })).toBeNull();
  });

  // The visible text is the prefixed value. The accessible name wraps it, so
  // the two must not be confused for each other.
  it("draws the prefixed value and names it separately", () => {
    render(<TradeQuickAmounts values={["10"]} onSelect={() => {}} amountLabel={payLabel} />);
    const button = chip("Pay $10");
    expect(button).toHaveTextContent("$10");
    expect(button.textContent).toBe("$10");
  });

  it("takes another prefix when the desk quotes in something else", () => {
    render(
      <TradeQuickAmounts values={["10"]} onSelect={() => {}} amountLabel={payLabel} prefix="€" />
    );
    expect(chip("Pay €10")).toHaveTextContent("€10");
  });

  // The values are decimal strings and go out exactly as they came in: nothing
  // on this path parses a figure, so nothing can round one.
  it("reports the chip's value unchanged", () => {
    const onSelect = vi.fn();
    render(
      <TradeQuickAmounts values={["0.5", "100"]} onSelect={onSelect} amountLabel={payLabel} />
    );

    fireEvent.click(chip("Pay $0.5"));
    expect(onSelect).toHaveBeenCalledWith("0.5");

    fireEvent.click(chip("Pay $100"));
    expect(onSelect).toHaveBeenLastCalledWith("100");
  });

  // The design's own chip row repeats $100, which is a defect in the file. A
  // repeated value renders once rather than as two chips that do the same
  // thing.
  it("renders a repeated value once", () => {
    render(
      <TradeQuickAmounts
        values={["10", "100", "100", "200"]}
        onSelect={() => {}}
        amountLabel={payLabel}
      />
    );
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  // The chip that matches the amount field is the pressed one, and it is the
  // only one: a second highlighted chip would claim the field holds two values.
  it("marks only the chip matching the current amount", () => {
    render(
      <TradeQuickAmounts values={VALUES} onSelect={() => {}} amountLabel={payLabel} selected="20" />
    );
    expect(chip("Pay $20")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Pay $20").className).toContain("bg-surface-strong");
    expect(chip("Pay $10")).toHaveAttribute("aria-pressed", "false");
    expect(chip("Pay $50")).toHaveAttribute("aria-pressed", "false");
  });

  // A hand-typed amount matches no chip, so none is pressed.
  it("marks nothing when the amount matches no chip", () => {
    render(
      <TradeQuickAmounts values={VALUES} onSelect={() => {}} amountLabel={payLabel} selected="37" />
    );
    for (const value of VALUES) {
      expect(chip(`Pay $${value}`)).toHaveAttribute("aria-pressed", "false");
    }
    cleanup();

    render(<TradeQuickAmounts values={VALUES} onSelect={() => {}} amountLabel={payLabel} />);
    for (const value of VALUES) {
      expect(chip(`Pay $${value}`)).toHaveAttribute("aria-pressed", "false");
    }
  });

  /** Locked while an order is in flight, so the amount cannot move under a signature. */
  it("is dead while the caller has it disabled", () => {
    const onSelect = vi.fn();
    render(
      <TradeQuickAmounts values={VALUES} onSelect={onSelect} amountLabel={payLabel} disabled />
    );

    for (const value of VALUES) {
      const button = chip(`Pay $${value}`);
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onSelect).not.toHaveBeenCalled();
  });
});
