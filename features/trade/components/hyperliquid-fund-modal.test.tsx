import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { DepositOutcome, DepositStage } from "@/features/trade/lib/hyperliquid-actions";
import { CctpFeeUnavailableError } from "@/features/trade/lib/cctp-transfers";

// Top up the perps wallet over CCTP (llms.txt §6a). The modal checks the amount
// against the exact Base USDC balance and the venue's minimum, shows a fee line
// only when the user pays for the mint relay, words each stage, and after the
// burn always says what happened, with a reference to trace it by.

const BURN = `0x${"b1".repeat(32)}`;

const fee = vi.hoisted(() => ({
  userPaysFee: false as boolean | null,
  maxFeeFor: vi.fn((): bigint | null => null),
}));
vi.mock("@/features/trade/hooks/use-cctp-deposit-fee", () => ({
  useCctpDepositFee: () => fee,
}));

vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ user: {} }) }));
vi.mock("@/lib/user", () => ({
  getWalletAddress: () => "0x00000000000000000000000000000000000000aA",
}));

const portfolio = vi.hoisted(() => ({
  tokens: [
    {
      network: "base-mainnet",
      symbol: "USDC",
      balance: 120.5,
      rawBalance: "120500000",
      decimals: 6,
    },
  ],
}));
vi.mock("@/hooks/use-portfolio", () => ({ usePortfolio: () => portfolio }));

import { HyperliquidFundModal } from "@/features/trade/components/hyperliquid-fund-modal";

const onDeposit = vi.fn();
const onFunded = vi.fn();

function renderModal(walletId: string | null = "wallet-1") {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HyperliquidFundModal
        open
        onClose={vi.fn()}
        walletId={walletId}
        onDeposit={onDeposit}
        onFunded={onFunded}
      />
    </NextIntlClientProvider>
  );
}

const amountField = () => screen.getByPlaceholderText("0");
const topUpButton = () => screen.getByRole("button", { name: "Top up" });

beforeEach(() => {
  onDeposit.mockReset();
  onFunded.mockReset();
  fee.userPaysFee = false;
  fee.maxFeeFor.mockReset().mockReturnValue(null);
});

describe("HyperliquidFundModal form", () => {
  it("shows the exact Base balance, and no fee line when the platform pays for the mint", () => {
    renderModal();
    expect(screen.getByText("120.5 USDC available")).toBeInTheDocument();
    fireEvent.change(amountField(), { target: { value: "25" } });
    expect(screen.queryByText(/Fee up to/)).toBeNull();
    expect(topUpButton()).toBeEnabled();
  });

  it("shows the most the transfer can cost, and the least that arrives, when the user pays", () => {
    fee.userPaysFee = true;
    fee.maxFeeFor.mockReturnValue(2_660n);
    renderModal();
    fireEvent.change(amountField(), { target: { value: "25" } });
    expect(
      screen.getByText("Fee up to 0.0027 USDC · at least 24.9973 USDC arrives")
    ).toBeInTheDocument();
  });

  it("refuses a top-up under the venue's minimum and one over the balance", () => {
    renderModal();
    fireEvent.change(amountField(), { target: { value: "5.99" } });
    expect(screen.getByText("The minimum top-up is 6 USDC.")).toBeInTheDocument();
    expect(topUpButton()).toBeDisabled();

    fireEvent.change(amountField(), { target: { value: "120.500001" } });
    expect(screen.getByText("More than your available 120.5 USDC.")).toBeInTheDocument();
    expect(topUpButton()).toBeDisabled();
  });

  it("says the wallet is not ready rather than letting a top-up start", () => {
    renderModal(null);
    fireEvent.change(amountField(), { target: { value: "25" } });
    expect(
      screen.getByText("Your perps wallet isn't ready yet. Try again in a moment.")
    ).toBeInTheDocument();
    expect(topUpButton()).toBeDisabled();
  });
});

describe("HyperliquidFundModal top-up", () => {
  async function startTopUp(outcome: DepositOutcome) {
    let report: ((stage: DepositStage) => void) | undefined;
    let finish: (() => void) | undefined;
    onDeposit.mockImplementation((_amount: string, onStage: (stage: DepositStage) => void) => {
      report = onStage;
      return new Promise<DepositOutcome>((resolve) => {
        finish = () => resolve(outcome);
      });
    });
    renderModal();
    fireEvent.change(amountField(), { target: { value: "25" } });
    fireEvent.click(topUpButton());
    expect(onDeposit).toHaveBeenCalledWith("25", expect.any(Function));
    return {
      report: (stage: DepositStage) => act(() => report?.(stage)),
      finish: () => act(async () => finish?.()),
    };
  }

  it("words each stage, then confirms the funds are ready to trade", async () => {
    const run = await startTopUp({ kind: "credited", burnTxHash: BURN });
    run.report("sending");
    expect(screen.getByText("Sending…")).toBeInTheDocument();
    run.report("confirming");
    expect(screen.getByText("Arriving in your perps wallet…")).toBeInTheDocument();
    await run.finish();

    expect(screen.getByText("Perps wallet funded")).toBeInTheDocument();
    expect(
      screen.getByText("25 USDC is in your perps wallet, ready to trade.")
    ).toBeInTheDocument();
    expect(onFunded).toHaveBeenCalled();
  });

  it("says a slow deposit is on its way, not that it failed", async () => {
    const run = await startTopUp({ kind: "pending", burnTxHash: BURN });
    await run.finish();
    expect(screen.getByText("On its way")).toBeInTheDocument();
  });

  it("gives a reference when the burn was sent but never registered", async () => {
    const run = await startTopUp({ kind: "recordFailed", burnTxHash: BURN });
    await run.finish();
    expect(screen.getByText("Deposit sent")).toBeInTheDocument();
    expect(screen.getByText(BURN)).toBeInTheDocument();
  });

  it("gives a reference when the deposit needs attention", async () => {
    const run = await startTopUp({ kind: "failed", burnTxHash: BURN, status: "stuck" });
    await run.finish();
    expect(screen.getByText("Deposit needs attention")).toBeInTheDocument();
    expect(screen.getByText(BURN)).toBeInTheDocument();
  });

  it("stays on the form with a clear message when the fee cannot be priced, nothing burned", async () => {
    onDeposit.mockRejectedValue(new CctpFeeUnavailableError());
    renderModal();
    fireEvent.change(amountField(), { target: { value: "25" } });
    await act(async () => fireEvent.click(topUpButton()));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The transfer fee is unavailable right now. Try again in a moment."
    );
    expect(topUpButton()).toBeEnabled();
    expect(onFunded).not.toHaveBeenCalled();
  });
});
