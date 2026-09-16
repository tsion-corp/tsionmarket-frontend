import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TradeSellShortcuts } from "@/components/ui/trade-sell-shortcuts";
import { toBaseUnits } from "@/lib/trade/math";

// No NextIntlClientProvider: this primitive reads no catalogue, so every render
// below would throw if a useTranslations call returned to it.
const LABELS = { group: "Sell a share of your balance", max: "Max" };

function pill(name: string) {
  return screen.getByRole("button", { name });
}

/** Clicks one pill and returns the single amount it emitted. */
function amountFrom(onSelect: ReturnType<typeof vi.fn>, name: string): string {
  onSelect.mockClear();
  fireEvent.click(pill(name));
  expect(onSelect).toHaveBeenCalledTimes(1);
  return onSelect.mock.calls[0]![0] as string;
}

// The shape the amount field itself accepts: digits, at most one point.
const AMOUNT_FIELD = /^\d+(\.\d+)?$/;

describe("TradeSellShortcuts labels", () => {
  it("names the row and the Max pill from the strings it is handed", () => {
    render(
      <TradeSellShortcuts held={1_000_003n} decimals={6} onSelect={() => {}} labels={LABELS} />
    );
    expect(screen.getByRole("group", { name: "Sell a share of your balance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Max" })).toBeInTheDocument();
  });

  // Another desk's wording, in another language, with no provider in sight.
  it("takes any wording, including a locale the spot catalogue never reaches", () => {
    render(
      <TradeSellShortcuts
        held={1_000_003n}
        decimals={6}
        onSelect={() => {}}
        labels={{ group: "Anteil verkaufen", max: "Alles" }}
      />
    );
    expect(screen.getByRole("group", { name: "Anteil verkaufen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alles" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Max" })).toBeNull();
  });

  // The percentages are the component's own, not the caller's: 25/50/75 is the
  // shape of the control, not copy to be translated.
  it("draws its own three percentage pills", () => {
    render(
      <TradeSellShortcuts held={1_000_003n} decimals={6} onSelect={() => {}} labels={LABELS} />
    );
    for (const name of ["25%", "50%", "75%"]) {
      expect(pill(name)).toBeInTheDocument();
    }
  });
});

describe("TradeSellShortcuts arithmetic", () => {
  /**
   * 1.000003 USDC. Every share but the half lands between two base units, so
   * this pins which way each one goes: down, to a whole base unit. 25% of it is
   * 250000.75 base units and must come out 250000, never 250001, because the
   * rounded-up version of a share is money the wallet may not have.
   */
  it("floors each share to a whole base unit", () => {
    const onSelect = vi.fn();
    render(
      <TradeSellShortcuts held={1_000_003n} decimals={6} onSelect={onSelect} labels={LABELS} />
    );

    expect(amountFrom(onSelect, "25%")).toBe("0.25");
    expect(amountFrom(onSelect, "50%")).toBe("0.500001");
    expect(amountFrom(onSelect, "75%")).toBe("0.750002");
  });

  /**
   * A full exit sells the exact holding. This holding is larger than 2^53, so a
   * float anywhere on the path would round it and leave real dust behind that
   * the user then has to chase with a second order.
   */
  it("emits the exact holding for Max, to the last base unit", () => {
    const held = 123_456_789_012_345_678_901_234_567n;
    const onSelect = vi.fn();
    render(<TradeSellShortcuts held={held} decimals={18} onSelect={onSelect} labels={LABELS} />);

    const amount = amountFrom(onSelect, "Max");
    expect(amount).toBe("123456789.012345678901234567");
    expect(toBaseUnits(amount, 18)).toBe(held);
  });

  /** The same holding through the fractions: exact integer maths, no rounding. */
  it("keeps full precision on a holding past what a float can hold", () => {
    const held = 123_456_789_012_345_678_901_234_567n;
    const onSelect = vi.fn();
    render(<TradeSellShortcuts held={held} decimals={18} onSelect={onSelect} labels={LABELS} />);

    expect(amountFrom(onSelect, "25%")).toBe("30864197.253086419725308641");
    expect(amountFrom(onSelect, "50%")).toBe("61728394.506172839450617283");
    expect(amountFrom(onSelect, "75%")).toBe("92592591.759259259175925925");
  });

  // Odd decimal counts, not just the 6 and 18 the spot desk deals in. A real
  // assets holding can sit at any precision its token declares, and the share
  // has to land on that token's own base unit either way.
  it("floors on an odd decimal count too", () => {
    const onSelect = vi.fn();

    // 0.9999999 at 7 decimals. A quarter is 2499999.75 base units.
    render(
      <TradeSellShortcuts held={9_999_999n} decimals={7} onSelect={onSelect} labels={LABELS} />
    );
    expect(amountFrom(onSelect, "25%")).toBe("0.2499999");
    expect(amountFrom(onSelect, "75%")).toBe("0.7499999");
    expect(amountFrom(onSelect, "Max")).toBe("0.9999999");
    cleanup();

    // 3 base units at 9 decimals: three quarters of it is 2.25, so 2.
    render(<TradeSellShortcuts held={3n} decimals={9} onSelect={onSelect} labels={LABELS} />);
    expect(amountFrom(onSelect, "75%")).toBe("0.000000002");
    cleanup();

    // Zero decimals. The base unit is the whole token, so a share of 7 is 1.
    render(<TradeSellShortcuts held={7n} decimals={0} onSelect={onSelect} labels={LABELS} />);
    expect(amountFrom(onSelect, "25%")).toBe("1");
    expect(amountFrom(onSelect, "50%")).toBe("3");
    expect(amountFrom(onSelect, "Max")).toBe("7");
  });

  /**
   * The property that matters more than any single figure: no share may ever
   * come out above the balance, or the order is rejected at signing time.
   */
  it("never emits more than the wallet holds", () => {
    const holdings = [1n, 3n, 99n, 1_000_003n, 7_777_777_777_777_777_777n];
    const onSelect = vi.fn();

    for (const held of holdings) {
      render(<TradeSellShortcuts held={held} decimals={18} onSelect={onSelect} labels={LABELS} />);
      for (const name of ["25%", "50%", "75%", "Max"]) {
        expect(toBaseUnits(amountFrom(onSelect, name), 18) <= held).toBe(true);
      }
      cleanup();
    }
  });

  /**
   * The parent drops this string straight into the amount field, so it has to
   * be something that field accepts and that converts back to the base units it
   * came from. Scientific notation or a stray comma would break both.
   */
  it("emits a decimal string the amount field accepts", () => {
    const held = 4_500_000_000_000_000_001n;
    const onSelect = vi.fn();
    render(<TradeSellShortcuts held={held} decimals={18} onSelect={onSelect} labels={LABELS} />);

    for (const name of ["25%", "50%", "75%", "Max"]) {
      const amount = amountFrom(onSelect, name);
      expect(amount).toMatch(AMOUNT_FIELD);
      expect(amount).not.toContain("e");
    }
  });

  /** A sub-unit share rounds to nothing, and nothing is still a valid amount. */
  it("emits a plain zero when a share floors away to nothing", () => {
    const onSelect = vi.fn();
    render(<TradeSellShortcuts held={1n} decimals={18} onSelect={onSelect} labels={LABELS} />);

    expect(amountFrom(onSelect, "25%")).toBe("0");
    expect(amountFrom(onSelect, "Max")).toBe("0.000000000000000001");
  });
});

describe("TradeSellShortcuts dead states", () => {
  /** Nothing to take a share of, so the row is dead rather than emitting a zero. */
  it("is dead on an empty balance", () => {
    const onSelect = vi.fn();
    render(<TradeSellShortcuts held={0n} decimals={6} onSelect={onSelect} labels={LABELS} />);

    for (const name of ["25%", "50%", "75%", "Max"]) {
      expect(pill(name)).toBeDisabled();
      fireEvent.click(pill(name));
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  /** A balance we cannot read covers nothing, so the row refuses to guess at it. */
  it("is dead on a balance that could not be read", () => {
    const onSelect = vi.fn();
    render(<TradeSellShortcuts held={null} decimals={6} onSelect={onSelect} labels={LABELS} />);

    for (const name of ["25%", "50%", "75%", "Max"]) {
      expect(pill(name)).toBeDisabled();
      fireEvent.click(pill(name));
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  /** Locked while an order is in flight, so the amount cannot move under a signature. */
  it("is dead while the caller has it disabled", () => {
    const onSelect = vi.fn();
    render(
      <TradeSellShortcuts
        held={1_000_003n}
        decimals={6}
        onSelect={onSelect}
        labels={LABELS}
        disabled
      />
    );

    for (const name of ["25%", "50%", "75%", "Max"]) {
      expect(pill(name)).toBeDisabled();
      fireEvent.click(pill(name));
    }
    expect(onSelect).not.toHaveBeenCalled();
  });
});
