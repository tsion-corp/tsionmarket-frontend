import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { HyperliquidWithdrawModal } from "@/features/trade/components/hyperliquid-withdraw-modal";
import type { WithdrawStep } from "@/features/trade/lib/hyperliquid-actions";

// Withdraw from the perps wallet (llms.txt §6b). The typed amount is the total
// that leaves; the modal shows one combined fee and what arrives, refuses a
// total the fees would swallow, never lets Max pass the free balance, and says
// in the user's language what the withdrawal is doing.

const onWithdraw = vi.fn();
const onWithdrawn = vi.fn();
const onClose = vi.fn();

function renderModal(availableUsdc = "250.75") {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HyperliquidWithdrawModal
        open
        onClose={onClose}
        walletId="wallet-1"
        availableUsdc={availableUsdc}
        onWithdraw={onWithdraw}
        onWithdrawn={onWithdrawn}
      />
    </NextIntlClientProvider>
  );
}

const amountField = () => screen.getByPlaceholderText("0");
const withdrawButton = () => screen.getByRole("button", { name: "Withdraw" });

beforeEach(() => {
  onWithdraw.mockReset();
  onWithdrawn.mockReset();
  onClose.mockReset();
});

describe("HyperliquidWithdrawModal", () => {
  it("shows the exact free balance and one combined fee with what arrives", () => {
    renderModal();
    expect(screen.getByText("250.75 USDC available")).toBeInTheDocument();
    fireEvent.change(amountField(), { target: { value: "100" } });
    expect(screen.getByText("Fee 1.5 USDC · you'll receive 98.5 USDC")).toBeInTheDocument();
    expect(withdrawButton()).toBeEnabled();
  });

  it("refuses more than the free balance", () => {
    renderModal("20");
    fireEvent.change(amountField(), { target: { value: "20.01" } });
    expect(screen.getByText("More than your available 20 USDC.")).toBeInTheDocument();
    expect(withdrawButton()).toBeDisabled();
  });

  it("refuses a total the fees would swallow", () => {
    renderModal();
    fireEvent.change(amountField(), { target: { value: "1.5" } });
    expect(screen.getByText("The minimum withdrawal is more than 1.5 USDC.")).toBeInTheDocument();
    expect(withdrawButton()).toBeDisabled();
  });

  it("fills Max with the whole free balance, to the cent and never above it", () => {
    renderModal("42.429999");
    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(amountField()).toHaveValue("42.42");
  });

  it("sends the typed total and puts each step into words", async () => {
    let report: ((step: WithdrawStep) => void) | undefined;
    let finish: (() => void) | undefined;
    onWithdraw.mockImplementation((_total: string, onStatus: (step: WithdrawStep) => void) => {
      report = onStatus;
      return new Promise<{ treasuryMovementId: string }>((resolve) => {
        finish = () => resolve({ treasuryMovementId: "movement-1" });
      });
    });
    renderModal();
    fireEvent.change(amountField(), { target: { value: "100" } });
    fireEvent.click(withdrawButton());

    expect(onWithdraw).toHaveBeenCalledWith("100", expect.any(Function));
    expect(await screen.findByText("Withdrawing…")).toBeInTheDocument();
    act(() => report?.("moving"));
    expect(screen.getByText("Moving funds to your main wallet…")).toBeInTheDocument();

    await act(async () => finish?.());
    expect(await screen.findByText("Funds on the way")).toBeInTheDocument();
    expect(
      screen.getByText(
        "98.5 USDC is moving to your main wallet. It should arrive within a few minutes."
      )
    ).toBeInTheDocument();
    expect(onWithdrawn).toHaveBeenCalled();
  });

  it("shows a failure without the venue's name, and lets the reader try again", async () => {
    onWithdraw.mockRejectedValue(new Error("Hyperliquid rejected the withdrawal"));
    renderModal();
    fireEvent.change(amountField(), { target: { value: "100" } });
    fireEvent.click(withdrawButton());

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).not.toMatch(/hyper/i);
    expect(withdrawButton()).toBeEnabled();
  });
});
