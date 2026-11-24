import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/features/funds/components/crypto-deposit-screen", () => ({
  CryptoDepositScreen: ({ settleKey }: { settleKey?: string }) => (
    <div>crypto deposit screen {settleKey ?? "base"}</div>
  ),
}));
vi.mock("@/features/funds/components/bank-transfer-screen", () => ({
  BankTransferScreen: () => <div>bank screen</div>,
}));
vi.mock("@/features/funds/components/paycrest-deposit-screen", () => ({
  PaycrestDepositScreen: () => <div>paycrest deposit screen</div>,
}));
vi.mock("@/features/funds/components/add-wsk-screen", () => ({
  AddWskScreen: () => <div>usdc kash screen</div>,
}));
vi.mock("@/features/funds/components/buy-kash-naira-screen", () => ({
  BuyKashNairaScreen: () => <div>naira kash screen</div>,
}));
vi.mock("@/components/ui/asset-icon", () => ({ AssetIcon: () => null }));

import { FundsModal } from "./funds-modal";

afterEach(cleanup);

describe("FundsModal", () => {
  it("opens on the choice of ways to add funds, not on a deposit screen", () => {
    render(<FundsModal onClose={vi.fn()} />);
    expect(screen.queryByText(/crypto deposit screen/i)).not.toBeInTheDocument();
    expect(screen.getByText("cryptoTitle")).toBeInTheDocument();
    expect(screen.getByText("bankTitle")).toBeInTheDocument();
    expect(screen.getByText("Add Kash")).toBeInTheDocument();
  });

  it("opens straight on the crypto screen only for a spoken deposit", () => {
    render(<FundsModal onClose={vi.fn()} deposit={{ chain: "base" } as never} />);
    expect(screen.getByText(/crypto deposit screen base/i)).toBeInTheDocument();
  });

  it("lists the ways to add Kash, and each leads to its own screen", () => {
    render(<FundsModal onClose={vi.fn()} startAt="kash" />);
    expect(screen.getByText("Pay with USDC")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Pay with naira"));
    expect(screen.getByText("naira kash screen")).toBeInTheDocument();
  });

  it("reaches the Kash options from the general sheet too", () => {
    render(<FundsModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Add Kash"));
    fireEvent.click(screen.getByText("Pay with USDC"));
    expect(screen.getByText("usdc kash screen")).toBeInTheDocument();
  });

  it("sends the bank tile to Paycrest, the bank rail for deposits", () => {
    render(<FundsModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("bankTitle"));
    expect(screen.getByText("paycrest deposit screen")).toBeInTheDocument();
  });
});
