import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const mocks = vi.hoisted(() => ({ funding: vi.fn(), deposit: vi.fn(), retry: vi.fn() }));
vi.mock("@/features/casino/hooks/use-arkjet-funding", () => ({
  useArkjetFunding: mocks.funding,
}));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({
    tokens: [
      { network: "base-mainnet", symbol: "USDC", address: "0xtoken", rawBalance: "1000000" },
    ],
    refetchFresh: vi.fn(),
  }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

import { ArkjetCashier } from "./arkjet-cashier";

function fundingState() {
  return {
    configured: true,
    configLoading: false,
    configUnavailable: false,
    configError: null,
    depositing: false,
    withdrawing: false,
    config: {
      currency: "USDC",
      currencyDecimalPlaces: 6,
      tokenDecimals: 6,
      tokenSymbol: "USDC",
      tokenAddress: "0xtoken",
      ledgerMinorPerUsdc: "1000000",
      withdrawalsEnabled: true,
      withdrawalFeeBps: 100,
    },
    deposit: mocks.deposit,
    retryConfig: mocks.retry,
  };
}

function mountCashier() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ArkjetCashier balance={null} minimumAmount="0.1" onClose={vi.fn()} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.funding.mockReturnValue(fundingState());
  mocks.deposit.mockResolvedValue({ txHash: "0xconfirmed", credited: "0.1" });
});

describe("USDC cashier", () => {
  it("blocks sub-minimum and excess-precision amounts, then sends native USDC", async () => {
    mountCashier();
    const input = screen.getByPlaceholderText("0.10");
    const submit = screen.getByRole("button", { name: "Transfer USDC and add funds" });
    fireEvent.change(input, { target: { value: "0.099999" } });
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: "0.1000001" } });
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: "0.100000" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.deposit).toHaveBeenCalledWith("0.1"));
    expect(screen.queryByText(/NGN/)).not.toBeInTheDocument();
  });

  it("offers retry for a network outage without calling the vault disabled", () => {
    mocks.funding.mockReturnValue({
      ...fundingState(),
      configured: false,
      config: null,
      configError: new Error("outage"),
    });
    mountCashier();
    expect(screen.getByText("Wallet funding is temporarily unavailable.")).toBeInTheDocument();
    expect(screen.queryByText(/disabled on this deployment/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.retry).toHaveBeenCalledTimes(1);
  });

  it("shows the unconfigured state only when funding explicitly reports it", () => {
    mocks.funding.mockReturnValue({
      ...fundingState(),
      configured: false,
      config: null,
      configUnavailable: true,
    });
    mountCashier();
    expect(screen.getByText(/USDC vault is configured/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Transfer USDC and add funds" })
    ).not.toBeInTheDocument();
  });
});
