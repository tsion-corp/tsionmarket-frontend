// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArkjetRound } from "../../lib/api/arkjet";
import { ArkjetBetCard, type ArkjetBetCardProps } from "./arkjet-bet-card";

vi.mock("@/lib/toast", () => ({
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const mockMoney = vi.hoisted(() => ({
  currency: { code: "USD" },
  ready: true,
  format: (value: number) => `$${value.toFixed(2)}`,
  formatExact: (value: number) => `$${value.toFixed(2)}`,
  toInput: (value: number) => value.toFixed(2),
  fromInput: (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  },
}));

vi.mock("@/components/ui/currency-select", () => ({
  useMoney: () => mockMoney,
}));

const round: ArkjetRound = {
  roundId: "round-usdc",
  sequence: 1,
  status: "COMMITTED",
  algorithmVersion: "arkjet-v10",
  serverSeedCommitment: "0".repeat(64),
  currentMultiplier: null,
  committedAt: "2026-09-16T00:00:00Z",
  bettingClosesAt: "2026-09-16T00:01:00Z",
  lockedAt: null,
  runningAt: null,
  revealedAt: null,
  cancellationReason: null,
};

function mountCard({
  availableBalance = "10",
  onFund = vi.fn(),
  onPlace = vi.fn(),
}: {
  availableBalance?: string;
  onFund?: (amount: string) => void;
  onPlace?: ArkjetBetCardProps["onPlace"];
} = {}) {
  return render(
    <ArkjetBetCard
      slot={1}
      round={round}
      currency="USDC"
      minimumAmount="0.1"
      minimumCashoutMultiplier="1.10"
      maximumCashoutMultiplier="100"
      activeBet={null}
      wageringEnabled
      settlementEnabled
      authenticated
      authReady
      busy={false}
      availableBalance={availableBalance}
      onLogin={vi.fn()}
      onFund={onFund}
      onPlace={onPlace}
      onCancel={vi.fn()}
      onCashout={vi.fn()}
    />
  );
}

beforeEach(() => {
  mockMoney.currency.code = "USD";
});

afterEach(cleanup);

describe("USDC ticket controls", () => {
  it("offers exact 1, 2, 5, and 10 USDC presets", () => {
    mountCard();
    for (const amount of ["1", "2", "5", "10"]) {
      fireEvent.click(screen.getByRole("button", { name: `$${amount}.00` }));
      expect(screen.getByLabelText("Ticket 1 amount")).toHaveValue(`${amount}.00`);
    }
  });

  it("preserves six-decimal amounts when increasing a ticket", () => {
    mountCard();
    fireEvent.change(screen.getByLabelText("Ticket 1 amount"), { target: { value: "0.123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Increase ticket 1" }));
    expect(screen.getByLabelText("Ticket 1 amount")).toHaveValue("0.223456");
  });

  it("blocks less than 0.1 USDC and accepts the minimum", () => {
    mountCard();
    fireEvent.change(screen.getByLabelText("Ticket 1 amount"), { target: { value: "0.099999" } });
    expect(screen.getByRole("button", { name: /Submit Ticket/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Ticket 1 amount"), { target: { value: "0.1" } });
    expect(screen.getByRole("button", { name: /Submit Ticket/ })).toBeEnabled();
  });

  it("opens funding instead of submitting when playable balance is too low", () => {
    const onFund = vi.fn();
    const onPlace = vi.fn();
    mountCard({ availableBalance: "0", onFund, onPlace });

    fireEvent.click(screen.getByRole("button", { name: /Add funds to play/ }));

    expect(onFund).toHaveBeenCalledWith("0.1");
    expect(onPlace).not.toHaveBeenCalled();
  });
});
