import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WithdrawModal } from "@/features/funds/components/withdraw-modal";
import messages from "@/messages/en.json";

// The two destination screens pull in wallets and live queries, which this
// test has no interest in: what matters is which of them the modal reaches.
vi.mock("@/features/funds/components/crypto-withdraw-screen", () => ({
  CryptoWithdrawScreen: ({ onBack }: { onBack: () => void }) => (
    <button onClick={onBack}>crypto screen</button>
  ),
}));
vi.mock("@/features/funds/components/bank-withdraw-screen", () => ({
  BankWithdrawScreen: () => <div>bank screen</div>,
}));
vi.mock("@/features/funds/components/paycrest-withdraw-screen", () => ({
  PaycrestWithdrawScreen: () => <div>paycrest bank screen</div>,
}));

const flag = vi.hoisted(() => ({ enabled: false, rail: "paycrest" }));
vi.mock("@/features/funds/lib/flags", () => ({
  get BANK_WITHDRAW_ENABLED() {
    return flag.enabled;
  },
  get BANK_RAIL() {
    return flag.rail;
  },
}));

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WithdrawModal onClose={onClose} />
    </NextIntlClientProvider>
  );
  return onClose;
}

afterEach(() => {
  flag.enabled = false;
  flag.rail = "paycrest";
});

describe("WithdrawModal with bank withdrawal disabled", () => {
  it("keeps the external wallet tile and drops only the bank one", () => {
    renderModal();
    expect(screen.getByText("To external wallet")).toBeInTheDocument();
    expect(screen.queryByText("To bank")).not.toBeInTheDocument();
  });

  it("still reaches the crypto screen from the chooser", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /To external wallet/ }));
    expect(screen.getByText("crypto screen")).toBeInTheDocument();
  });
});

describe("WithdrawModal with bank withdrawal enabled", () => {
  it("offers both methods again", () => {
    flag.enabled = true;
    renderModal();
    expect(screen.getByText("To bank")).toBeInTheDocument();
    expect(screen.getByText("To external wallet")).toBeInTheDocument();
  });
});

describe("WithdrawModal bank rail", () => {
  it("opens the Paycrest screen when Paycrest is the rail", () => {
    flag.enabled = true;
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /To bank/ }));
    expect(screen.getByText("paycrest bank screen")).toBeInTheDocument();
  });

  it("falls back to the previous screen when the rail is switched back", () => {
    flag.enabled = true;
    flag.rail = "ramping";
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /To bank/ }));
    expect(screen.getByText("bank screen")).toBeInTheDocument();
  });
});
