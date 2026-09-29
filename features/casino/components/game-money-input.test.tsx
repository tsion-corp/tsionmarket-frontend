// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameMoneyInput } from "./game-money-input";

const mockMoney = vi.hoisted(() => ({
  currency: { code: "NGN" },
  ready: true,
  toInput: (value: number) => (value * 1_600).toFixed(0),
  fromInput: (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed / 1_600 : null;
  },
}));

vi.mock("@/components/ui/currency-select", () => ({
  useMoney: () => mockMoney,
}));

function Fixture() {
  const [value, setValue] = useState("0.1");
  return (
    <>
      <GameMoneyInput
        aria-label="Stake"
        value={value}
        currencyDecimals={6}
        onValueChange={setValue}
      />
      <output>{value}</output>
      <button type="button" onClick={() => setValue("5")}>
        Preset
      </button>
    </>
  );
}

describe("GameMoneyInput", () => {
  beforeEach(() => {
    mockMoney.currency.code = "NGN";
  });

  it("displays the selected currency but stores canonical USDC", () => {
    render(<Fixture />);

    expect(screen.getByLabelText("Stake")).toHaveValue("160");
    fireEvent.change(screen.getByLabelText("Stake"), { target: { value: "3200" } });
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByLabelText("Stake")).toHaveValue("3200");
  });

  it("drops an edited currency draft when a canonical preset changes", () => {
    render(<Fixture />);

    fireEvent.change(screen.getByLabelText("Stake"), { target: { value: "3200" } });
    fireEvent.click(screen.getByRole("button", { name: "Preset" }));
    expect(screen.getByLabelText("Stake")).toHaveValue("8000");
  });
});
