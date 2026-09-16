import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { SpotSellShortcuts } from "@/features/trade/components/spot-sell-shortcuts";
import { toBaseUnits } from "@/lib/trade/math";

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

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

describe("SpotSellShortcuts", () => {
  /**
   * 1.000003 USDC. Every share but the half lands between two base units, so
   * this pins which way each one goes: down, to a whole base unit. 25% of it is
   * 250000.75 base units and must come out 250000, never 250001, because the
   * rounded-up version of a share is money the wallet may not have.
   */
  it("floors each share to a whole base unit", () => {
    const onSelect = vi.fn();
    renderWithIntl(<SpotSellShortcuts held={1_000_003n} decimals={6} onSelect={onSelect} />);

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
    renderWithIntl(<SpotSellShortcuts held={held} decimals={18} onSelect={onSelect} />);

    const amount = amountFrom(onSelect, "Max");
    expect(amount).toBe("123456789.012345678901234567");
    expect(toBaseUnits(amount, 18)).toBe(held);
  });

  /** The same holding through the fractions: exact integer maths, no rounding. */
  it("keeps full precision on a holding past what a float can hold", () => {
    const held = 123_456_789_012_345_678_901_234_567n;
    const onSelect = vi.fn();
    renderWithIntl(<SpotSellShortcuts held={held} decimals={18} onSelect={onSelect} />);

    expect(amountFrom(onSelect, "25%")).toBe("30864197.253086419725308641");
    expect(amountFrom(onSelect, "50%")).toBe("61728394.506172839450617283");
    expect(amountFrom(onSelect, "75%")).toBe("92592591.759259259175925925");
  });

  /**
   * The property that matters more than any single figure: no share may ever
   * come out above the balance, or the order is rejected at signing time.
   */
  it("never emits more than the wallet holds", () => {
    const holdings = [1n, 3n, 99n, 1_000_003n, 7_777_777_777_777_777_777n];
    const onSelect = vi.fn();

    for (const held of holdings) {
      renderWithIntl(<SpotSellShortcuts held={held} decimals={18} onSelect={onSelect} />);
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
    renderWithIntl(<SpotSellShortcuts held={held} decimals={18} onSelect={onSelect} />);

    for (const name of ["25%", "50%", "75%", "Max"]) {
      const amount = amountFrom(onSelect, name);
      expect(amount).toMatch(AMOUNT_FIELD);
      expect(amount).not.toContain("e");
    }
  });

  /** A sub-unit share rounds to nothing, and nothing is still a valid amount. */
  it("emits a plain zero when a share floors away to nothing", () => {
    const onSelect = vi.fn();
    renderWithIntl(<SpotSellShortcuts held={1n} decimals={18} onSelect={onSelect} />);

    expect(amountFrom(onSelect, "25%")).toBe("0");
    expect(amountFrom(onSelect, "Max")).toBe("0.000000000000000001");
  });

  /** Nothing to take a share of, so the row is dead rather than emitting a zero. */
  it("is dead on an empty balance", () => {
    const onSelect = vi.fn();
    renderWithIntl(<SpotSellShortcuts held={0n} decimals={6} onSelect={onSelect} />);

    for (const name of ["25%", "50%", "75%", "Max"]) {
      expect(pill(name)).toBeDisabled();
      fireEvent.click(pill(name));
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  /** A balance we cannot read covers nothing, so the row refuses to guess at it. */
  it("is dead on a balance that could not be read", () => {
    const onSelect = vi.fn();
    renderWithIntl(<SpotSellShortcuts held={null} decimals={6} onSelect={onSelect} />);

    for (const name of ["25%", "50%", "75%", "Max"]) {
      expect(pill(name)).toBeDisabled();
      fireEvent.click(pill(name));
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  /** Locked while an order is in flight, so the amount cannot move under a signature. */
  it("is dead while the caller has it disabled", () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <SpotSellShortcuts held={1_000_003n} decimals={6} onSelect={onSelect} disabled />
    );

    for (const name of ["25%", "50%", "75%", "Max"]) {
      expect(pill(name)).toBeDisabled();
      fireEvent.click(pill(name));
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  /**
   * Four pills that only say "25%" and "Max" are meaningless read one at a
   * time, so the row names what the share is a share of.
   */
  it("names what the pills take a share of", () => {
    renderWithIntl(<SpotSellShortcuts held={1_000_003n} decimals={6} onSelect={() => {}} />);
    expect(screen.getByRole("group", { name: "Sell a share of your balance" })).toBeInTheDocument();
  });
});
