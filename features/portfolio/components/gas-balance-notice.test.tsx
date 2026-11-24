import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const state = vi.hoisted(() => ({ sponsored: true, ethUsd: 0, loading: false }));
const openDeposit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/trade/sponsored-evm", () => ({
  hasGasPolicyForNetwork: (network: string) => network === "base-mainnet" && state.sponsored,
}));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({
    loading: state.loading,
    tokens: [{ network: "base-mainnet", address: null, symbol: "ETH", valueUsd: state.ethUsd }],
  }),
}));
vi.mock("@/components/layout/modals/app-modals", () => ({
  useAppModals: () => ({ openDeposit }),
}));

import { GasBalanceNotice } from "./gas-balance-notice";

function renderNotice() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GasBalanceNotice />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  state.sponsored = true;
  state.ethUsd = 0;
  state.loading = false;
  openDeposit.mockReset();
});
afterEach(cleanup);

describe("GasBalanceNotice", () => {
  it("shows nothing while Base sends are sponsored, even with no ETH", () => {
    const { container } = renderNotice();
    expect(container).toBeEmptyDOMElement();
  });

  it("asks for ETH when Base is user-paid and the balance is low", () => {
    state.sponsored = false;
    state.ethUsd = 0.2;
    renderNotice();
    expect(screen.getByText("Gas balance (Base)")).toBeInTheDocument();
    expect(screen.getByText(messages.portfolio.gasBalanceLowBody)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add ETH" }));
    expect(openDeposit).toHaveBeenCalledWith({ chain: "Base", token: "ETH" });
  });

  it("shows the balance without a warning once there is enough", () => {
    state.sponsored = false;
    state.ethUsd = 3;
    renderNotice();
    expect(screen.getByText("Gas balance (Base)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add ETH" })).not.toBeInTheDocument();
  });

  it("waits for the portfolio before saying anything", () => {
    state.sponsored = false;
    state.loading = true;
    const { container } = renderNotice();
    expect(container).toBeEmptyDOMElement();
  });
});
