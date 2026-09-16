import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  available: "0",
  locked: "0",
  total: "0",
  withdrawing: false,
  withdraw: vi.fn(),
  refetchUntilChanged: vi.fn(),
}));

vi.mock("@/components/ui/balance-visibility", () => ({
  useBalanceVisibility: () => ({ mask: (value: string) => value }),
}));

vi.mock("@/components/ui/currency-select", () => ({
  useMoney: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));

vi.mock("@/components/ui/modal-shell", () => ({
  ModalShell: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

vi.mock("@/components/ui/sheet-nav", () => ({
  SheetNav: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </header>
  ),
}));

vi.mock("@/features/casino/hooks/use-chess-cashier", () => ({
  useChessCashierWithdrawal: () => ({
    configured: true,
    available: state.available,
    locked: state.locked,
    total: state.total,
    withdrawing: state.withdrawing,
    withdraw: state.withdraw,
    config: { withdrawalFeeBps: 300 },
  }),
}));

vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({ refetchUntilChanged: state.refetchUntilChanged }),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    loading: vi.fn(() => "toast"),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { LegacyChessBalance } from "@/features/casino/components/chess-app/legacy-chess-balance";

describe("LegacyChessBalance", () => {
  beforeEach(() => {
    state.available = "0";
    state.locked = "0";
    state.total = "0";
    state.withdrawing = false;
    state.withdraw.mockReset().mockResolvedValue({ status: "submitted" });
    state.refetchUntilChanged.mockReset().mockResolvedValue(true);
  });

  it("stays out of the navigation when no legacy funds are available", () => {
    render(<LegacyChessBalance />);

    expect(screen.queryByText("In play")).not.toBeInTheDocument();
  });

  it("remains visible while legacy funds are locked", () => {
    state.locked = "0.01062";
    state.total = "0.01062";
    render(<LegacyChessBalance />);

    fireEvent.click(screen.getByRole("button", { name: /legacy in-play balance/i }));

    expect(screen.getByRole("button", { name: "Funds are still locked" })).toBeDisabled();
  });

  it("moves the full available legacy balance to the profile", async () => {
    state.available = "0.01";
    state.locked = "0.01062";
    state.total = "0.02062";
    render(<LegacyChessBalance />);

    fireEvent.click(screen.getByRole("button", { name: /legacy in-play balance/i }));
    fireEvent.click(screen.getByRole("button", { name: "Move 0.01 USD to profile" }));

    await waitFor(() => expect(state.withdraw).toHaveBeenCalledWith("0.01"));
    expect(state.refetchUntilChanged).toHaveBeenCalledOnce();
  });
});
