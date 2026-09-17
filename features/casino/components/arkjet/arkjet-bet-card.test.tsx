// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArkjetRound } from "../../lib/api/arkjet";
import { ArkjetBetCard } from "./arkjet-bet-card";

vi.mock("@/lib/toast", () => ({
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
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

function mountCard() {
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
      onLogin={vi.fn()}
      onPlace={vi.fn()}
      onCancel={vi.fn()}
      onCashout={vi.fn()}
    />
  );
}

afterEach(cleanup);

describe("USDC ticket controls", () => {
  it("offers exact 1, 2, 5, and 10 USDC presets", () => {
    mountCard();
    for (const amount of ["1", "2", "5", "10"]) {
      fireEvent.click(screen.getByRole("button", { name: amount }));
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
});
